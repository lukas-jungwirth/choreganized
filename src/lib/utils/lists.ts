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
 * - **"2 l milk"** (`parseQuickAdd`): an amount typed in the same line.
 * - **Folded cards** (`readFolded` / `foldedCookie`): per device, in a cookie
 *   the load reads, so a folded card is folded in the first paint too.
 */
// Written with its extension so `node --test` can load this module (→ ingredients.ts).
import { parseIngredient, unitFromWord } from './ingredients.ts';
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
 * deleted (or never belonged here) can't be pointed at.
 */
export function listTarget(input: {
	typed: string;
	known: KnownName[];
	lists: { id: string }[];
	picked: string | null;
	fallback: string | null;
}): ListTarget {
	const exists = (id: string | null) => id !== null && input.lists.some((list) => list.id === id);

	if (input.picked !== null && exists(input.picked)) {
		return { storeId: input.picked, remembered: null };
	}

	const name = quickAddName(input.typed);
	const key = suggestionKey(name);
	const hit = key ? input.known.find((known) => suggestionKey(known.name) === key) : undefined;

	if (hit && exists(hit.storeId) && hit.storeId !== input.fallback) {
		return { storeId: hit.storeId, remembered: hit.name };
	}

	return { storeId: input.fallback, remembered: null };
}

/* ── "2 l milk" ───────────────────────────────────────────────────────────── */

export type QuickAdd = { name: string; quantity: number | null; unit: string | null };

/**
 * The first word has to *be* an amount ("2", "1,5", "½") or an amount fused
 * with a measuring unit ("500g"), or the line is all name. That is what keeps
 * "7up" and "4-Kornbrot" whole: the recipe parser is happy to read a leading
 * 7 off anything, and a recipe line is a different kind of writing.
 */
const LEADING_AMOUNT = /^(?:[\d.,/½⅓⅔¼¾⅛]+|\d+(?:[.,]\d+)?(?:g|kg|ml|l))$/i;

/**
 * One typed line → the row it becomes: "2 l milk" is Milk, 2 L; "6 eggs" is
 * eggs ×6; "milk" is milk with no amount. Uses the recipe parser
 * (`utils/ingredients.ts`), so a household writes amounts the same way in both
 * places, in either language ("2 Pck. Butter").
 *
 * An amount past the field's ceiling is a typo, not an amount: the line is kept
 * whole rather than quietly clamped.
 */
export function parseQuickAdd(text: string): QuickAdd {
	const line = text.trim().replace(/\s+/g, ' ');
	const [first] = line.split(' ');

	if (!first || !LEADING_AMOUNT.test(first)) return { name: line, quantity: null, unit: null };

	const parsed = parseIngredient(line);
	if (
		!parsed ||
		parsed.quantity === null ||
		parsed.quantity > QUANTITY_MAX ||
		// "2 kg", "500g": an amount with nothing to measure. The recipe parser
		// keeps the unit as the name; a row called "kg" helps nobody.
		unitFromWord(parsed.name) !== null
	) {
		return { name: line, quantity: null, unit: null };
	}

	return { name: parsed.name, quantity: parsed.quantity, unit: parsed.unit };
}

/** Just the name part of a typed line — what suggestions and the target key on. */
export function quickAddName(text: string): string {
	return parseQuickAdd(text).name;
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
