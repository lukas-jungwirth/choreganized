/**
 * "400 g pasta" ⇄ `{ quantity: 400, unit: 'g', name: 'pasta' }`.
 *
 * Ingredients are *stored* structured — the shopping list needs a name to
 * deduplicate on and an amount to render — but they're *typed* the way anyone
 * writes a shopping note (→ SPEC §4.4). So the parser is deliberately lenient:
 * it takes a leading amount if there is one, a unit from a known list if the
 * next word is one, and treats everything else as the name. Nothing is ever
 * rejected — the worst case is a row whose name is the whole line, which is
 * exactly what "salt" should do anyway.
 *
 * `parse` and `format` are inverses for everything the app writes back into a
 * form: the edit screen [3c] shows stored rows as text again, and re-saving must
 * not slowly rewrite the recipe.
 */
// Written with its extension so `node --test` can load this module: the test
// runner only strips types, it does not resolve a bare './shopping'. tsconfig's
// `rewriteRelativeImportExtensions` is what keeps `check` and `build` happy.
import {
	clampAmount,
	countingWord,
	fusedOf,
	isTimes,
	leadingAmount,
	measureOf,
	numberOf,
	rangeLength
} from './amounts.ts';
import { unitLabel, type UnitLabels } from './shopping.ts';

// The reading of numbers and units lives in `amounts.ts` (→ plan 42); these are
// handed on so the recipe code keeps one place to import from.
export {
	parseQuantity,
	RECIPE_QUANTITY_MAX,
	RECIPE_UNITS,
	UNIT_WORDS,
	unitFromWord,
	type RecipeUnit
} from './amounts.ts';

/** Written back out for the few values that have a glyph — see `formatAmount`. */
const FRACTION_GLYPHS: [number, string][] = [
	[0.5, '½'],
	[0.25, '¼'],
	[0.75, '¾'],
	[1 / 3, '⅓'],
	[2 / 3, '⅔'],
	[0.125, '⅛']
];

export type ParsedIngredient = {
	quantity: number | null;
	/**
	 * One of the eight units (`RECIPE_UNITS`), or a counting word as the line
	 * wrote it ("Zehen", "Bund", "Dose"), or null (→ DECISIONS #313).
	 */
	unit: string | null;
	name: string;
};

/** "ca. 200 g", "about 2 cups": the word says the amount is rough, the amount stands. */
const APPROX =
	/^(?:ca\.?|circa|etwa|ungefähr|about|approx\.?|approximately|around)\s+(?=[\d½⅓⅔¼¾⅛])/i;

/** "1 and 1/2 cups", "1 und 1/2 TL": a mixed number written out. */
const AND_FRACTION = /^(\d+)\s+(?:and|und|&)\s+(\d+\s*\/\s*\d+)/i;

/**
 * A plural a site leaves open: "Zwiebel(n)", "Ei(er)", "Zehe/n". Settled by the
 * amount in front of it.
 */
const OPEN_PLURAL = /(\p{L})(?:\((n|en|e|er|s|es|nen|se)\)|\/(n|en|s)(?![\p{L}\p{N}]))/gu;

/** "Zwiebel(n)" → "Zwiebeln" for more than one, "Zwiebel" otherwise. */
function settlePlural(text: string, quantity: number | null): string {
	const many = quantity !== null && quantity > 1;
	return text.replace(OPEN_PLURAL, (_, last: string, bracket?: string, slash?: string) =>
		many ? last + (bracket ?? slash ?? '') : last
	);
}

/** Separators a split leaves at a name's edges: "TL, gestr. Backpulver" → the name. */
function trimName(name: string): string {
	return name.replace(/^[\s,;:]+|[\s,;:]+$/gu, '');
}

/**
 * One typed line → the columns it's stored in. `null` for a line with nothing
 * but whitespace, so callers can drop empty rows without a second check.
 *
 * The recipe profile of the shared amount reader (→ `amounts.ts`, plan 42): the
 * amount leads the line, then a unit or a counting word if the next word is
 * one, then the name. An amount at the very end is read too ("Mehl 500g"),
 * because that is how a list is typed and people type recipes the same way.
 */
export function parseIngredient(input: string): ParsedIngredient | null {
	const line = input.trim().replace(/\s+/g, ' ');
	if (!line) return null;

	const text = line.replace(APPROX, '').replace(AND_FRACTION, '$1 $2');
	const amount = leadingAmount(text);

	// No leading number at all: an amount at the end ("Mehl 500g"), or the whole
	// line is the name ("salt", "olive oil").
	if (!amount) return trailingAmount(line) ?? nameOnly(line);

	const after = text.slice(amount.length);
	// "1. Mai Kerzen": a number with a full stop and a space is an ordinal.
	if (/^[.,](?:\s|$)/.test(after)) return nameOnly(line);

	// "2-3 EL Öl", "1 bis 2 Zehen": a range keeps its first value, like a step's
	// timer does (→ timer-parse) — the unit after it is still the unit.
	const spaced = after.trimStart();
	const rest = spaced.slice(rangeLength(spaced)).trim();

	// "2" on its own, or "400 g" with nothing to measure — the line never named
	// a thing, so it becomes one rather than a dangling amount.
	if (!rest) return nameOnly(line);

	let words = rest.split(' ');
	// "1 x Backpulver", "4 x 150g Hühnerbrust": the x only says "times".
	const times = isTimes(words[0]) && words.length > 1;
	if (times) words = words.slice(1);

	const first = words[0].replace(/[,;:]$/, '');
	const measure = measureOf(first);
	const counting = measure ? null : countingWord(settlePlural(first, null));

	// "7up", "2in1": a word glued to the number that is no unit is part of a name.
	// (The amount's own pattern may have taken the space, hence both checks.)
	const glued =
		!/\s$/.test(text.slice(0, amount.length)) && after === spaced && rangeLength(spaced) === 0;
	if (glued && !times && !measure && !counting) return nameOnly(line);

	const quantity =
		amount.value === null ? null : clampAmount(amount.value * (measure?.factor ?? 1));
	const unit = measure ? measure.unit : counting ? settlePlural(first, quantity) : null;

	let named = measure || counting ? words.slice(1).join(' ') : words.join(' ');
	// "2 cloves of garlic": after a measure, "of" belongs to neither side.
	if (measure || counting) named = named.replace(/^of\s+/i, '');
	const name = trimName(settlePlural(named, quantity));

	// "400 g" again, this time with the unit eaten: keep the unit as the name.
	if (!name) return { quantity, unit: null, name: rest };

	// A unit measures a quantity — the same rule `services/shopping.ts` normalises
	// by. "0 kg flour" parses to no quantity, and `formatAmount` prints nothing
	// without one, so a surviving "kg" would be silently dropped the next time the
	// edit screen saved the line back.
	return { quantity, unit: quantity === null ? null : unit, name };
}

/** A line with no amount in it: the whole of it is the name. */
function nameOnly(line: string): ParsedIngredient {
	return { quantity: null, unit: null, name: settlePlural(line, null) };
}

/**
 * "Mehl 500g", "Milch 2 l", "Salz, 1 TL": a measured amount at the end of a
 * line that did not start with one. Units only: a bare number at the end
 * ("Type 405") is not an amount in a recipe, and neither is a counting word.
 */
function trailingAmount(line: string): ParsedIngredient | null {
	const words = line.split(' ');
	const last = words.length - 1;
	if (last < 1) return null;

	const fused = fusedOf(words[last]);
	const fusedMeasure = fused ? measureOf(fused.word) : null;
	const number = last >= 2 ? numberOf(words[last - 1]) : null;
	const spacedMeasure = number ? measureOf(words[last]) : null;

	const found =
		fused && fusedMeasure
			? { value: fused.value, measure: fusedMeasure, taken: 1 }
			: number && spacedMeasure
				? { value: number.value, measure: spacedMeasure, taken: 2 }
				: null;
	if (!found) return null;

	const quantity = clampAmount(found.value * found.measure.factor);
	const name = trimName(
		settlePlural(words.slice(0, words.length - found.taken).join(' '), quantity)
	);
	if (quantity === null || !/\p{L}/u.test(name) || measureOf(name)) return null;

	return { quantity, unit: found.measure.unit, name };
}

/**
 * The amount on its own — the right-aligned column of the recipe view [7a] and
 * the "This step uses 250 g mushrooms" line in cook mode. Empty when there is
 * no amount to speak of.
 */
export function formatAmount(
	quantity: number | null,
	unit: string | null,
	labels: UnitLabels = {}
): string {
	if (quantity === null || quantity <= 0) return '';
	const amount = formatQuantityValue(quantity);
	return unit ? `${amount} ${unitLabel(unit, labels)}` : amount;
}

/**
 * Three fields back into one typed line — the inverse of the sheet [3c] opening
 * on one.
 *
 * The line is still the only thing the form posts, so this has to compose
 * something the parser will read back the same way. It usually does; sometimes
 * it cannot. "1 Packung Nudeln" reads back as one *pack* of "Nudeln", because
 * `Packung` is a unit alias, and "3 Musketiere" reads back as 3 of "Musketiere". There is no
 * spelling that escapes it while the line is the wire format, so this doesn't
 * pretend: it returns the line **and** the reading that line will actually get,
 * and the sheet shows that reading before you commit (→ DECISIONS #101).
 *
 * `unitLabelText` is the unit as it is *shown* ("EL", not "tbsp"): the parser
 * reads every label in every catalog back to the same canonical unit, so a
 * German household's line stays a German household's line (→ DECISIONS #97).
 */
export function composeIngredientLine(
	name: string,
	quantity: string,
	unitLabelText: string
): { line: string; reading: ParsedIngredient | null } {
	const amount = quantity.trim()
		? [quantity.trim(), unitLabelText.trim()].filter(Boolean).join(' ')
		: '';
	const line = [amount, name.trim()].filter(Boolean).join(' ');

	return { line, reading: parseIngredient(line) };
}

/**
 * A stored row as one editable line again — the inverse of `parseIngredient`.
 *
 * The round trip holds in every language because `UNIT_ALIASES` reads each
 * language's spelling back to the same canonical unit: "2 EL Öl" saved from
 * German re-parses as `tbsp`, and the English form of the same row still says
 * "2 tbsp oil".
 */
export function formatIngredient(
	ingredient: {
		quantity: number | null;
		unit: string | null;
		name: string;
	},
	labels: UnitLabels = {}
): string {
	const amount = formatAmount(ingredient.quantity, ingredient.unit, labels);
	return amount ? `${amount} ${ingredient.name}` : ingredient.name;
}

/* ── Cooking for a different number of people ─────────────────────────────── */

/**
 * How much of the written recipe tonight's dinner is (→ SPEC §4.5).
 *
 * `1` whenever there is nothing to scale *from*: a recipe that never recorded
 * how many it serves can't be halved, because half of an unknown is unknown.
 * That's also why the screens hide the control in that case rather than
 * offering one that quietly does nothing.
 */
export function servingsFactor(writtenFor: number | null, cookingFor: number): number {
	if (!writtenFor || writtenFor <= 0 || !Number.isFinite(cookingFor) || cookingFor <= 0) return 1;
	return cookingFor / writtenFor;
}

/**
 * The same ingredients written out for a different number of people. Names and
 * units are untouched — six people need more grams of pasta, not different
 * pasta — and a line with no amount ("Salt", "a splash of oil") stays exactly
 * as written, because there is no number in it to double.
 */
export function scaleIngredients<T extends { quantity: number | null }>(
	ingredients: T[],
	factor: number
): T[] {
	if (factor === 1) return ingredients;
	return ingredients.map((row) => ({ ...row, quantity: scaleQuantity(row.quantity, factor) }));
}

/**
 * Where a scaled amount stops being a fraction and starts being a weight.
 * Below ten, the fraction *is* the amount — half a teaspoon, half an onion,
 * two thirds of an egg. At ten and above it's precision no kitchen scale can
 * honour, and "187½ g mushrooms" reads worse than the 188 g anybody would
 * actually weigh out.
 */
const WHOLE_FROM = 10;

/**
 * One amount, scaled and rounded to something a person can act on.
 *
 * The floor is the other half of that: a quarter of "0.02 tsp" rounds to
 * nothing, and an ingredient that silently loses its amount reads as "some",
 * which is a different instruction. Anything that was a number stays a number.
 *
 * Exported because a step's share of an ingredient is written in the same
 * recipe-as-written terms and has to move with it (→ `scaleStepUses`): 1 tsp of
 * the 3 doubles to 2 of 6, by the same arithmetic, or the parts stop adding up.
 */
export function scaleQuantity(quantity: number | null, factor: number): number | null {
	if (quantity === null || quantity <= 0) return quantity;

	const scaled = quantity * factor;
	if (scaled >= WHOLE_FROM) return Math.round(scaled);

	// Two decimals below that — every real amount plus a third of a cup.
	return Math.max(Math.round(scaled * 100) / 100, 0.01);
}

/**
 * "400", "1.5", "½", "1½" — fractions come back as the glyph they were typed
 * as, both because it's how recipes are written and because it round-trips:
 * "0.5 tsp salt" saved from "½ tsp salt" would drift a little further from the
 * original on every edit.
 */
export function formatQuantityValue(quantity: number): string {
	const whole = Math.floor(quantity);
	const rest = quantity - whole;

	// The stored value is rounded to 2dp, so ⅓ comes back as 0.33 and ⅛ as 0.13 —
	// compare with that tolerance (a hair over half a cent) rather than for equality.
	const glyph = FRACTION_GLYPHS.find(([value]) => Math.abs(rest - value) < 0.0051)?.[1];
	if (glyph) return whole ? `${whole}${glyph}` : glyph;

	// Number() drops the trailing zeros a REAL round-trip leaves behind (2.0 → 2).
	return String(Number(quantity.toFixed(2)));
}
