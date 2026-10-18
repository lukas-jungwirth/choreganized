/**
 * "Add 2 tomatoes", cooking for twice as many → "Add **4** tomatoes"
 * (→ plan 23, SPEC §4.5, §4.6, DECISIONS #149).
 *
 * "Cooking for {n}" already scales the ingredient list and each step's "uses"
 * line (#124, #127). The step's own sentence was left as written, so a recipe
 * doubled for guests still said "2 tomatoes" in the one place the cook was
 * reading. This rewrites the amount in the sentence — **only where it is
 * certain**, and leaves everything else exactly as typed, because a wrong
 * number in an instruction is worse than an unscaled one:
 *
 * - The amount must sit **directly before** a word the step is already
 *   underlined for (`readStep`): "200 g Mehl", "2 tomatoes", "2 EL Öl". A number
 *   anywhere else — "180 °C", "2 cm", "10 Minuten", "in 4 Portionen" — isn't
 *   attached to an ingredient and is never touched.
 * - Its unit must be the ingredient's own (both none, or the same unit in any
 *   spelling the parser reads: "EL" is `tbsp`).
 * - It must agree with what the recipe knows: on a pinned step, the share
 *   pinned there or the whole row; on a step that reads its own text, no more
 *   than the row's total.
 *
 * Only the number changes — "2 EL" becomes "4 EL", never "4 tbsp" — and a
 * decimal comma stays a comma. Works on the *scaled* reading cook mode and the
 * recipe view already have: the text's number is scaled by the same
 * `scaleQuantity` the rows were, so the two agree exactly.
 */
import {
	formatQuantityValue,
	parseQuantity,
	scaleQuantity,
	unitFromWord,
	UNIT_WORDS
} from './ingredients.ts';
import type { StepSegment } from './step-highlight.ts';

type Row = { id: string; quantity: number | null; unit: string | null };

/** A number as a step writes one: "2", "1,5", "1.5", "1/2", "1½", "½". */
const NUMBER = String.raw`\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s?[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛]`;

/** Unit spellings, longest first, escaped ("stk." has a dot). */
const UNIT = UNIT_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

/**
 * The end of the prose right before an underlined ingredient: a number, an
 * optional unit (with or without a space, "200g"), an optional "of", and the
 * space before the ingredient. Not preceded by another digit or separator —
 * nor by a digit and a space — so neither "1.200" nor the "1/2" of "1 1/2" is
 * read from its middle.
 */
const AMOUNT_BEFORE = new RegExp(
	String.raw`(?<![\p{N}.,/])(?<!\p{N}\s)(${NUMBER})(?:(\s?)(${UNIT})(?![\p{L}]))?(\s+(?:of\s+)?)$`,
	'iu'
);

/**
 * The step's segments with every certain amount rewritten for `factor`, as a
 * run of its own carrying `scaledFrom`. `rows` is the scaled ingredient list
 * (for each row's total); `pinned` says whether the step's ingredients were
 * chosen by hand, in which case each underlined row already carries this
 * step's share.
 */
export function scaleStepAmounts<T extends Row>(
	segments: StepSegment<T>[],
	factor: number,
	rows: readonly Row[],
	pinned: boolean
): StepSegment<T>[] {
	if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return segments;

	const totals = new Map(rows.map((row) => [row.id, row.quantity]));
	const out: StepSegment<T>[] = [];

	for (const segment of segments) {
		const before = out.at(-1);
		const ingredient = segment.ingredient;

		if (ingredient && before && !before.ingredient && !before.scaledFrom) {
			const split = rewrite<T>(
				before.text,
				ingredient,
				totals.get(ingredient.id) ?? null,
				factor,
				pinned
			);
			if (split) out.splice(out.length - 1, 1, ...split);
		}

		out.push(segment);
	}

	return out;
}

/** The prose before one ingredient, its trailing amount split out and rewritten — or null. */
function rewrite<T>(
	prose: string,
	ingredient: Row,
	total: number | null,
	factor: number,
	pinned: boolean
): StepSegment<T>[] | null {
	const match = AMOUNT_BEFORE.exec(prose);
	if (!match) return null;

	const [whole, written, gap = '', unitWord, tail] = match;
	// "1.200" is twelve hundred in German and one-point-two in English; a number
	// that can be either is left alone rather than guessed.
	if (/^\d{1,3}[.,]\d{3}$/.test(written)) return null;
	const value = parseQuantity(written.replace(/\s/g, ''));
	if (value === null) return null;

	// The unit has to be the row's own — "2 EL" for a tbsp row, nothing for a
	// row without one. Otherwise the number measures something else.
	const unit = unitWord ? unitFromWord(unitWord) : null;
	if (unit !== (ingredient.unit ?? null)) return null;

	const scaled = scaleQuantity(value, factor);
	if (scaled === null || !agrees(scaled, ingredient.quantity, total, pinned)) return null;

	const now = formatLike(written, scaled);

	return [
		{ text: prose.slice(0, prose.length - whole.length), ingredient: null },
		{
			text: now + gap + (unitWord ?? ''),
			ingredient: null,
			scaledFrom: written + gap + (unitWord ?? '')
		},
		{ text: tail, ingredient: null }
	].filter((part) => part.text) as StepSegment<T>[];
}

/**
 * The scaled number in the style it was written: a fraction stays a fraction
 * ("½" doubled is "1", "¼" doubled is "½"), a decimal stays a decimal — with
 * its comma, if it had one ("0,25" doubled is "0,5", not "½").
 */
function formatLike(written: string, value: number): string {
	if (/[½¼¾⅓⅔⅛/]/.test(written)) return formatQuantityValue(value);
	const plain = String(Number(value.toFixed(2)));
	return written.includes(',') ? plain.replace('.', ',') : plain;
}

/**
 * Whether the text's amount (already scaled) is one the recipe vouches for:
 * on a pinned step, this step's share or the whole row; otherwise, any amount
 * up to the row's total. A row without an amount vouches for nothing.
 */
function agrees(
	scaled: number,
	underlined: number | null,
	total: number | null,
	pinned: boolean
): boolean {
	if (total === null) return false;
	if (pinned) return scaled === underlined || scaled === total;
	return scaled <= total * 1.005;
}
