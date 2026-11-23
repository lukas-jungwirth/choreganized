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
import { clampAmount, parseQuantity, UNIT_WORD_MAX } from './amounts';
import { isCalendarDate, type CalendarDate } from './dates';
import { readMealSlot, type MealSlot } from './meals';
import { readRecipeDiet, readRecipeTags, type RecipeDiet, type RecipeTag } from './recipe-tags';
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS, TIMER_LABEL_MAX } from './timer-parse';

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
/**
 * What an ingredient's note, a part's name and a step link's words may hold
 * (→ plan 43): "in Scheiben geschnitten", "Béchamel", "Zwiebelwürfel", "1 - 2 EL".
 */
export const INGREDIENT_NOTE_MAX = 120;
export const RECIPE_SECTION_MAX = 40;
export const LINK_PHRASE_MAX = 80;
export const AMOUNT_PHRASE_MAX = 30;

/**
 * A short free-text field as stored: one line, trimmed, capped, and null when
 * nothing is left. Anything that is not a string is nothing. The form reader
 * and the service both run it, the second for callers that are not the form.
 */
export function cleanText(value: unknown, max: number): string | null {
	if (typeof value !== 'string') return null;
	return value.replace(/\s+/g, ' ').trim().slice(0, max).trim() || null;
}

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
	uses: StepLinkInput[] | null;
	/** The step's own timer (→ plan 21), or null for one that reads its text. */
	timer: StepTimer | null;
	/** The part of the dish it belongs to (→ plan 43); absent or null for none. */
	section?: string | null;
};

/**
 * One ingredient a step uses (→ plan 43): which line, the step's share of it,
 * and the words of the step text that name it and give its amount, exactly as
 * written. The words are absent on everything that predates them.
 */
export type StepLinkInput = {
	ingredient: number;
	quantity: number | null;
	phrase?: string | null;
	amountPhrase?: string | null;
};

/**
 * What an ingredient line carries besides the line itself (→ plan 43): its
 * note and the part of the dish it belongs to. Index for index with
 * `ingredientLines`; absent or null means neither.
 */
export type IngredientDetails = { note: string | null; section: string | null };

/**
 * A step's own timer (→ plan 21, DECISIONS #147): whole seconds, and the name
 * it rings with — null for "after its step" ("Step 3"). One per step, because
 * cook mode keeps one ring per step.
 */
export type StepTimer = { seconds: number; label: string | null };

/**
 * One ingredient as the editor posts it (→ plan 46): the fields kept apart, as
 * they are stored. `unit` is one of the eight, a counting word the reader
 * knows, or one of the household's own words (→ DECISIONS #321); the service
 * holds it to that.
 */
export type IngredientInput = {
	name: string;
	quantity: number | null;
	unit: string | null;
	note: string | null;
	section: string | null;
};

/**
 * What a recipe is saved from. The editor [3c] posts each ingredient as its
 * fields (`ingredients`, → plan 46); the import and the seed hand over lines,
 * which the service parses (→ `$lib/utils/ingredients`).
 *
 * Declared here rather than beside the service so the reader below — and the
 * form itself — can name it without importing anything from `$lib/server`.
 */
export type RecipeInput = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	ingredientLines: string[];
	/** Each line's note and part (→ plan 43); absent for a caller that has none. */
	ingredientDetails?: (IngredientDetails | null)[];
	/**
	 * The rows as fields (→ plan 46), what the editor posts. When present they
	 * are the ingredients and `ingredientLines` is not read; a step's link then
	 * names a row by its index here.
	 */
	ingredients?: IngredientInput[];
	steps: StepInput[];
	/**
	 * Meal, kind, free-from (→ plan 40). Absent leaves a saved recipe's tags as
	 * they are — the form always sends them; a caller with no opinion doesn't.
	 */
	tags?: RecipeTag[];
	/** One diet or null for "not set"; absent leaves it be, like `tags`. */
	diet?: RecipeDiet | null;
};

/**
 * An imported recipe [plan 12] the editor opens on, before anything is saved
 * (→ SPEC §4.7). Raw ingredient and step text is seeded verbatim so the editor
 * reads it exactly as if it had been typed; the photo is already downloaded, so
 * the draft carries a `preview` (a data URL — the temp file isn't servable until
 * it's attached) and the temp `path` the save action attaches.
 *
 * Steps are `StepInput`s — text, and what an AI import (→ plan 22) worked out
 * about them: the ingredients each one uses (by index into `ingredientLines`)
 * and its timer. A page's own recipe card knows neither, so its steps arrive
 * with `uses: null` and `timer: null` and read their own text, like typed ones.
 *
 * Declared here beside `RecipeInput` so the form component and the import route
 * both name it without importing from `$lib/server`.
 */
export type RecipePrefill = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	ingredientLines: string[];
	/** Each line's note and part, by index (→ plans 43, 44); absent: none. */
	ingredientDetails?: (IngredientDetails | null)[];
	steps: StepInput[];
	photo: { path: string; preview: string } | null;
	/**
	 * What the import's gate wants a person to look at, and what it only says
	 * (→ plan 44): the review screen of plan 45 shows them; until then the
	 * editor lists them at the top. Absent: nothing to say.
	 */
	checks?: ImportCheck[];
	/** Sentences of the page's method no step kept (→ plan 44), so one can be put back. */
	leftOut?: string[];
	/**
	 * Tags and a diet the import suggests (→ plan 41): read off the page's own
	 * card, picked by the AI, or both. They open ticked, marked as suggestions,
	 * and are saved only by Save. Absent or null: nothing suggested.
	 */
	suggested?: TagSuggestion | null;
};

/**
 * One thing the import's gate found (→ plan 44). `check` items are what the
 * review counts ("3 things to check"); `info` items only say something.
 * `at` names the draft's ingredient row or step by index, or the recipe.
 */
export type ImportCheck = {
	kind: ImportCheckKind;
	level: 'check' | 'info';
	at: { ingredient: number } | { step: number } | 'recipe';
	/** The ingredient's name, as the draft has it, for an item about a row. */
	name?: string;
	/** What the page said where it differs: the line, or the step's text. */
	page?: string;
	/** A word the page counts in that is on no list ("Ring"). */
	word?: string;
	/** The other half of an either/or ("veganes Hack"). */
	alternative?: string;
};

export const IMPORT_CHECK_KINDS = [
	// A page line no row came from: added from the rule-based reading.
	'line-added',
	// The amount the model gave is not the page's: the page's stands.
	'amount-differs',
	// The page measured in cups, oz or lb; the row is metric (said, not a warning).
	'converted',
	// The model's name has words the page line does not: the page's reading stands.
	'name-differs',
	// A word the page counts in that is on no list: "New unit: Ring. Add it?"
	'new-unit',
	// "A oder B": the first is kept, the other offered.
	'choice',
	// A step whose text is not the page's, word for word.
	'reworded',
	// Read from photos: nothing could be checked against a page.
	'from-photo',
	// The steps give an ingredient more than the recipe has.
	'shares-exceed',
	// No step uses this ingredient ("Fett für die Form" often rightly).
	'unused',
	// No servings, or 1 where the page said a cake: every scaled amount hangs on it.
	'servings',
	// The page has no method.
	'no-steps',
	// Imported without AI: parts and notes by rule, links a guess.
	'no-ai'
] as const;

export type ImportCheckKind = (typeof IMPORT_CHECK_KINDS)[number];

/** Suggested tags and diet, and where they came from — the form says which. */
export type TagSuggestion = {
	tags: RecipeTag[];
	diet: RecipeDiet | null;
	from: 'page' | 'ai' | 'both';
};

/**
 * A page's suggestion and the AI's, together: the page's word stands, group by
 * group, and the AI's fills only the groups the page said nothing about
 * (→ plan 41). Null when neither suggests anything.
 */
export function mergeSuggestions(
	page: TagSuggestion | null | undefined,
	ai: TagSuggestion | null | undefined
): TagSuggestion | null {
	if (!page) return ai ?? null;
	if (!ai) return page;

	const group = (tags: RecipeTag[], prefix: string) => tags.filter((tag) => tag.startsWith(prefix));
	const pick = (prefix: string) =>
		group(page.tags, prefix).length ? group(page.tags, prefix) : group(ai.tags, prefix);
	const tags = readRecipeTags([...pick('meal:'), ...pick('kind:'), ...pick('free:')]);
	const diet = page.diet ?? ai.diet;

	const fromAi = tags.some((tag) => !page.tags.includes(tag)) || (!page.diet && diet !== null);
	const fromPage = page.tags.length > 0 || page.diet !== null;
	return { tags, diet, from: fromAi && fromPage ? 'both' : fromAi ? 'ai' : 'page' };
}

/**
 * Whole, positive, capped — or nothing, which the editor's two number fields
 * allow. For counts that arrive from outside (a page's recipe card, a model's
 * answer), where anything at all may turn up.
 */
export function clampCount(value: unknown, max: number): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	const rounded = Math.round(Math.min(Math.max(value, 0), max));
	return rounded > 0 ? rounded : null;
}

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
	// field, one `stepUses` and one `stepTimer`, so the lists line up position
	// for position.
	const uses = form.getAll('stepUses').map(String);
	const timers = form.getAll('stepTimer').map(String);
	const stepSections = form.getAll('stepSection');
	// Plan 43: one note and one part per ingredient row, one part per step, all
	// hidden and lined up by position like the pins. A form that posts none
	// (an older page still open) saves none.
	const notes = form.getAll('ingredientNote');
	const sections = form.getAll('ingredientSection');
	// Plan 46: each row as its fields, lined up by position. A page from before
	// it (still open on a phone) posts typed lines, read as they always were.
	const names = form.getAll('ingredientName');
	const quantities = form.getAll('ingredientQuantity');
	const units = form.getAll('ingredientUnit');
	const structured = names.length > 0;

	return {
		input: {
			name,
			timeMinutes: readOptionalNumber(form.get('timeMinutes')),
			servings: readOptionalNumber(form.get('servings')),
			ingredientLines: structured ? [] : form.getAll('ingredient').map(String),
			ingredientDetails: structured
				? undefined
				: form.getAll('ingredient').map((_, index) => ({
						note: cleanText(notes[index], INGREDIENT_NOTE_MAX),
						section: cleanText(sections[index], RECIPE_SECTION_MAX)
					})),
			ingredients: structured
				? names.map((value, index) => ({
						name: cleanText(value, INGREDIENT_LINE_MAX) ?? '',
						quantity: readQuantity(quantities[index]),
						unit: cleanText(units[index], UNIT_WORD_MAX),
						note: cleanText(notes[index], INGREDIENT_NOTE_MAX),
						section: cleanText(sections[index], RECIPE_SECTION_MAX)
					}))
				: undefined,
			steps: form.getAll('step').map((text, index) => ({
				text: String(text),
				uses: readStepUses(uses[index]),
				timer: readStepTimer(timers[index]),
				section: cleanText(stepSections[index], RECIPE_SECTION_MAX)
			})),
			tags: readRecipeTags(form.getAll('tag')),
			diet: readRecipeDiet(form.get('diet'))
		}
	};
}

/**
 * A step's pinned ingredients, off the hidden field the form keeps beside it:
 * `[{"ingredient":0,"quantity":1.5,"phrase":"Zwiebelwürfel","amountPhrase":null}]`,
 * an empty string for a step that reads its own text.
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
		const { ingredient, quantity, phrase, amountPhrase } = entry as Record<string, unknown>;
		if (typeof ingredient !== 'number' || !Number.isInteger(ingredient) || ingredient < 0)
			return [];
		return [
			{
				ingredient,
				quantity: typeof quantity === 'number' ? quantity : null,
				phrase: cleanText(phrase, LINK_PHRASE_MAX),
				amountPhrase: cleanText(amountPhrase, AMOUNT_PHRASE_MAX)
			}
		];
	});
}

/**
 * A step's own timer, off the hidden field beside it: `{"seconds":600,"label":
 * "Nudeln"}`, or an empty string for a step that reads its text.
 *
 * Hand-rolled like `readStepUses` and for the same reason — a POST body owes
 * nothing to the form that usually sends it. Anything unreadable, any length a
 * cook-mode timer couldn't run (→ `MIN_TIMER_SECONDS`…`MAX_TIMER_SECONDS`) is
 * no timer at all rather than an error: the step still saves, and still reads
 * its own text. A name is trimmed and capped; an empty one means "after its step".
 */
export function readStepTimer(value: string | undefined): StepTimer | null {
	if (!value) return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
	const { seconds, label } = parsed as Record<string, unknown>;

	if (
		typeof seconds !== 'number' ||
		!Number.isInteger(seconds) ||
		seconds < MIN_TIMER_SECONDS ||
		seconds > MAX_TIMER_SECONDS
	) {
		return null;
	}

	const name =
		typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, TIMER_LABEL_MAX) : '';
	return { seconds, label: name || null };
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

/**
 * An ingredient's amount field: a bare amount ("500", "1,5", "½", "1/2"),
 * anything else none. Clamped like every stored amount.
 */
function readQuantity(value: FormDataEntryValue | undefined): number | null {
	if (typeof value !== 'string') return null;
	const read = parseQuantity(value);
	return read === null ? null : clampAmount(read);
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
	ingredients: {
		name: string;
		quantity: number | null;
		unit: string | null;
		note?: string | null;
		section?: string | null;
	}[];
	steps: { text: string; section?: string | null }[];
};

/**
 * A recipe as plain text for the OS share sheet [7c]. v1 shares the recipe
 * itself rather than a link, because a link would have to be a public route
 * with a token and this app has no public data (→ DECISIONS "Open questions").
 * Parts head their rows and notes follow their line (→ plan 43); the steps are
 * numbered straight through, as on the screen.
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
				...groupByPart(recipe.ingredients).flatMap((part) => [
					...(part.section ? [part.section] : []),
					...part.rows.map((row) => {
						const line = m.units.ingredient(row);
						return `• ${row.note ? m.cooking.recipe.withNote(line, row.note) : line}`;
					})
				])
			].join('\n')
		);
	}

	if (recipe.steps.length) {
		let number = 0;
		blocks.push(
			[
				m.cooking.recipe.steps,
				...groupByPart(recipe.steps).flatMap((part) => [
					...(part.section ? [part.section] : []),
					...part.rows.map((step) => `${++number}. ${step.text}`)
				])
			].join('\n')
		);
	}

	return blocks.filter(Boolean).join('\n\n');
}

/**
 * Rows in their parts (→ plan 43, DECISIONS #312): consecutive rows with the
 * same `section` are one part, in the order they stand. Rows without one come
 * as a part with a null name, which the screens draw without a heading.
 */
export function groupByPart<T extends { section?: string | null }>(
	rows: readonly T[]
): { section: string | null; rows: T[] }[] {
	const parts: { section: string | null; rows: T[] }[] = [];
	for (const row of rows) {
		const section = row.section ?? null;
		const last = parts.at(-1);
		if (last && last.section === section) last.rows.push(row);
		else parts.push({ section, rows: [row] });
	}
	return parts;
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
