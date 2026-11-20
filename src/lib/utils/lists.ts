/**
 * Lists (plan 36, SPEC §3): the rules the add field and the overview share
 * between the server and the browser.
 *
 * - **The icons** a list may wear, a fixed set of twelve. The column is free
 *   text, so anything outside the set draws the basket.
 * - **Where a quick add lands** (`listTarget`): a list picked from the menu
 *   wins, then the list a known name went to last time, then the first
 *   shopping list. The app never guesses: an unknown name goes where the icon
 *   already points.
 * - **"Gurken x3"** (`parseQuickAdd`): an amount typed in the same line, at
 *   either end (plan 37).
 * - **Folded cards** (`readFolded` / `foldedCookie`): per device, in a cookie
 *   the load reads, so a folded card is folded in the first paint too.
 */
// Written with its extension so `node --test` can load this module (→ ingredients.ts).
import { unitFromWord } from './ingredients.ts';
import { QUANTITY_MAX, suggestionKey } from './shopping.ts';

/** The New list sheet's twelve icons [L6], in the order it shows them. */
export const LIST_ICONS = [
	'basket',
	'bag',
	'droplet',
	'pill',
	'hammer',
	'gift',
	'luggage',
	'tent',
	'door',
	'paw',
	'book',
	'home'
] as const;

export type ListIcon = (typeof LIST_ICONS)[number];

/**
 * The two kinds of list (plan 36): a shopping list, whose ticks settle under
 * "{n} bought" and are swept overnight, and a checklist, whose ticks stay in
 * place until "Start over".
 */
export const LIST_KINDS = ['buy', 'checklist'] as const;

export type ListKind = (typeof LIST_KINDS)[number];

export function isListKind(value: unknown): value is ListKind {
	return typeof value === 'string' && (LIST_KINDS as readonly string[]).includes(value);
}

/** What a list with no icon (every list from before plan 36) wears. */
export const DEFAULT_LIST_ICON: ListIcon = 'basket';

export function isListIcon(value: unknown): value is ListIcon {
	return typeof value === 'string' && (LIST_ICONS as readonly string[]).includes(value);
}

/** The icon to draw for a stored value, whatever the column holds. */
export function listIcon(value: string | null | undefined): ListIcon {
	return isListIcon(value) ? value : DEFAULT_LIST_ICON;
}

/* ── Where a quick add lands ──────────────────────────────────────────────── */

/** A name the household has used, and the list it last went to. */
export type KnownName = { name: string; storeId: string | null };

export type ListTarget = {
	/** The list the field adds to; null only when the household has no list at all. */
	storeId: string | null;
	/**
	 * Set when the target moved by itself because the typed name is known: the
	 * name as the household spells it, for the line under the field [L3].
	 */
	remembered: string | null;
};

/**
 * Where what is typed goes (→ SPEC §3.1, plan 36 [L2] [L3]).
 *
 * 1. A list picked from the menu wins, for as long as the screen is open.
 * 2. Otherwise a name the household knows goes back to the list it went to
 *    last, as long as that list still exists.
 * 3. Otherwise the first shopping list (`fallback`).
 *
 * `lists` is every list that exists, so a remembered list that has since been
 * deleted (or never belonged here) can't be pointed at. A remembered list that
 * has become a checklist is passed over too: a checklist is only ever picked
 * (plan 36 step 2), the icon never moves there by itself.
 */
export function listTarget(input: {
	typed: string;
	known: KnownName[];
	lists: { id: string; kind?: ListKind }[];
	picked: string | null;
	fallback: string | null;
}): ListTarget {
	const exists = (id: string | null) => id !== null && input.lists.some((list) => list.id === id);

	if (input.picked !== null && exists(input.picked)) {
		return { storeId: input.picked, remembered: null };
	}

	// The known names as rule 1 reads them: a line the household uses whole
	// ("Windeln 4") is looked up whole, not as "Windeln".
	const name = quickAddName(
		input.typed,
		new Set(input.known.map((known) => suggestionKey(known.name)))
	);
	const key = suggestionKey(name);
	const hit = key ? input.known.find((known) => suggestionKey(known.name) === key) : undefined;

	const shopping = (id: string | null) =>
		input.lists.some((list) => list.id === id && list.kind !== 'checklist');

	if (hit && shopping(hit.storeId) && hit.storeId !== input.fallback) {
		return { storeId: hit.storeId, remembered: hit.name };
	}

	return { storeId: input.fallback, remembered: null };
}

/* ── "Gurken x3" ─────────────────────────────────────────────────────────── */

export type QuickAdd = { name: string; quantity: number | null; unit: string | null };

/** Something that can say whether a `suggestionKey` is a name the household uses. */
export type KnownKeys = { has(key: string): boolean };

/** The units a shopping row may wear. `tbsp`/`tsp` are recipe units (plan 37). */
const SHOPPING_UNITS = new Set(['g', 'kg', 'ml', 'L', 'pcs', 'pack']);

/** The Austrian deli counter: a Deka is ten grams ("20 dag Extrawurst" → 200 g). */
const DEKA = new Set(['dag', 'dkg', 'deka']);

/**
 * Words after which a trailing number is a size, not an amount: "Windeln Gr. 4",
 * "Sonnencreme LSF 30", "Kaffee Nr 3" (plan 37 rule 7).
 */
const SIZE_WORDS = new Set([
	'gr',
	'gr.',
	'größe',
	'grösse',
	'groesse',
	'nr',
	'nr.',
	'no',
	'no.',
	'typ',
	'type',
	'size',
	'lsf',
	'spf',
	'stufe',
	'klasse',
	'din'
]);

const GLYPHS: Record<string, number> = {
	'½': 0.5,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 0.25,
	'¾': 0.75,
	'⅛': 0.125
};
const GLYPH = `[${Object.keys(GLYPHS).join('')}]`;

const WHOLE = /^\d+$/;
const DECIMAL = /^\d+[.,]\d+$/;
const SLASH = /^(\d+)\/(\d+)$/;
const MIXED = new RegExp(`^(\\d*)(${GLYPH})$`);
/** "500g", "2l", "1,5kg", "3stk", "15dkg", "2pkg.": a number fused with a unit. */
const FUSED = /^(\d+(?:[.,]\d+)?)(\p{L}+\.?)$/u;
/** "3x", "x3", "3×": a count marker in one token. */
const MARKER = /^(?:(\d+)[x×]|[x×](\d+))$/i;
const X = /^[x×]$/i;

type Amount = { quantity: number; unit: string | null };

/** A unit a shopping row may wear, and what the number is multiplied by. */
function unitOf(word: string): { unit: string; factor: number } | null {
	const lower = word.toLowerCase();
	if (DEKA.has(lower.replace(/\.$/, ''))) return { unit: 'g', factor: 10 };
	if (X.test(lower)) return null;
	const unit = unitFromWord(lower);
	return unit && SHOPPING_UNITS.has(unit) ? { unit, factor: 1 } : null;
}

/**
 * One token as a number, and what kind: a whole number, a decimal ("1,5"), or a
 * fraction ("1/2", "½", "1½"). Null when it isn't one ("1.", "4-Korn", "10er").
 */
function numberOf(token: string): { value: number; kind: 'whole' | 'decimal' | 'fraction' } | null {
	if (WHOLE.test(token)) return { value: Number(token), kind: 'whole' };
	if (DECIMAL.test(token)) return { value: Number(token.replace(',', '.')), kind: 'decimal' };
	const slash = SLASH.exec(token);
	if (slash && Number(slash[2]) > 0) {
		return { value: Number(slash[1]) / Number(slash[2]), kind: 'fraction' };
	}
	const mixed = MIXED.exec(token);
	if (mixed) return { value: Number(mixed[1] || 0) + GLYPHS[mixed[2]], kind: 'fraction' };
	return null;
}

/** "500g", "2l", "15dkg": a number fused with a unit, in one token. */
function fusedOf(token: string): Amount | null {
	const match = FUSED.exec(token);
	if (!match) return null;
	const unit = unitOf(match[2]);
	if (!unit) return null;
	return { quantity: Number(match[1].replace(',', '.')) * unit.factor, unit: unit.unit };
}

/** "3x", "x3": the count, or null. A count is a whole number. */
function markerOf(token: string): number | null {
	const match = MARKER.exec(token);
	return match ? Number(match[1] ?? match[2]) : null;
}

/** "Gurken," → "Gurken": separators left at a name's edges go. */
function trimName(name: string): string {
	return name.replace(/^[\s,;:–-]+|[\s,;:–-]+$/gu, '');
}

/**
 * The finished reading of a line, or null when it isn't one: a name with a
 * letter in it that isn't itself a unit, and an amount the row can hold.
 * Grams and millilitres step up to kilos and litres at a thousand.
 */
function accept(rawName: string, amount: Amount | null): QuickAdd | null {
	if (!amount) return null;
	const name = trimName(rawName);
	if (!/\p{L}/u.test(name) || unitOf(name) || X.test(name)) return null;

	let { quantity, unit } = amount;
	if (unit === 'g' && quantity >= 1000) [quantity, unit] = [quantity / 1000, 'kg'];
	else if (unit === 'ml' && quantity >= 1000) [quantity, unit] = [quantity / 1000, 'L'];
	if (!(quantity > 0) || quantity > QUANTITY_MAX) return null;

	return { name, quantity, unit };
}

/** A count from a marker or a bare number: whole, from 1 to the field's ceiling. */
function count(value: number | null): Amount | null {
	return value !== null && Number.isInteger(value) && value >= 1 && value <= QUANTITY_MAX
		? { quantity: value, unit: null }
		: null;
}

/**
 * A whole bracket's worth of amount: "(10)", "(1 kg)", "(6x)". Anything else in
 * it ("(E27)") is part of the name.
 */
function bracketOf(inner: string): Amount | null {
	const tokens = inner.trim().split(' ').filter(Boolean);
	if (tokens.length === 1) {
		const [token] = tokens;
		const number = numberOf(token);
		if (number?.kind === 'whole') return count(number.value);
		return fusedOf(token) ?? count(markerOf(token));
	}
	if (tokens.length === 2) {
		const number = numberOf(tokens[0]);
		const unit = unitOf(tokens[1]);
		if (number && unit) return { quantity: number.value * unit.factor, unit: unit.unit };
		if (number?.kind === 'whole' && X.test(tokens[1])) return count(number.value);
	}
	return null;
}

/** "Wasser 6 x 1,5l": an amount right after an x is a pack size, not what to buy. */
const isNumber = (token: string | undefined) => token !== undefined && numberOf(token) !== null;

/**
 * One typed line → the row it becomes (plan 37, SPEC §3.1): "Gurken x3" is
 * Gurken ×3, "Milch 2l" is Milch 2 L, "20 dag Extrawurst" is 200 g, "7up" and
 * "1. Mai Kerzen" stay what they say. The amount may stand at either end; the
 * rules below are tried in order and the first that leaves a real name wins.
 *
 * `known` holds the `suggestionKey`s of the names the household already uses:
 * a line that is one of them is that name and is never split (rule 1), which is
 * how a correction ("Windeln 4" is the size, not four) sticks.
 *
 * One function for the field's chip and the server's add, so what the chip
 * promised is what lands.
 */
export function parseQuickAdd(text: string, known?: KnownKeys): QuickAdd {
	const line = text.trim().replace(/\s+/g, ' ');
	const whole: QuickAdd = { name: line, quantity: null, unit: null };
	if (!line) return whole;

	// 1. A name the household already uses.
	if (known?.has(suggestionKey(line))) return whole;

	const tokens = line.split(' ');
	const last = tokens.length - 1;

	// 2. Brackets at the end: "Eier (10)", "Mehl (1 kg)", "Bier (6x)".
	const bracket = /^(.*?)\s*\(([^()]*)\)$/.exec(line);
	if (bracket) {
		const found = accept(bracket[1], bracketOf(bracket[2]));
		if (found) return found;
	}

	// 3. A count marker in front: "3x Gurken", "x3 Gurken", "3 x Gurken" — but
	//    not "3 x 40 Schrauben", where the x makes a size.
	{
		const fused = markerOf(tokens[0]);
		if (fused !== null && !isNumber(tokens[1])) {
			const found = accept(tokens.slice(1).join(' '), count(fused));
			if (found) return found;
		}
		const number = numberOf(tokens[0]);
		if (number?.kind === 'whole' && X.test(tokens[1] ?? '') && !isNumber(tokens[2])) {
			const found = accept(tokens.slice(2).join(' '), count(number.value));
			if (found) return found;
		}
	}

	// 4. A count marker at the end: "Gurken x3", "Gurken 3x", "Gurken x 3",
	//    "Gurken 3 x" — but not "Schrauben 4 x 40".
	{
		const fused = markerOf(tokens[last]);
		if (fused !== null) {
			const found = accept(tokens.slice(0, last).join(' '), count(fused));
			if (found) return found;
		}
		if (last >= 2 && X.test(tokens[last - 1]) && !isNumber(tokens[last - 2])) {
			const number = numberOf(tokens[last]);
			if (number?.kind === 'whole') {
				const found = accept(tokens.slice(0, last - 1).join(' '), count(number.value));
				if (found) return found;
			}
		}
		if (last >= 1 && X.test(tokens[last])) {
			const number = numberOf(tokens[last - 1]);
			if (number?.kind === 'whole') {
				const found = accept(tokens.slice(0, last - 1).join(' '), count(number.value));
				if (found) return found;
			}
		}
	}

	// 5. An amount in front: "500g Mehl", "2 l Milch", "3 Gurken", "½ Brot". Not
	//    a bare decimal ("0,5 Cola"), and not before "%", or "x" / "in" and a
	//    number ("100 % Orangensaft", "2 in 1 Shampoo").
	{
		const fused = fusedOf(tokens[0]);
		if (fused) {
			const found = accept(tokens.slice(1).join(' '), fused);
			if (found) return found;
		}
		const number = numberOf(tokens[0]);
		const unit = tokens[1] !== undefined ? unitOf(tokens[1]) : null;
		if (number && unit) {
			const found = accept(tokens.slice(2).join(' '), {
				quantity: number.value * unit.factor,
				unit: unit.unit
			});
			if (found) return found;
		}
		const next = tokens[1] ?? '';
		const guarded =
			next.startsWith('%') ||
			((X.test(next) || next.toLowerCase() === 'in') && isNumber(tokens[2]));
		if (number && number.kind !== 'decimal' && !unit && !guarded) {
			const amount =
				number.kind === 'whole' ? count(number.value) : { quantity: number.value, unit: null };
			const found = accept(tokens.slice(1).join(' '), amount);
			if (found) return found;
		}
	}

	// 6. A measured amount at the end: "Milch 2l", "Gurken 3 Stk", "Erdäpfel
	//    1,5 kg". Not right after an x ("Wasser 6 x 1,5l").
	{
		const fused = fusedOf(tokens[last]);
		if (fused && !X.test(tokens[last - 1] ?? '')) {
			const found = accept(tokens.slice(0, last).join(' '), fused);
			if (found) return found;
		}
		const unit = unitOf(tokens[last]);
		const number = last >= 1 ? numberOf(tokens[last - 1]) : null;
		if (unit && number && !X.test(tokens[last - 2] ?? '')) {
			const found = accept(tokens.slice(0, last - 1).join(' '), {
				quantity: number.value * unit.factor,
				unit: unit.unit
			});
			if (found) return found;
		}
	}

	// 7. A bare whole number at the end, 1 to 99: "Gurken 3", "Eier 10". Not
	//    after a size word or an x, and never three digits ("Mehl 480").
	if (last >= 1 && /^\d{1,2}$/.test(tokens[last])) {
		const before = tokens[last - 1].toLowerCase();
		if (!SIZE_WORDS.has(before) && !X.test(before)) {
			const found = accept(tokens.slice(0, last).join(' '), count(Number(tokens[last])));
			if (found) return found;
		}
	}

	return whole;
}

/** Just the name part of a typed line — what suggestions and the target key on. */
export function quickAddName(text: string, known?: KnownKeys): string {
	return parseQuickAdd(text, known).name;
}

/* ── Folded cards ─────────────────────────────────────────────────────────── */

/** Per device, like the theme (→ DECISIONS #119): which cards are folded. */
export const FOLDED_COOKIE = 'lists_folded';

/** "Other" has no id of its own; this stands in for it in the cookie. */
export const OTHER_LIST_KEY = 'other';

/** A year: a preference, not a session. */
const FOLDED_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Ids are UUIDs (the seed's are "seed:<uuid>:store:grocery"); anything else in
 * the cookie is dropped. No dots, which is the separator.
 */
const FOLD_KEY = /^[A-Za-z0-9_:-]{1,80}$/;

/** The cookie's value → the folded list keys. Junk in, nothing out. */
export function readFolded(value: string | undefined | null): string[] {
	if (!value) return [];
	let decoded: string;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		return [];
	}
	return [...new Set(decoded.split('.').filter((key) => FOLD_KEY.test(key)))].slice(-50);
}

/** The `document.cookie` assignment that stores these folded keys. */
export function foldedCookie(keys: Iterable<string>): string {
	const value = [...keys].filter((key) => FOLD_KEY.test(key)).join('.');
	return `${FOLDED_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${FOLDED_MAX_AGE}; SameSite=Lax`;
}
