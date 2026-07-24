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
import { unitLabel, type UnitLabels } from './shopping.ts';

/** Units a recipe line may name. `L` is capitalised the way the design writes it. */
export const RECIPE_UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'pack', 'tbsp', 'tsp'] as const;

export type RecipeUnit = (typeof RECIPE_UNITS)[number];

/**
 * Everything a unit may be spelled as, lowercased → the canonical form. Written
 * out rather than derived: "l" must become "L" and "x" must become "pcs", and a
 * plural rule that turned "lemons" into a unit would be worse than no rule.
 *
 * Both languages read into the same table, because a household types in
 * whichever one is to hand: "2 EL Öl" and "2 tbsp oil" both store `tbsp`, and
 * the row then *shows* in whatever language the reader has on (→ `formatAmount`).
 * German spellings can be added without ambiguity — no English unit is spelled
 * like a German one meaning something else.
 *
 * A `Map`, not an object literal: a plain object answers `alias['constructor']`
 * with a function and `alias['__proto__']` with `Object.prototype`, neither of
 * which is nullish — so "2 constructor tomatoes" would sail past a `?? null`
 * fallback and reach the driver as a non-bindable value.
 */
const UNIT_ALIASES = new Map<string, RecipeUnit>(
	Object.entries({
		g: 'g',
		gr: 'g',
		gram: 'g',
		grams: 'g',
		gramm: 'g',
		kg: 'kg',
		kilo: 'kg',
		kilos: 'kg',
		kilogram: 'kg',
		kilograms: 'kg',
		kilogramm: 'kg',
		ml: 'ml',
		milliliter: 'ml',
		milliliters: 'ml',
		millilitre: 'ml',
		millilitres: 'ml',
		l: 'L',
		liter: 'L',
		liters: 'L',
		litre: 'L',
		litres: 'L',
		pcs: 'pcs',
		pc: 'pcs',
		piece: 'pcs',
		pieces: 'pcs',
		x: 'pcs',
		stk: 'pcs',
		'stk.': 'pcs',
		stück: 'pcs',
		pack: 'pack',
		packs: 'pack',
		packet: 'pack',
		packets: 'pack',
		pck: 'pack',
		'pck.': 'pack',
		packung: 'pack',
		packungen: 'pack',
		tbsp: 'tbsp',
		tbsps: 'tbsp',
		tablespoon: 'tbsp',
		tablespoons: 'tbsp',
		el: 'tbsp',
		esslöffel: 'tbsp',
		tsp: 'tsp',
		tsps: 'tsp',
		teaspoon: 'tsp',
		teaspoons: 'tsp',
		tl: 'tsp',
		teelöffel: 'tsp'
	} satisfies Record<string, RecipeUnit>)
);

/** The vulgar fractions a keyboard offers, and the ones recipes actually use. */
const FRACTIONS: Record<string, number> = {
	'½': 0.5,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 0.25,
	'¾': 0.75,
	'⅛': 0.125
};

/** Written back out for the few values that have a glyph — see `formatAmount`. */
const FRACTION_GLYPHS: [number, string][] = [
	[0.5, '½'],
	[0.25, '¼'],
	[0.75, '¾'],
	[1 / 3, '⅓'],
	[2 / 3, '⅔'],
	[0.125, '⅛']
];

/** A recipe asking for more than this is a typo, not an amount. */
export const RECIPE_QUANTITY_MAX = 9999;

const FRACTION_CHARS = Object.keys(FRACTIONS).join('');

/**
 * A leading amount: "1 1/2", "1/2", "1.5", "1,5", "1½", "½", "400".
 * Everything is optional except that *something* numeric has to match, which
 * the caller checks by looking at the matched length.
 */
const AMOUNT = new RegExp(
	`^(?:(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)` + // 1 1/2
		`|(\\d+)\\s*/\\s*(\\d+)` + // 1/2
		`|(\\d+(?:[.,]\\d+)?)\\s*([${FRACTION_CHARS}])?` + // 1.5 · 1½ · 400
		`|([${FRACTION_CHARS}]))` // ½
);

export type ParsedIngredient = {
	quantity: number | null;
	unit: string | null;
	name: string;
};

/**
 * One typed line → the columns it's stored in. `null` for a line with nothing
 * but whitespace, so callers can drop empty rows without a second check.
 */
export function parseIngredient(input: string): ParsedIngredient | null {
	const line = input.trim().replace(/\s+/g, ' ');
	if (!line) return null;

	const amount = AMOUNT.exec(line);
	// No leading number at all: the whole line is the name ("salt", "olive oil").
	if (!amount) return { quantity: null, unit: null, name: line };

	const quantity = amountValue(amount);
	const rest = line.slice(amount[0].length).trim();

	// "2" on its own, or "400 g" with nothing to measure — the line never named
	// a thing, so it becomes one rather than a dangling amount.
	if (!rest) return { quantity: null, unit: null, name: line };

	const [first, ...others] = rest.split(' ');
	const unit = UNIT_ALIASES.get(first.toLowerCase()) ?? null;
	const name = (unit ? others.join(' ') : rest).trim();

	// "400 g" again, this time with the unit eaten: keep the unit as the name.
	if (!name) return { quantity, unit: null, name: rest };

	// A unit measures a quantity — the same rule `services/shopping.ts` normalises
	// by. "0 kg flour" parses to no quantity, and `formatAmount` prints nothing
	// without one, so a surviving "kg" would be silently dropped the next time the
	// edit screen saved the line back.
	return { quantity, unit: quantity === null ? null : unit, name };
}

/** The number a matched `AMOUNT` stands for, clamped and rounded once. */
function amountValue(match: RegExpExecArray): number | null {
	const [, whole, mixedNumerator, mixedDenominator, numerator, denominator, decimal, glyph, bare] =
		match;

	const value = mixedDenominator
		? Number(whole) + Number(mixedNumerator) / Number(mixedDenominator)
		: denominator
			? Number(numerator) / Number(denominator)
			: decimal
				? Number(decimal.replace(',', '.')) + (glyph ? FRACTIONS[glyph] : 0)
				: bare
					? FRACTIONS[bare]
					: NaN;

	if (!Number.isFinite(value) || value <= 0) return null;

	// Two decimals is every real amount plus a third of a cup; the column is a
	// REAL, so this is only about not storing 0.6666666666666666.
	return Math.round(Math.min(value, RECIPE_QUANTITY_MAX) * 100) / 100;
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
 * `Packung` is a unit alias, and "7up" reads back as 7 of "up". There is no
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

/**
 * "400", "1.5", "½", "1½" — fractions come back as the glyph they were typed
 * as, both because it's how recipes are written and because it round-trips:
 * "0.5 tsp salt" saved from "½ tsp salt" would drift a little further from the
 * original on every edit.
 */
function formatQuantityValue(quantity: number): string {
	const whole = Math.floor(quantity);
	const rest = quantity - whole;

	// The stored value is rounded to 2dp, so ⅓ comes back as 0.33 — compare with
	// the same tolerance rather than for equality.
	const glyph = FRACTION_GLYPHS.find(([value]) => Math.abs(rest - value) < 0.005)?.[1];
	if (glyph) return whole ? `${whole}${glyph}` : glyph;

	// Number() drops the trailing zeros a REAL round-trip leaves behind (2.0 → 2).
	return String(Number(quantity.toFixed(2)));
}
