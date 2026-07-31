/**
 * The bridge between a recipe and the shopping list (→ SPEC §4.8).
 *
 * A recipe is not a shopping list: half of it is already in the cupboard, and
 * the half that isn't often overlaps with what a second recipe wants this week.
 * So nothing is poured over silently any more. Both doors — the basket on a
 * recipe [7a] and the toggle on the plan sheet [3d] — end at the picker [3e],
 * which is what `buildIngredientPick` fills in and `addRecipeIngredients` acts
 * on (→ DECISIONS #123).
 *
 * The preview and the write share `planAdds` and read the list through the same
 * `listOpenItems`, so "this will make it 4 cucumbers" and what actually lands on
 * the list are the same sentence computed twice, not two rules kept in step.
 */
import { and, asc, eq } from 'drizzle-orm';
import { planAdds, suggestionKey, type AddEffect, type Amount } from '$lib/utils/shopping';
import { db } from '../db';
import { recipeIngredients, recipes } from '../db/schema';
import { listStapleKeys, rememberStaples } from './pantry';
import { addIngredients, listOpenItems, type IngredientAddResult } from './shopping';

/** One line of the picker: the ingredient, and what adding it would do. */
export type IngredientPickRow = {
	/** `recipe_ingredients.id` — what the sheet ticks and posts back. */
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	effect: AddEffect;
	/** What the list would say about it afterwards. */
	result: Amount;
	/** The household keeps leaving this off, so it opens unticked (→ `pantry`). */
	staple: boolean;
	/** Ticked when the sheet opens. */
	selected: boolean;
};

export type IngredientPick = {
	recipeId: string;
	/** The sheet's title — the recipe these came from. */
	recipeName: string;
	rows: IngredientPickRow[];
};

/**
 * The picker's contents, or null when there is no sheet to show — the recipe
 * belongs to another household, has been deleted, or has no ingredients in it.
 */
export function buildIngredientPick(householdId: string, recipeId: string): IngredientPick | null {
	const recipe = findRecipe(householdId, recipeId);
	if (!recipe) return null;

	const ingredients = listIngredients(householdId, recipeId);
	if (!ingredients.length) return null;

	const plan = planAdds(listOpenItems(householdId), ingredients);
	const staples = listStapleKeys(householdId);

	const rows = ingredients.map((ingredient, index) => {
		const planned = plan.rows[index];
		const staple = staples.has(suggestionKey(ingredient.name));

		return {
			id: ingredient.id,
			name: ingredient.name,
			quantity: ingredient.quantity,
			unit: ingredient.unit,
			effect: planned.effect,
			result: planned.result,
			staple,
			// Everything that would change the list, minus what the cupboard
			// already holds. Something already on the list opens unticked too:
			// ticking it would do nothing, and a count that promises four items
			// and moves two is worse than no count.
			selected: planned.effect !== 'have' && !staple
		};
	});

	return { recipeId: recipe.id, recipeName: recipe.name, rows };
}

export type IngredientPickSubmission = {
	recipeId: string;
	/** The rows that were ticked. */
	chosen: string[];
	/**
	 * The rows the sheet opened *with* ticked. An untick only means "we have
	 * that at home" against this — a row left alone because it was already on the
	 * list says nothing about the cupboard (→ `services/pantry`).
	 */
	offered: string[];
};

/**
 * What the picker submits: the chosen ingredients onto the list, and one
 * lesson about the ones that were declined. Null when the recipe isn't this
 * household's — which a deleted recipe and a forged id answer identically.
 */
export function addRecipeIngredients(
	householdId: string,
	memberId: string,
	submission: IngredientPickSubmission
): IngredientAddResult | null {
	if (!findRecipe(householdId, submission.recipeId)) return null;

	const ingredients = listIngredients(householdId, submission.recipeId);
	const chosen = new Set(submission.chosen);
	const offered = new Set(submission.offered);

	const wanted = ingredients.filter((ingredient) => chosen.has(ingredient.id));

	// No `storeId`: ingredients land where quick-add sends things, the topmost
	// store (→ SPEC §4.2 "each to the default store").
	const result = addIngredients(householdId, memberId, wanted);

	rememberStaples(householdId, {
		bought: wanted.map((ingredient) => ingredient.name),
		left: ingredients
			.filter((ingredient) => offered.has(ingredient.id) && !chosen.has(ingredient.id))
			.map((ingredient) => ingredient.name)
	});

	return result;
}

/* ── Reading the recipe ───────────────────────────────────────────────────── */

function findRecipe(householdId: string, recipeId: string): { id: string; name: string } | null {
	return (
		db
			.select({ id: recipes.id, name: recipes.name })
			.from(recipes)
			.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
			.get() ?? null
	);
}

/**
 * A recipe's ingredients in its own order. Joined through `recipes` so the
 * household filter reaches them — they carry no `householdId` of their own.
 */
function listIngredients(householdId: string, recipeId: string) {
	return db
		.select({
			id: recipeIngredients.id,
			name: recipeIngredients.name,
			quantity: recipeIngredients.quantity,
			unit: recipeIngredients.unit
		})
		.from(recipeIngredients)
		.innerJoin(recipes, eq(recipeIngredients.recipeId, recipes.id))
		.where(and(eq(recipes.id, recipeId), eq(recipes.householdId, householdId)))
		.orderBy(asc(recipeIngredients.sortOrder), asc(recipeIngredients.id))
		.all();
}
