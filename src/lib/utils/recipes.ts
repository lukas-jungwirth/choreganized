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
import { readMealSlot, type MealSlot } from './meals';

/* ── Field limits ─────────────────────────────────────────────────────────── */

export const RECIPE_NAME_MAX = 80;
/** One typed ingredient line, e.g. "400 g pasta" (→ `parseIngredient`). */
export const INGREDIENT_LINE_MAX = 90;
/**
 * The ingredient sheet's name field. Shorter than the line it composes into by
 * the widest amount prefix the form can produce ("9999.99 tbsp "), so setting an
 * amount can never silently eat the tail of a name.
 */
export const INGREDIENT_NAME_MAX = INGREDIENT_LINE_MAX - 14;
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
 * One step as the form posts it (→ SPEC §4.4).
 *
 * `uses` is null for a step that reads its own text — the default, and what
 * every step written before this existed does (→ `$lib/utils/step-highlight`).
 * A list, **including an empty one**, is the cook's own answer and is stored as
 * given.
 *
 * An ingredient is named by its index in `ingredientLines` rather than by id,
 * because a save rewrites every child row: the ids the form was opened on no
 * longer exist by the time the pins are written (→ `services/recipes.ts`).
 */
export type StepInput = {
	text: string;
	uses: { ingredient: number; quantity: number | null }[] | null;
};

/**
 * The same pin while the form still holds it, before anything is posted
 * (→ `cooking/StepIngredientsSheet`).
 *
 * `ingredient` is the *form row's* key rather than an index or an id: rows get
 * added, reordered and removed while the form is open, and a key is the only one
 * of the three that survives all of it. The indices `StepInput` wants are worked
 * out at submit time, from where the rows ended up.
 */
export type StepUseDraft = { ingredient: string; quantity: number | null };

/** One ingredient row as the sheet offers it — the form's reading of the line. */
export type StepChoice = {
	key: string;
	name: string;
	quantity: number | null;
	unit: string | null;
};

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
	steps: StepInput[];
};

/**
 * An imported recipe [plan 12] the editor opens on, before anything is saved
 * (→ SPEC §4.7). Raw ingredient and step text is seeded verbatim so the editor
 * reads it exactly as if it had been typed; the photo is already downloaded, so
 * the draft carries a `preview` (a data URL — the temp file isn't servable until
 * it's attached) and the temp `path` the save action attaches.
 *
 * Declared here beside `RecipeInput` so the form component and the import route
 * both name it without importing from `$lib/server`.
 */
export type RecipePrefill = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	ingredientLines: string[];
	steps: string[];
	photo: { path: string; preview: string } | null;
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

	// `getAll` preserves DOM order, which is the order the rows were dragged into
	// — so `sortOrder` is simply the index. Each step renders exactly one text
	// field and one `stepUses`, so the two lists line up position for position.
	const uses = form.getAll('stepUses').map(String);

	return {
		input: {
			name,
			timeMinutes: readOptionalNumber(form.get('timeMinutes')),
			servings: readOptionalNumber(form.get('servings')),
			ingredientLines: form.getAll('ingredient').map(String),
			steps: form
				.getAll('step')
				.map((text, index) => ({ text: String(text), uses: readStepUses(uses[index]) }))
		}
	};
}

/**
 * A step's pinned ingredients, off the hidden field the form keeps beside it:
 * `[{"ingredient":0,"quantity":1.5}]`, an empty string for a step that reads its
 * own text.
 *
 * Hand-rolled rather than trusted, because this is a POST body like any other:
 * anything unreadable becomes "read the text", and any entry that isn't a row
 * index with an amount is dropped. Clamping the numbers is the service's job,
 * the way it is for every other field here.
 */
function readStepUses(value: string | undefined): StepInput['uses'] {
	if (!value) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}

	if (!Array.isArray(parsed)) return null;

	// A step can't use more ingredients than a recipe can hold, and the service
	// caps the write anyway; this keeps a pasted-in megabyte from being walked.
	return parsed.slice(0, INGREDIENTS_MAX).flatMap((entry) => {
		if (typeof entry !== 'object' || entry === null) return [];
		const { ingredient, quantity } = entry as Record<string, unknown>;
		if (typeof ingredient !== 'number' || !Number.isInteger(ingredient) || ingredient < 0)
			return [];
		return [{ ingredient, quantity: typeof quantity === 'number' ? quantity : null }];
	});
}

/**
 * A "cooking for tonight" count, off a URL (`?serves=`) or a form field. Null
 * for anything the app didn't put there — a hand-typed 0, a fortnight-old
 * bookmark, "banana" — and the caller then cooks the recipe as written
 * (→ SPEC §4.5, the same shape `getPlan` uses for `?week=`).
 */
export function readServings(value: unknown): number | null {
	if (typeof value !== 'string' && typeof value !== 'number') return null;

	const whole = Math.trunc(Number(value));
	return Number.isFinite(whole) && whole >= 1 && whole <= RECIPE_SERVINGS_MAX ? whole : null;
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
	/** Which meal of that day — the sheet's chips, dinner unless told otherwise. */
	slot: MealSlot;
	/**
	 * The meal the sheet was opened on, when it was opened on one. Only the
	 * service uses it, and only when the slot moved (→ `services/meals.ts`).
	 */
	mealId: string | null;
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
		slot: readMealSlot(form.get('slot')),
		mealId: String(form.get('mealId') ?? '') || null,
		recipeId,
		title: title || null,
		cookMemberId: String(form.get('cookMemberId') ?? '') || null,
		addIngredients: form.get('addIngredients') === 'on'
	};
}
