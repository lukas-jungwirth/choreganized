/**
 * The things the shopping list's server and browser halves must agree on:
 * which units exist, how a quantity is written, how the list is split into
 * "still to buy" and "recently bought", and how the add field completes what
 * you type.
 *
 * The split matters twice: the service does it for the first paint, and the
 * page does it again in the browser when a check is applied optimistically —
 * ticking a box moves the row out of its store group and into "recently
 * bought" *before* the server answers. So it is one function called from both
 * sides (→ DECISIONS #105), not a SQL half and a JavaScript half kept in step.
 */

/** The units [3a] offers. Free pick, `pcs` preselected (→ SPEC §3.2). */
export const UNITS = ['pcs', 'g', 'kg', 'ml', 'L', 'pack'] as const;

export type Unit = (typeof UNITS)[number];

export const DEFAULT_UNIT: Unit = 'pcs';

/** Field limits, shared by the `maxlength` attribute and the action's guard. */
export const ITEM_NAME_MAX = 80;
export const STORE_NAME_MAX = 40;
export const QUANTITY_MAX = 999;

export function isUnit(value: unknown): value is Unit {
	return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

/**
 * How a unit is *shown*, keyed by how it is *stored*. The column keeps the
 * canonical spelling ('pcs', 'tbsp') in every language, so switching language
 * re-labels the list rather than rewriting it — and a unit somebody typed that
 * isn't in the table falls through unchanged (→ `$lib/i18n/messages/en.ts`).
 */
export type UnitLabels = Record<string, string>;

/**
 * How a stored unit is shown, or the unit itself when we have no name for it.
 *
 * `Object.hasOwn`, not `labels[unit] ?? unit`: the column is deliberately free
 * text (→ `services/shopping.ts` `normalizeUnit`), so `unit` can be "constructor"
 * or "toString", and a plain object answers those with a *function* — which is
 * not nullish, sails past `??` and renders as "[native code]". Same trap
 * `parseIngredient` avoids by keeping its alias table in a `Map`.
 */
export function unitLabel(unit: string, labels: UnitLabels = {}): string {
	return Object.hasOwn(labels, unit) ? labels[unit] : unit;
}

/**
 * The compact quantity a row shows: "×6" for pieces, "2 L" for anything
 * measured, nothing at all when there's no quantity to speak of.
 *
 * "×1" is deliberately nothing: [3a]'s stepper opens at 1, so every item added
 * through the sheet would otherwise wear a badge that says no more than its own
 * name does. One litre still reads "1 L" — there the unit is the information.
 */
export function formatQuantity(
	quantity: number | null,
	unit: string | null,
	labels: UnitLabels = {}
): string {
	if (quantity === null || quantity <= 0) return '';

	// REAL column: 2 must not render as "2.0", and 1.5 must keep its half.
	const amount = String(Number(quantity));

	if (!unit || unit === DEFAULT_UNIT) return quantity === 1 ? '' : `×${amount}`;

	return `${amount} ${unitLabel(unit, labels)}`;
}

/* ── The shape of the list ────────────────────────────────────────────────── */

/** The fields the split is decided on — a subset of the row and of the list item. */
export type OrderedItem = {
	id: string;
	/** Which store's group it belongs to; null = the virtual "Other". */
	storeId: string | null;
	/** ms epoch; null = still to buy. */
	checkedAt: number | null;
	createdAt: number;
	/** Manual walking order within the group, low first (→ `compareOpen`). */
	sortOrder: number;
};

/** A store's slice of the list. `name` is null for "Other", which the screen names. */
export type ItemGroup<T> = {
	storeId: string | null;
	name: string | null;
	items: T[];
};

export type SplitList<T> = {
	/** Only what's still to buy, by store in walking order, "Other" last. */
	groups: ItemGroup<T>[];
	/** Everything checked off, across all stores, most recently bought first. */
	bought: T[];
};

/**
 * Open items in their manual walking order (drag-to-reorder, → SPEC §3.1).
 * `sortOrder` leads; a list nobody has dragged has it all at 0 (the column's
 * default), so `createdAt` then decides and the group keeps the order it was
 * added in. `id` is the final tiebreaker so a group whose items were written in
 * the same millisecond — every bulk insert, including the seed — has one stable
 * order instead of flickering between renders.
 */
function compareOpen(a: OrderedItem, b: OrderedItem): number {
	if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
	if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Bought items newest first — "recently bought" is a trip in reverse. */
function compareBought(a: OrderedItem, b: OrderedItem): number {
	if (a.checkedAt !== b.checkedAt) return (b.checkedAt ?? 0) - (a.checkedAt ?? 0);
	return -compareOpen(a, b);
}

/**
 * The list as it is rendered (→ SPEC §3.1): the store groups hold what's still
 * to buy, and everything ticked off leaves them for one "recently bought" list
 * at the bottom — a shopping trip shouldn't push what you still need off the
 * screen. A store with nothing left to buy drops out entirely; its bought items
 * are in the second list like everyone else's.
 */
export function splitList<T extends OrderedItem>(
	items: T[],
	stores: { id: string; name: string }[]
): SplitList<T> {
	const known = new Set(stores.map((store) => store.id));
	const open = new Map<string | null, T[]>();
	const bought: T[] = [];

	for (const item of items) {
		if (item.checkedAt !== null) {
			bought.push(item);
			continue;
		}
		// A store nobody here has heard of is the same as no store at all. It
		// shouldn't happen — deleting a store sets its items' `storeId` to NULL —
		// but a group nothing renders would take its items off the screen
		// silently, which is the one failure a shopping list must not have.
		const key = item.storeId !== null && known.has(item.storeId) ? item.storeId : null;
		const bucket = open.get(key);
		if (bucket) bucket.push(item);
		else open.set(key, [item]);
	}

	const groups: ItemGroup<T>[] = [];

	for (const store of stores) {
		const storeItems = open.get(store.id);
		if (storeItems?.length) {
			groups.push({ storeId: store.id, name: store.name, items: storeItems.sort(compareOpen) });
		}
	}

	// Items filed under no store — quick-added before any store existed, or in a
	// store since deleted — are their own group, always last (→ SPEC §3.1).
	const other = open.get(null);
	if (other?.length) groups.push({ storeId: null, name: null, items: other.sort(compareOpen) });

	return { groups, bought: bought.sort(compareBought) };
}

/* ── What the add field completes from ────────────────────────────────────── */

/** How many suggestions a field offers at once — a glance, not a catalogue. */
export const SUGGESTIONS_SHOWN = 6;

/**
 * One household, one row per *thing*, however it was capitalised: the key the
 * `shopping_suggestions` unique index is built on. Written by the server,
 * compared in the browser (the list already on screen is filtered out of the
 * suggestions), so it lives here rather than in the service.
 */
export function suggestionKey(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Case- and accent-blind, so "musli" finds "Müsli" and "MEHL" finds "Mehl".
 * Not a substitute for `suggestionKey` — folding accents away would merge two
 * words a household may well mean differently.
 */
function fold(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

/**
 * The names worth offering for what's been typed so far, best first.
 *
 * Three tiers, because German compounds make a plain "starts with" useless:
 * the name itself starting with what you typed beats a word inside it starting
 * with it, which beats a match anywhere ("hack" → "Rinderhackfleisch"). Within
 * a tier `pool`'s own order decides, and the pool arrives most-recently-used
 * first.
 *
 * A name already typed out in full drops out — there is nothing left to
 * complete. That test is on the *key*, not on the folded text: "musli" is not
 * "Müsli", and offering it is how the umlaut gets typed for you.
 */
export function matchNames(
	query: string,
	pool: string[],
	limit: number = SUGGESTIONS_SHOWN
): string[] {
	const typed = query.trim();
	const needle = fold(typed);
	if (!needle) return [];

	const key = suggestionKey(typed);
	const hits: { name: string; tier: number; rank: number }[] = [];

	pool.forEach((name, rank) => {
		if (suggestionKey(name) === key) return;

		const hay = fold(name);
		const at = hay.indexOf(needle);
		if (at === -1) return;

		hits.push({ name, tier: at === 0 ? 0 : /[\s\-/(,.]/.test(hay[at - 1]) ? 1 : 2, rank });
	});

	return hits
		.sort((a, b) => a.tier - b.tier || a.rank - b.rank)
		.slice(0, limit)
		.map((hit) => hit.name);
}
