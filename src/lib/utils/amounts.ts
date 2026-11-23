/**
 * Reading an amount: the one place that knows how a number, a unit and a
 * counting word are spelled (→ plan 42, DECISIONS #311, #313).
 *
 * Three readers used to keep their own patterns and disagreed: a recipe line
 * (`ingredients.ts`), a shopping line (`lists.ts`) and the amount inside a
 * step's sentence (`step-amounts.ts`). "20 dag Extrawurst" was 200 g on a list
 * and 20 × "dag Extrawurst" in a recipe. They now share everything here and
 * keep only the rules about *where* in their line an amount may stand, which
 * really do differ: a shopping note puts it at either end, a recipe line leads
 * with it.
 *
 * - **Units** are the eight the app calculates with. Every spelling in both
 *   languages reads to one canonical key (`unitFromWord`).
 * - **Counting words** ("2 Zehen", "1 Bund", "1 Dose", "a pinch") are what a
 *   recipe counts in besides those. The app does no arithmetic across them; it
 *   only needs to know that the word belongs to the amount and not to the name
 *   (`countingWord`). A recipe row keeps the word as it was written.
 *
 * Pure, no `$lib`, relative imports with their extension (→ `ingredients.ts`).
 */

/** Units a recipe line may name. `L` is capitalised the way the design writes it. */
export const RECIPE_UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'pack', 'tbsp', 'tsp'] as const;

export type RecipeUnit = (typeof RECIPE_UNITS)[number];

/**
 * Everything a unit may be spelled as, lowercased → the canonical form. Written
 * out rather than derived: "l" must become "L", and a plural rule that turned
 * "lemons" into a unit would be worse than no rule.
 *
 * Both languages read into the same table, because a household types in
 * whichever one is to hand: "2 EL Öl" and "2 tbsp oil" both store `tbsp`, and
 * the row then *shows* in whatever language the reader has on.
 *
 * A `Map`, not an object literal: a plain object answers `alias['constructor']`
 * with a function and `alias['__proto__']` with `Object.prototype`, neither of
 * which is nullish, so "2 constructor tomatoes" would sail past a `?? null`
 * fallback and reach the driver as a non-bindable value.
 *
 * "x" is not here: "3 x Gurken" is a count, not a unit (→ `isTimes`).
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
		stk: 'pcs',
		'stk.': 'pcs',
		stück: 'pcs',
		stueck: 'pcs',
		pack: 'pack',
		packs: 'pack',
		packet: 'pack',
		packets: 'pack',
		pck: 'pack',
		'pck.': 'pack',
		packung: 'pack',
		packungen: 'pack',
		päckchen: 'pack',
		pkg: 'pack',
		'pkg.': 'pack',
		tbsp: 'tbsp',
		'tbsp.': 'tbsp',
		tbsps: 'tbsp',
		tablespoon: 'tbsp',
		tablespoons: 'tbsp',
		el: 'tbsp',
		'el.': 'tbsp',
		esslöffel: 'tbsp',
		essloeffel: 'tbsp',
		tsp: 'tsp',
		'tsp.': 'tsp',
		tsps: 'tsp',
		teaspoon: 'tsp',
		teaspoons: 'tsp',
		tl: 'tsp',
		'tl.': 'tsp',
		teelöffel: 'tsp',
		teeloeffel: 'tsp'
	} satisfies Record<string, RecipeUnit>)
);

/** A word as a unit ("EL" → `tbsp`, "g" → `g`), or null. */
export function unitFromWord(word: string): RecipeUnit | null {
	return UNIT_ALIASES.get(word.toLowerCase()) ?? null;
}

/** Every spelling `unitFromWord` knows, longest first, for building a pattern. */
export const UNIT_WORDS: readonly string[] = [...UNIT_ALIASES.keys()].sort(
	(a, b) => b.length - a.length
);

/** The Austrian deli counter: a Deka is ten grams ("20 dag Extrawurst" → 200 g). */
const DEKA = new Set(['dag', 'dkg', 'deka']);

/**
 * A word as a unit with what the number is multiplied by: every `unitFromWord`
 * spelling at 1, and the Deka as ten grams.
 */
export function measureOf(word: string): { unit: RecipeUnit; factor: number } | null {
	const lower = word.toLowerCase();
	if (DEKA.has(lower.replace(/\.$/, ''))) return { unit: 'g', factor: 10 };
	const unit = unitFromWord(lower);
	return unit ? { unit, factor: 1 } : null;
}

/* ── Counting words ───────────────────────────────────────────────────────── */

/**
 * What a recipe counts in besides the eight units, each spelling → one key.
 * The key is only for comparing ("Zehe" in the list, "Zehen" in the step); a
 * row stores the word as its line wrote it. A word that is as often an
 * ingredient as a measure stays out ("Kugel", "Rolle", "Stück" is a unit).
 */
const COUNTING = new Map<string, string>(
	Object.entries({
		zehe: ['zehe', 'zehen'],
		bund: ['bund', 'bunde'],
		dose: ['dose', 'dosen'],
		becher: ['becher'],
		glas: ['glas', 'gläser'],
		flasche: ['flasche', 'flaschen'],
		prise: ['prise', 'prisen'],
		msp: ['msp', 'msp.', 'messerspitze', 'messerspitzen'],
		schuss: ['schuss'],
		spritzer: ['spritzer'],
		scheibe: ['scheibe', 'scheiben'],
		stange: ['stange', 'stangen'],
		zweig: ['zweig', 'zweige'],
		blatt: ['blatt', 'blätter'],
		würfel: ['würfel'],
		handvoll: ['handvoll'],
		tasse: ['tasse', 'tassen'],
		kopf: ['kopf', 'köpfe'],
		knolle: ['knolle', 'knollen'],
		stiel: ['stiel', 'stiele'],
		tropfen: ['tropfen'],
		beutel: ['beutel'],
		tafel: ['tafel', 'tafeln'],
		clove: ['clove', 'cloves'],
		bunch: ['bunch', 'bunches'],
		can: ['can', 'cans'],
		tin: ['tin', 'tins'],
		jar: ['jar', 'jars'],
		bottle: ['bottle', 'bottles'],
		pinch: ['pinch', 'pinches'],
		dash: ['dash', 'dashes'],
		slice: ['slice', 'slices'],
		stick: ['stick', 'sticks'],
		stalk: ['stalk', 'stalks'],
		sprig: ['sprig', 'sprigs'],
		leaf: ['leaf', 'leaves'],
		cube: ['cube', 'cubes'],
		handful: ['handful', 'handfuls'],
		head: ['head', 'heads'],
		bag: ['bag', 'bags']
	}).flatMap(([key, spellings]) => spellings.map((spelling) => [spelling, key] as const))
);

/** The counting words something is sold in: on a shopping list these are a pack. */
const CONTAINERS = new Set([
	'dose',
	'becher',
	'glas',
	'flasche',
	'beutel',
	'can',
	'tin',
	'jar',
	'bottle',
	'bag'
]);

/** A counting word's key ("Zehen" → `zehe`), or null when the word is not one. */
export function countingWord(word: string): string | null {
	return COUNTING.get(word.toLowerCase()) ?? null;
}

/** Whether a counting word is a container ("Dose", "jar"): a pack on a shopping list. */
export function isContainerWord(word: string): boolean {
	const key = countingWord(word);
	return key !== null && CONTAINERS.has(key);
}

/** Every counting-word spelling, longest first, for building a pattern. */
export const COUNTING_WORDS: readonly string[] = [...COUNTING.keys()].sort(
	(a, b) => b.length - a.length
);

/** One spelling per counting word, as a list for a person or a prompt: "zehe", "bund", … */
export const COUNTING_KEYS: readonly string[] = [...new Set(COUNTING.values())];

/** A household's own unit word as stored for comparing: lowercased (→ plan 44). */
export function unitWordKey(word: string): string {
	return word.trim().toLowerCase();
}

/** A unit word without its plural ending: "Ringe" and "Ring" are one word to compare. */
export function unitStem(word: string): string {
	return unitWordKey(word).replace(/(?:en|e|n|s)$/, '');
}

/**
 * The household's own word a page word is (→ plan 44): `known` holds them
 * lowercased, and "Ringe" is the "Ring" a household added. Null when it is none.
 */
export function householdUnitKey(
	word: string,
	known: ReadonlySet<string> | undefined
): string | null {
	if (!known?.size) return null;
	const lower = unitWordKey(word);
	const stem = unitStem(word);
	for (const key of known) {
		if (key === lower || key === stem || unitStem(key) === stem) return key;
	}
	return null;
}

/** The longest unit word a household may add ("Messerspitze" fits). */
export const UNIT_WORD_MAX = 20;

/** Whether a word is already a unit or a counting word the reader knows (→ DECISIONS #321). */
export function isKnownUnitWord(word: string): boolean {
	return measureOf(word) !== null || countingWord(word) !== null;
}

/**
 * What a unit or counting word measures in, for comparing two spellings: the
 * canonical unit ("EL" → `tbsp`), a counting word's key ("Zehen" → `zehe`),
 * or null. A stored unit reads to itself (`L` → `L`).
 */
export function measureKey(word: string | null | undefined): string | null {
	if (!word) return null;
	return unitFromWord(word) ?? countingWord(word);
}

/* ── Numbers ──────────────────────────────────────────────────────────────── */

/** The vulgar fractions a keyboard offers, and the ones recipes actually use. */
export const FRACTIONS: Record<string, number> = {
	'½': 0.5,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 0.25,
	'¾': 0.75,
	'⅛': 0.125
};

export const FRACTION_CHARS = Object.keys(FRACTIONS).join('');

const GLYPH = `[${FRACTION_CHARS}]`;

/** A recipe asking for more than this is a typo, not an amount. */
export const RECIPE_QUANTITY_MAX = 9999;

const WHOLE = /^\d+$/;
const DECIMAL = /^\d+[.,]\d+$/;
const SLASH = /^(\d+)\/(\d+)$/;
const MIXED = new RegExp(`^(\\d*)(${GLYPH})$`);
/** "500g", "2l", "1,5kg", "3stk", "15dkg", "2pkg.": a number fused with a word. */
const FUSED = /^(\d+(?:[.,]\d+)?)(\p{L}+\.?)$/u;
/** "3x", "x3", "3×": a count marker in one token. */
const MARKER = /^(?:(\d+)[x×]|[x×](\d+))$/i;
const TIMES = /^[x×]$/i;

export type NumberKind = 'whole' | 'decimal' | 'fraction';

/**
 * One token as a number, and what kind: a whole number, a decimal ("1,5"), or a
 * fraction ("1/2", "½", "1½"). Null when it isn't one ("1.", "4-Korn", "10er").
 */
export function numberOf(token: string): { value: number; kind: NumberKind } | null {
	if (WHOLE.test(token)) return { value: Number(token), kind: 'whole' };
	if (DECIMAL.test(token)) return { value: Number(token.replace(',', '.')), kind: 'decimal' };
	const slash = SLASH.exec(token);
	if (slash && Number(slash[2]) > 0) {
		return { value: Number(slash[1]) / Number(slash[2]), kind: 'fraction' };
	}
	const mixed = MIXED.exec(token);
	if (mixed) return { value: Number(mixed[1] || 0) + FRACTIONS[mixed[2]], kind: 'fraction' };
	return null;
}

/** "500g" → 500 and "g": a number fused with a word, whatever the word is. */
export function fusedOf(token: string): { value: number; word: string } | null {
	const match = FUSED.exec(token);
	return match ? { value: Number(match[1].replace(',', '.')), word: match[2] } : null;
}

/** "3x", "x3": the count, or null. */
export function markerOf(token: string): number | null {
	const match = MARKER.exec(token);
	return match ? Number(match[1] ?? match[2]) : null;
}

/** A lone "x" or "×": "3 x Gurken". */
export function isTimes(token: string | undefined): boolean {
	return token !== undefined && TIMES.test(token);
}

/**
 * An amount at the start of a line: "1 1/2", "1/2", "1.5", "1,5", "1½", "1 ½",
 * "½", "400". Something numeric has to match.
 */
const LEADING = new RegExp(
	`^(?:(\\d+)\\s+(\\d+)\\s*/\\s*(\\d+)` + // 1 1/2
		`|(\\d+)\\s*/\\s*(\\d+)` + // 1/2
		`|(\\d+(?:[.,]\\d+)?)\\s*(${GLYPH})?` + // 1.5 · 1½ · 400
		`|(${GLYPH}))` // ½
);

/** The rest of a range after its first amount: "-3", "– 3", "bis 3", "to 3", "-½". */
const RANGE_REST = new RegExp(
	`^(?:[-–—]|bis\\b|to\\b)\\s*(?:\\d+\\s*/\\s*\\d+|\\d+(?:[.,]\\d+)?\\s*${GLYPH}?|${GLYPH})(?=\\s|$|\\p{L})`,
	'iu'
);

/**
 * The amount a line leads with: its value (null when it is zero or not a real
 * number) and how many characters it took. Null when the line does not start
 * with a number at all.
 */
export function leadingAmount(text: string): { value: number | null; length: number } | null {
	const match = LEADING.exec(text);
	return match ? { value: amountValue(match), length: match[0].length } : null;
}

/**
 * A number as a sentence writes one, as pattern source: "2", "1,5", "1.5",
 * "1/2", "1½", "½". For the reader that meets an amount in the middle of a
 * step's text (→ `step-amounts.ts`).
 */
export const NUMBER_PATTERN = String.raw`\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s?${GLYPH})?|${GLYPH}`;

/** How many characters of `rest` are the tail of a range ("- 3 EL …" → 3). */
export function rangeLength(rest: string): number {
	return RANGE_REST.exec(rest)?.[0].length ?? 0;
}

/**
 * A bare amount ("1½", "0,5", "3/4", "400") and nothing else: for the fields
 * that ask for a number on its own. A trailing anything ("2 tsp", "two") is not
 * a bare amount and answers null rather than quietly keeping the 2.
 */
export function parseQuantity(input: string): number | null {
	const text = input.trim().replace(/\s+/g, ' ');
	if (!text) return null;

	const amount = leadingAmount(text);
	return amount && amount.length === text.length ? amount.value : null;
}

/** A value as an amount worth storing: positive, under the cap, two decimals. */
export function clampAmount(value: number): number | null {
	if (!Number.isFinite(value) || value <= 0) return null;

	// Two decimals is every real amount plus a third of a cup; the column is a
	// REAL, so this is only about not storing 0.6666666666666666.
	return Math.round(Math.min(value, RECIPE_QUANTITY_MAX) * 100) / 100;
}

/** The number a matched `LEADING` stands for, clamped and rounded once. */
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

	return clampAmount(value);
}
