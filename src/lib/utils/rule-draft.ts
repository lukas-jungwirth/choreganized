/**
 * The import without a model (→ plan 44, SPEC §4.7): a page's recipe card read
 * by rules into the same draft the AI import produces, so every screen after
 * it is the same. Used when the household has no AI provider, and when both
 * providers failed.
 *
 * - amount, unit, counting word: the shared reader (`parseIngredient`, plan 42),
 *   with the household's own unit words as its `known` set. A word on no list
 *   stays in the name, as the reader leaves it.
 * - note: what follows the first comma, or what stands in brackets ("Speck
 *   (geräuchert, durchwachsen)" → Speck · geräuchert, durchwachsen). A plural
 *   bracket ("Zwiebel(n)") is the reader's, not a note.
 * - parts: what the readers found (`ingredientSections`, `stepSections`).
 * - links: none stored. The steps read their own text with the word matcher,
 *   as a page's card always has; one `no-ai` item says so.
 *
 * Pure, like the gate beside it (`recipe-draft.ts`).
 */
import { formatIngredient, parseIngredient } from './ingredients.ts';
import {
	clampCount,
	INGREDIENT_LINE_MAX,
	INGREDIENT_NAME_MAX,
	INGREDIENT_NOTE_MAX,
	INGREDIENTS_MAX,
	RECIPE_NAME_MAX,
	RECIPE_SECTION_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEP_TEXT_MAX,
	STEPS_MAX,
	type ImportCheck,
	type RecipePrefill
} from './recipes.ts';
import type { UnitLabels } from './shopping.ts';

/** A page's own recipe card, as the import reads it and the model is shown it. */
export type SourceRecipe = {
	name: string;
	timeMinutes: number | null;
	servings: number | null;
	/** `recipeYield` as written, when the page had one ("1 Kuchen"). */
	servingsText?: string | null;
	ingredientLines: string[];
	/** The part of each line, by index; absent: none. */
	ingredientSections?: (string | null)[];
	steps: string[];
	/** The part of each step, by index; absent: none. */
	stepSections?: (string | null)[];
};

/** One ingredient row as the rules read it. */
export type RuleRow = {
	quantity: number | null;
	unit: string | null;
	name: string;
	note: string | null;
};

/**
 * One page line as a row: the reader's amount and unit, and the name split
 * from its note. Null for a line with nothing in it.
 */
export function ruleRow(line: string, known?: ReadonlySet<string>): RuleRow | null {
	const parsed = parseIngredient(line, known);
	if (!parsed) return null;
	const { name, note } = splitNote(parsed.name);
	return { quantity: parsed.quantity, unit: parsed.unit, name, note };
}

/**
 * "Lasagneplatten, ungekocht (je nach Form)" → Lasagneplatten · ungekocht (je
 * nach Form); "Speck (geräuchert)" → Speck · geräuchert; "Salz" → Salz. A name
 * that would be left empty ("(optional)") stays whole.
 */
export function splitNote(text: string): { name: string; note: string | null } {
	const comma = commaOutsideBrackets(text);
	let name = comma < 0 ? text : text.slice(0, comma);
	const notes: string[] = [];
	// Brackets in what stays the name are notes too: "pancetta (Italian bacon), chopped".
	name = name.replace(/\s*\(([^()]*)\)/g, (_, inside: string) => {
		if (inside.trim()) notes.push(inside.trim());
		return '';
	});
	if (comma >= 0) notes.push(text.slice(comma + 1).trim());

	name = name.replace(/\s+/g, ' ').trim();
	const note = notes.filter(Boolean).join('; ');
	if (!name) return { name: text.trim().slice(0, INGREDIENT_NAME_MAX), note: null };
	return {
		name: name.slice(0, INGREDIENT_NAME_MAX).trim(),
		note: note ? note.slice(0, INGREDIENT_NOTE_MAX).trim() : null
	};
}

/** The first comma that is not inside brackets: "Tomaten (stückig, Dose), frisch" → the second. */
function commaOutsideBrackets(text: string): number {
	let depth = 0;
	for (let at = 0; at < text.length; at++) {
		const char = text[at];
		if (char === '(') depth++;
		else if (char === ')') depth = Math.max(0, depth - 1);
		else if (char === ',' && depth === 0) return at;
	}
	return -1;
}

/**
 * The recipe-level checks both imports share (→ plan 44): servings missing, or
 * 1 where the page counted something that is no portion ("1 Kuchen"), since
 * every scaled amount hangs on it; no method at all (cookidoo.at publishes none).
 */
export function recipeChecks(
	servings: number | null,
	servingsText: string | null | undefined,
	steps: number
): ImportCheck[] {
	const checks: ImportCheck[] = [];
	const portions = /portion|serving|person|pers\.|people|personen|stück|pieces/i;
	if (servings === null || (servings === 1 && !portions.test(servingsText ?? ''))) {
		checks.push({ kind: 'servings', level: 'check', at: 'recipe' });
	}
	if (steps === 0) checks.push({ kind: 'no-steps', level: 'check', at: 'recipe' });
	return checks;
}

export type RuleOptions = {
	/** The household's own unit words, lowercased (→ `services/units.ts`). */
	known?: ReadonlySet<string>;
	/** The unit spellings lines are written back in ("EL", not "tbsp"). */
	labels?: UnitLabels;
};

/** A page's card as a draft, by rules alone. */
export function ruleDraft(
	card: SourceRecipe,
	options: RuleOptions = {}
): Omit<RecipePrefill, 'photo' | 'suggested'> {
	const lines: string[] = [];
	const details: RecipePrefill['ingredientDetails'] = [];

	card.ingredientLines.forEach((line, at) => {
		if (lines.length >= INGREDIENTS_MAX) return;
		const row = ruleRow(line, options.known);
		if (!row) return;
		lines.push(formatIngredient(row, options.labels).slice(0, INGREDIENT_LINE_MAX));
		details.push({ note: row.note, section: section(card.ingredientSections?.[at]) });
	});

	const steps = card.steps
		.flatMap((text, at) =>
			splitLongStep(text).map((piece) => ({
				text: piece,
				uses: null,
				timer: null,
				section: section(card.stepSections?.[at])
			}))
		)
		.slice(0, STEPS_MAX);

	const servings = clampCount(card.servings, RECIPE_SERVINGS_MAX);
	return {
		name: card.name.slice(0, RECIPE_NAME_MAX),
		timeMinutes: clampCount(card.timeMinutes, RECIPE_TIME_MAX),
		servings,
		ingredientLines: lines,
		ingredientDetails: details,
		steps,
		checks: [
			{ kind: 'no-ai', level: 'info', at: 'recipe' },
			...recipeChecks(servings, card.servingsText, steps.length)
		],
		leftOut: []
	};
}

/**
 * A step longer than the editor holds (600 characters), as several, cut at
 * sentence ends (→ plan 44): a page's one-paragraph method used to lose its
 * tail to the cap. A single sentence longer than that is cut, as before.
 */
export function splitLongStep(text: string): string[] {
	if (text.length <= STEP_TEXT_MAX) return [text];
	const pieces: string[] = [];
	let current = '';
	for (const sentence of text.split(/(?<=[.!?])\s+/)) {
		const joined = current ? `${current} ${sentence}` : sentence;
		if (joined.length <= STEP_TEXT_MAX) {
			current = joined;
			continue;
		}
		if (current) pieces.push(current);
		current = sentence.slice(0, STEP_TEXT_MAX);
	}
	if (current) pieces.push(current);
	return pieces;
}

function section(value: string | null | undefined): string | null {
	return value ? value.slice(0, RECIPE_SECTION_MAX) : null;
}
