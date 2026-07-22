/**
 * The week's meal plan (→ SPEC §4.1–4.2).
 *
 * One dinner slot per day, enforced by `UNIQUE(householdId, date)` in the
 * schema, so "plan a meal on a day that already has one" is an upsert rather
 * than a check-then-write that two phones could both pass
 * (→ docs/DATA-MODEL.md → meals).
 *
 * A planned meal is either a recipe or a free-text title, and `title` doubles
 * as the recipe's name snapshot: deleting a recipe blanks `recipeId` but leaves
 * the plan readable. Everything that renders a meal therefore reads the live
 * recipe name first and falls back to the snapshot — including Home's dinner
 * card, which does the same in `home.ts`.
 */
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import {
	addDays,
	dayOfMonth,
	formatMonthRange,
	formatWeekdayShort,
	startOfWeek,
	type CalendarDate
} from '$lib/utils/dates';
import type { PlanMealInput } from '$lib/utils/recipes';
import { db } from '../db';
import { meals, members, recipeIngredients, recipes } from '../db/schema';
import { addIngredients } from './shopping';

export type PlannedMeal = {
	id: string;
	date: CalendarDate;
	/** What the row shows: the live recipe name, else the title snapshot. */
	name: string;
	/** Set only while the recipe still exists — the row links to it. */
	recipeId: string | null;
	imagePath: string | null;
	/** The free-text title, so the sheet reopens on what was typed. */
	title: string | null;
	cook: { id: string; displayName: string; color: string } | null;
};

export type WeekDay = {
	date: CalendarDate;
	/** "MON" — the strip's and the row's label. */
	weekday: string;
	/** "14" — the strip's number. */
	dayOfMonth: string;
	isToday: boolean;
	meal: PlannedMeal | null;
};

export type MealWeek = {
	/** Monday → Sunday (→ SPEC §8). v1 shows the current week only. */
	days: WeekDay[];
	/** "July", or "Jun – Jul" when the week straddles the turn of the month. */
	monthLabel: string;
};

/* ── Reading ──────────────────────────────────────────────────────────────── */

export function getWeek(householdId: string, today: CalendarDate): MealWeek {
	const from = startOfWeek(today);
	const to = addDays(from, 6);
	const planned = listMeals(householdId, from, to);
	const byDate = new Map(planned.map((meal) => [meal.date, meal]));

	const days = Array.from({ length: 7 }, (_, offset) => {
		const date = addDays(from, offset);
		return {
			date,
			weekday: formatWeekdayShort(date),
			dayOfMonth: dayOfMonth(date),
			isToday: date === today,
			meal: byDate.get(date) ?? null
		};
	});

	return { days, monthLabel: formatMonthRange(from, to) };
}

/** Every planned meal in a date range, in calendar order. */
function listMeals(householdId: string, from: CalendarDate, to: CalendarDate): PlannedMeal[] {
	const rows = db
		.select({
			id: meals.id,
			date: meals.date,
			title: meals.title,
			recipeId: meals.recipeId,
			recipeName: recipes.name,
			imagePath: recipes.imagePath,
			cookId: members.id,
			cookName: members.displayName,
			cookColor: members.color
		})
		.from(meals)
		.leftJoin(recipes, eq(meals.recipeId, recipes.id))
		.leftJoin(members, eq(meals.cookMemberId, members.id))
		.where(and(eq(meals.householdId, householdId), gte(meals.date, from), lte(meals.date, to)))
		.orderBy(asc(meals.date))
		.all();

	return rows.flatMap((row) => {
		const name = row.recipeName ?? row.title;
		// Neither a recipe nor a title left: a row the app can't render and
		// shouldn't pretend to. `planMeal` never writes one.
		if (!name) return [];

		return [
			{
				id: row.id,
				date: row.date,
				name,
				recipeId: row.recipeName ? row.recipeId : null,
				imagePath: row.imagePath,
				title: row.title,
				cook:
					row.cookId && row.cookName && row.cookColor
						? { id: row.cookId, displayName: row.cookName, color: row.cookColor }
						: null
			}
		];
	});
}

/* ── Writing ──────────────────────────────────────────────────────────────── */

export type PlanResult = {
	/** False when there was nothing to write — the caller must not report success. */
	planned: boolean;
	/** How the ingredients toggle went; null when it wasn't asked for. */
	shopping: { added: number; skipped: number } | null;
};

/**
 * Plan (or replace) the meal on a day. Ids that don't belong to this household
 * are dropped rather than rejected: a recipe a housemate deleted while the
 * sheet was open becomes the free-text meal it was named after, which is closer
 * to what was meant than an error over a dinner.
 */
export function planMeal(householdId: string, memberId: string, input: PlanMealInput): PlanResult {
	const recipe = input.recipeId ? findRecipe(householdId, input.recipeId) : null;
	const cookMemberId = findMember(householdId, input.cookMemberId);

	// With a recipe, `title` is its live name as the snapshot (→ the file header);
	// without one it's what was typed, which for a vanished recipe is the name the
	// sheet posted alongside its id. Only a forged post with neither gets here.
	const title = recipe ? recipe.name : input.title;
	if (!title) return { planned: false, shopping: null };

	db.insert(meals)
		.values({
			householdId,
			date: input.date,
			recipeId: recipe?.id ?? null,
			title,
			cookMemberId,
			createdByMemberId: memberId
		})
		.onConflictDoUpdate({
			target: [meals.householdId, meals.date],
			set: {
				recipeId: recipe?.id ?? null,
				title,
				cookMemberId,
				// Whoever planned it last is who planned it.
				createdByMemberId: memberId
			}
		})
		.run();

	// Deliberately outside the upsert: adding to the shopping list is its own
	// transaction and sends its own notification, and a meal that got planned
	// without its ingredients is far better than neither.
	const shopping =
		input.addIngredients && recipe
			? addIngredientsToShopping(householdId, memberId, recipe.id)
			: null;

	return { planned: true, shopping };
}

export function removeMeal(householdId: string, date: CalendarDate): boolean {
	return (
		db
			.delete(meals)
			.where(and(eq(meals.householdId, householdId), eq(meals.date, date)))
			.run().changes > 0
	);
}

/**
 * "Add ingredients to shopping list" [3d] and "Add all to list" [7a]. The
 * dedupe rule lives in the shopping service, where the list is: matched against
 * *unchecked* items by case-insensitive name, matches skipped
 * (→ `services/shopping.ts`).
 */
export function addIngredientsToShopping(
	householdId: string,
	memberId: string,
	recipeId: string
): { added: number; skipped: number } {
	// Joined through `recipes` so the household filter reaches the ingredients,
	// which carry no householdId of their own.
	const ingredients = db
		.select({
			name: recipeIngredients.name,
			quantity: recipeIngredients.quantity,
			unit: recipeIngredients.unit
		})
		.from(recipeIngredients)
		.innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
		.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
		.orderBy(asc(recipeIngredients.sortOrder), asc(recipeIngredients.id))
		.all();

	if (!ingredients.length) return { added: 0, skipped: 0 };

	// No `storeId`: ingredients land where quick-add sends things, the topmost
	// store (→ SPEC §4.2 "each to the default store").
	return addIngredients(householdId, memberId, ingredients);
}

/* ── Ownership checks ─────────────────────────────────────────────────────── */

function findRecipe(householdId: string, recipeId: string): { id: string; name: string } | null {
	return (
		db
			.select({ id: recipes.id, name: recipes.name })
			.from(recipes)
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.get() ?? null
	);
}

function findMember(householdId: string, memberId: string | null): string | null {
	if (!memberId) return null;

	const member = db
		.select({ id: members.id })
		.from(members)
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.get();

	return member?.id ?? null;
}
