/**
 * What the cooking tab's two halves — the recipe library and the meal plan —
 * need to agree on across the wire: field limits (the `maxlength` attribute and
 * the action's guard are the same number), the plan sheet's payload, and the
 * plain text a shared recipe turns into.
 *
 * `readPlanForm` lives here rather than in either page because **two** routes
 * plan a meal: the week [04] and a recipe's "Add to plan" [7a]. One reader, one
 * set of rules, two thin actions (→ docs/ARCHITECTURE.md "Server patterns").
 */
import type { Messages } from '$lib/i18n';
import { isCalendarDate, type CalendarDate } from './dates';

/* ── Field limits ─────────────────────────────────────────────────────────── */

export const RECIPE_NAME_MAX = 80;
/** One typed ingredient line, e.g. "400 g pasta" (→ `parseIngredient`). */
export const INGREDIENT_LINE_MAX = 90;
export const STEP_TEXT_MAX = 600;
export const RECIPE_TIME_MAX = 999;
export const RECIPE_SERVINGS_MAX = 99;
/** Anything past these is a paste accident; the form never offers that many. */
export const INGREDIENTS_MAX = 60;
export const STEPS_MAX = 40;
/** "Cook something not saved" [3d]. */
export const MEAL_TITLE_MAX = 80;

/* ── Rendering ────────────────────────────────────────────────────────────── */

/**
 * Where a stored photo is read from. Every segment is encoded separately so the
 * slashes survive as slashes — the endpoint takes the path as a rest parameter
 * and looks the whole thing up as `recipes.imagePath`.
 */
export function uploadUrl(imagePath: string): string {
	return `/api/uploads/${imagePath.split('/').map(encodeURIComponent).join('/')}`;
}

/* ── The recipe form's payload ────────────────────────────────────────────── */

/**
 * What [3c] posts: lines and text, not columns. Ingredients stay freeform all
 * the way to the service, which parses them (→ `$lib/utils/ingredients`).
 *
 * Declared here rather than beside the service so the reader below — and the
 * form itself — can name it without importing anything from `$lib/server`.
 */
export type RecipeInput = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	ingredientLines: string[];
	steps: string[];
};

/**
 * Which field a rejected save is about. The form has two things that can be
 * refused — the name and the photo — and they sit far apart on a full-screen
 * form, so the message has to say which one it means rather than reddening
 * whichever field happens to take the `error` prop.
 */
export type RecipeFormField = 'name' | 'photo';

export type RecipeFormError = { error: string; field: RecipeFormField };

/**
 * The recipe form's fields, validated. Clamping is the service's business.
 *
 * Takes the catalog because a refusal is copy: the action passes
 * `catalog(event.locals.locale)` so the message comes back in the language the
 * form was filled in (→ `$lib/i18n`).
 */
export function readRecipeForm(
	form: FormData,
	m: Messages
): { input: RecipeInput } | RecipeFormError {
	const name = String(form.get('name') ?? '').trim();
	if (!name) return { error: m.errors.recipes.name, field: 'name' };
	if (name.length > RECIPE_NAME_MAX) {
		return { error: m.errors.recipes.nameTooLong(RECIPE_NAME_MAX), field: 'name' };
	}

	return {
		input: {
			name,
			timeMinutes: readOptionalNumber(form.get('timeMinutes')),
			servings: readOptionalNumber(form.get('servings')),
			// `getAll` preserves DOM order, which is the order the rows were
			// dragged into — so `sortOrder` is simply the index.
			ingredientLines: form.getAll('ingredient').map(String),
			steps: form.getAll('step').map(String)
		}
	};
}

/** Empty means "not stated", which both fields allow; nonsense means the same. */
function readOptionalNumber(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export type ShareableRecipe = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	ingredients: { name: string; quantity: number | null; unit: string | null }[];
	steps: string[];
};

/**
 * A recipe as plain text for the OS share sheet [7c]. v1 shares the recipe
 * itself rather than a link, because a link would have to be a public route
 * with a token and this app has no public data (→ DECISIONS "Open questions").
 */
export function recipeShareText(recipe: ShareableRecipe, m: Messages): string {
	const meta = [
		recipe.timeMinutes ? m.cooking.cookTime(recipe.timeMinutes) : null,
		recipe.servings ? m.cooking.serves(recipe.servings) : null
	]
		.filter(Boolean)
		.join(' · ');

	const blocks = [recipe.name, meta];

	if (recipe.ingredients.length) {
		blocks.push(
			[
				m.cooking.recipe.ingredients,
				...recipe.ingredients.map((row) => `• ${m.units.ingredient(row)}`)
			].join('\n')
		);
	}

	if (recipe.steps.length) {
		blocks.push(
			[m.cooking.recipe.steps, ...recipe.steps.map((text, i) => `${i + 1}. ${text}`)].join('\n')
		);
	}

	return blocks.filter(Boolean).join('\n\n');
}

/* ── The plan-a-meal payload ──────────────────────────────────────────────── */

export type PlanMealInput = {
	date: CalendarDate;
	/** Set when a saved recipe was picked; `title` then carries its name snapshot. */
	recipeId: string | null;
	/** The free-text meal, or the snapshot of the chosen recipe's name. */
	title: string | null;
	cookMemberId: string | null;
	/** The sheet's toggle — only meaningful alongside a recipe. */
	addIngredients: boolean;
};

/**
 * The sheet posts the chosen recipe's name alongside its id, and this keeps
 * both. It's what makes "a recipe a housemate deleted while the sheet was open
 * becomes the free-text meal it was named after" true rather than aspirational:
 * throwing the title away whenever an id was present left `planMeal` with
 * nothing to write, and it wrote nothing — silently, reported as success.
 */

/**
 * The plan sheet's fields, validated. Ownership of the recipe and the cook is
 * *not* checked here — that's the service's job, because it's the layer that
 * knows the household (→ `services/meals.ts`).
 */
export function readPlanForm(form: FormData, m: Messages): PlanMealInput | { error: string } {
	const date = String(form.get('date') ?? '');
	if (!isCalendarDate(date)) return { error: m.errors.recipes.mealDay };

	const recipeId = String(form.get('recipeId') ?? '') || null;
	const title = String(form.get('title') ?? '')
		.trim()
		.slice(0, MEAL_TITLE_MAX);

	// The sheet offers one or the other; posting neither means nothing was
	// chosen, which is a question rather than a meal.
	if (!recipeId && !title) return { error: m.errors.recipes.mealChoice };

	return {
		date,
		recipeId,
		title: title || null,
		cookMemberId: String(form.get('cookMemberId') ?? '') || null,
		addIngredients: form.get('addIngredients') === 'on'
	};
}
