/**
 * A step drawn from its stored links (→ plan 43, SPEC §4.4, DECISIONS #311).
 *
 * A link says which ingredient a step uses, the words of the step text that
 * name it (`phrase`: "Zwiebelwürfel" for the Zwiebel) and the amount the text
 * gives it (`amountPhrase`: "1 - 2 EL"), each exactly as it stands in the text.
 * So nothing here guesses:
 *
 * - **Underlines** are every whole-word occurrence of a link's phrase in this
 *   step, case-blind, with the same Unicode-aware boundaries the matcher uses
 *   (→ `step-highlight.ts`): "Öl" is not underlined inside "Olivenöl".
 * - **Scaled amounts** are the amount phrase and nothing else. Cooking for a
 *   different number rewrites every number in that run ("1 - 2 EL" doubled is
 *   "2 - 4 EL"), each scaled by `scaleQuantity` and written back in the style it
 *   was typed (`formatLike`: a fraction stays a fraction, a comma stays a
 *   comma). "180 °C" and "5 - 7 Min." are no link's amount, so they never move.
 * - A phrase or an amount the text no longer contains (the step was retyped)
 *   renders plain; a link to an ingredient that is gone is dropped.
 *
 * `renderStep` is the one entry point for cook mode and the recipe view. It
 * draws from the stored links when the step has any that carry words, and
 * otherwise falls back to exactly what the screens did before plan 43: the
 * matcher (`readStep`) and the "number before an underlined word" rule
 * (`scaleStepAmounts`). That fallback covers both a step nobody has linked
 * (`ingredients_set` false) and one pinned by hand in the old editor, whose
 * pins carry no words (→ DECISIONS #320): a recipe saved before this plan
 * reads and cooks exactly as it did.
 *
 * Pure, no `$lib`, relative imports with their extension (→ `ingredients.ts`).
 */
import { FRACTION_CHARS, NUMBER_PATTERN, parseQuantity } from './amounts.ts';
import { scaleQuantity } from './ingredients.ts';
import { formatLike, scaleStepAmounts } from './step-amounts.ts';
import {
	readStep,
	scaleStepUses,
	type StepHighlight,
	type StepSegment,
	type StepUse
} from './step-highlight.ts';

type Row = { id: string; name: string; quantity: number | null; unit: string | null };

export type RenderedStep<T> = StepHighlight<T> & {
	/** True when the step was drawn from stored links rather than read by the matcher. */
	linked: boolean;
};

/** Whether a step's pins carry the words that name them (→ plan 43). */
export function hasStoredLinks(uses: readonly StepUse[] | null): boolean {
	return uses !== null && uses.some((use) => Boolean(use.phrase || use.amountPhrase));
}

/**
 * A step as the screens draw it, for `factor` times the recipe as written.
 * `ingredients` is the list already scaled by the same factor (each row's
 * total); `uses` is the step's pins as stored, unscaled.
 */
export function renderStep<T extends Row>(
	step: { text: string; uses: readonly StepUse[] | null },
	ingredients: readonly T[],
	factor: number
): RenderedStep<T> {
	const uses = scaleStepUses(step.uses, factor);

	if (!uses || !hasStoredLinks(uses)) {
		const read = readStep({ text: step.text, uses }, ingredients);
		return {
			segments: scaleStepAmounts(read.segments, factor, ingredients, uses !== null),
			used: read.used,
			linked: false
		};
	}

	return { ...linkStep(step.text, uses, ingredients, factor), linked: true };
}

/** A run of the text that one link claims: the words naming it, or its amount. */
type Claim<T> = { start: number; end: number; ingredient: T | null; amount: boolean };

/**
 * The step drawn from its links alone. `uses` are already scaled (each pin's
 * share), `ingredients` too; `factor` decides whether the amount runs move.
 */
export function linkStep<T extends Row>(
	text: string,
	uses: readonly StepUse[],
	ingredients: readonly T[],
	factor: number
): StepHighlight<T> {
	const byId = new Map(ingredients.map((row) => [row.id, row]));
	/** One row per ingredient, carrying this step's share when it has one. */
	const rows = new Map<string, T>();

	for (const use of uses) {
		const row = byId.get(use.ingredientId);
		if (!row || rows.has(row.id)) continue;
		rows.set(row.id, use.quantity === null ? row : { ...row, quantity: use.quantity });
	}

	const claims: Claim<T>[] = [];
	const scaling = factor !== 1 && Number.isFinite(factor) && factor > 0;

	for (const use of uses) {
		const row = rows.get(use.ingredientId);
		if (!row) continue;

		const phrases = use.phrase ? occurrences(text, use.phrase) : [];
		for (const [start, end] of phrases) claims.push({ start, end, ingredient: row, amount: false });

		if (scaling && use.amountPhrase) {
			const at = amountAt(text, use.amountPhrase, phrases);
			if (at) claims.push({ start: at[0], end: at[1], ingredient: null, amount: true });
		}
	}

	// Left to right; at one position the longer run wins, and a run that starts
	// inside one already taken is dropped rather than splitting it.
	claims.sort((a, b) => a.start - b.start || b.end - a.end);

	const segments: StepSegment<T>[] = [];
	const used: T[] = [];
	let cursor = 0;

	for (const claim of claims) {
		if (claim.start < cursor) continue;
		if (claim.start > cursor)
			segments.push({ text: text.slice(cursor, claim.start), ingredient: null });

		const written = text.slice(claim.start, claim.end);
		if (claim.amount) {
			const now = scaleAmountPhrase(written, factor);
			segments.push(
				now === written
					? { text: written, ingredient: null }
					: { text: now, ingredient: null, scaledFrom: written }
			);
		} else {
			segments.push({ text: written, ingredient: claim.ingredient });
		}
		cursor = claim.end;
	}

	if (cursor < text.length || !segments.length) {
		segments.push({ text: text.slice(cursor), ingredient: null });
	}

	// Every linked row is used, named in the text or not, in the order linked.
	for (const row of rows.values()) used.push(row);

	return { segments: merge(segments), used };
}

/**
 * An amount phrase with every number in it scaled: "1 - 2 EL" × 2 → "2 - 4 EL",
 * "½ TL" × 2 → "1 TL", "0,5 l" × 3 → "1,5 l". A number that doesn't read is
 * left as it stands; the words around the numbers never change.
 */
export function scaleAmountPhrase(phrase: string, factor: number): string {
	if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return phrase;

	return phrase.replace(NUMBERS, (written) => {
		// "1.200" is twelve hundred or one-point-two depending on who wrote it.
		if (/^\d{1,3}[.,]\d{3}$/.test(written)) return written;
		const value = parseQuantity(written);
		const scaled = value === null ? null : scaleQuantity(value, factor);
		return scaled === null ? written : formatLike(written, scaled);
	});
}

/**
 * Each number in an amount run: a mixed "1 1/2" or "1 ½" first, so it is one
 * number rather than two, then everything `NUMBER_PATTERN` reads.
 */
const NUMBERS = new RegExp(
	String.raw`(?<![\p{N}.,/])(?:\d+\s+\d+\s*\/\s*\d+|\d+\s+[${FRACTION_CHARS}]|${NUMBER_PATTERN})(?![\p{N}])`,
	'gu'
);

/**
 * Where a phrase stands as whole words: not inside a longer word on either
 * side. A hyphen ends a word, except the German one that holds a compound's
 * place ("Ober- und Unterhitze"), as in the matcher.
 */
function occurrences(text: string, phrase: string): [number, number][] {
	const words = phrase.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return [];

	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}])${words.map(escape).join('\\s+')}(?![\\p{L}\\p{N}]|-(?:\\s|$))`,
		'giu'
	);

	return [...text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);
}

/**
 * Where a link's amount stands: the occurrence nearest in front of one of its
 * phrase's occurrences (only spaces between), else the first one in the text.
 * An amount is bounded by anything that is not part of a number or a word, so
 * "2 EL" is not found inside "12 EL".
 */
function amountAt(
	text: string,
	amount: string,
	phrases: readonly [number, number][]
): [number, number] | null {
	const words = amount.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return null;

	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}.,/])${words.map(escape).join('\\s+')}(?![\\p{L}\\p{N}])`,
		'giu'
	);
	const found = [...text.matchAll(pattern)].map(
		(match) => [match.index, match.index + match[0].length] as [number, number]
	);
	if (!found.length) return null;

	const before = found.find(([, end]) =>
		phrases.some(([start]) => start >= end && !text.slice(end, start).trim())
	);
	return before ?? found[0];
}

/** Neighbouring plain runs as one, so the screens render what they did before. */
function merge<T>(segments: StepSegment<T>[]): StepSegment<T>[] {
	const out: StepSegment<T>[] = [];
	for (const segment of segments) {
		const last = out.at(-1);
		if (
			last &&
			!last.ingredient &&
			!segment.ingredient &&
			!last.scaledFrom &&
			!segment.scaledFrom
		) {
			last.text += segment.text;
		} else {
			out.push({ ...segment });
		}
	}
	const kept = out.filter((segment) => segment.text);
	return kept.length ? kept : [{ text: '', ingredient: null }];
}

/** `-` stays unescaped: an identity escape is invalid under the `u` flag. */
function escape(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
