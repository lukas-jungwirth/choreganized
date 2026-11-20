/**
 * The things the shopping list's server and browser halves must agree on:
 * which units exist, how a quantity is written, how the list is split into
 * "still to buy" and "{n} bought" per list, how a recipe's ingredients land on it,
 * and how the add field completes what you type.
 *
 * The split matters twice: the service does it for the first paint, and the
 * page does it again in the browser when a check is applied optimistically —
 * ticking a box moves the row out of its list's open rows and under "{n}
 * bought" *before* the server answers. So it is one function called from both
 * sides (→ DECISIONS #105), not a SQL half and a JavaScript half kept in step.
 *
 * `planAdds` is here for the same reason one step removed: the picker sheet
 * [3e] shows what adding a recipe's ingredients *would* do and the service then
 * does it, and a preview that disagreed with the outcome would be worse than no
 * preview at all (→ DECISIONS #123).
 */

/** The units [3a] offers. Free pick, `pcs` preselected (→ SPEC §3.2). */
export const UNITS = ['pcs', 'g', 'kg', 'ml', 'L', 'pack'] as const;

export type Unit = (typeof UNITS)[number];

export const DEFAULT_UNIT: Unit = 'pcs';

/** Field limits, shared by the `maxlength` attribute and the action's guard. */
export const ITEM_NAME_MAX = 80;
export const STORE_NAME_MAX = 40;
/** What a quantity may be *typed* as. Anything past it is a paste accident. */
export const QUANTITY_MAX = 999;
/**
 * What a row may *hold* once recipes have been poured onto it and the amounts
 * added up (→ `planAdds`). 400 g of pasta meeting a kilo is 1400 g, which the
 * typed ceiling would quietly shave down to less than either recipe asked for;
 * this one exists only so a merge repeated all afternoon can't write nonsense
 * into the column.
 */
export const TOTAL_QUANTITY_MAX = 99_999;

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

/**
 * One list's slice of the items (plan 36). `name` and `icon` are null for
 * "Other", which the screen names and draws.
 */
export type ItemGroup<T> = {
	storeId: string | null;
	name: string | null;
	icon: string | null;
	/** "Other" is shopping. */
	kind: 'buy' | 'checklist';
	/**
	 * A shopping list: what is still to buy, in the manual walking order. A
	 * checklist: every row, ticked ones included, in its order (plan 36 step 2:
	 * a tick stays where it is).
	 */
	items: T[];
	/** What was ticked off and not yet swept, most recently bought first. Empty on a checklist. */
	bought: T[];
};

export type SplitList<T> = {
	/**
	 * Every shopping list with something on it, open or bought, in the
	 * household's order, then "Other", then every checklist, empty or not. A
	 * shopping list with nothing on it is not here at all (plan 36).
	 */
	groups: ItemGroup<T>[];
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

/** Bought items newest first — "{n} bought" is a trip in reverse. */
function compareBought(a: OrderedItem, b: OrderedItem): number {
	if (a.checkedAt !== b.checkedAt) return (b.checkedAt ?? 0) - (a.checkedAt ?? 0);
	return -compareOpen(a, b);
}

/**
 * The lists as they are rendered (→ SPEC §3.1, plan 36): one group per list,
 * holding what is still to buy and, apart, what was ticked off there and not
 * yet swept ("{n} bought" at the foot of its card). A list with neither is
 * left out: empty shopping lists don't take up the overview.
 */
export function splitList<T extends OrderedItem>(
	items: T[],
	stores: { id: string; name: string; icon?: string | null; kind?: 'buy' | 'checklist' }[]
): SplitList<T> {
	const checklists = new Set(
		stores.filter((store) => store.kind === 'checklist').map((store) => store.id)
	);
	const known = new Set(stores.map((store) => store.id));
	const open = new Map<string | null, T[]>();
	const bought = new Map<string | null, T[]>();

	for (const item of items) {
		// A store nobody here has heard of is the same as no store at all. It
		// shouldn't happen — deleting a store sets its items' `storeId` to NULL —
		// but a group nothing renders would take its items off the screen
		// silently, which is the one failure a shopping list must not have.
		const key = item.storeId !== null && known.has(item.storeId) ? item.storeId : null;
		// A checklist's ticks stay in place, so all its rows are one run.
		const into = item.checkedAt === null || (key !== null && checklists.has(key)) ? open : bought;
		const bucket = into.get(key);
		if (bucket) bucket.push(item);
		else into.set(key, [item]);
	}

	const groups: ItemGroup<T>[] = [];
	const group = (
		storeId: string | null,
		name: string | null,
		icon: string | null,
		kind: 'buy' | 'checklist' = 'buy'
	) => {
		const storeItems = open.get(storeId) ?? [];
		const storeBought = bought.get(storeId) ?? [];
		// A checklist is on the overview even with nothing on it: it is a thing
		// the household keeps, not a need that comes and goes.
		if (kind === 'buy' && !storeItems.length && !storeBought.length) return;
		groups.push({
			storeId,
			name,
			icon,
			kind,
			items: storeItems.sort(compareOpen),
			bought: storeBought.sort(compareBought)
		});
	};

	for (const store of stores) {
		if (!checklists.has(store.id)) group(store.id, store.name, store.icon ?? null);
	}
	// Items filed under no list — quick-added before any list existed, or in a
	// list since deleted — are their own group, after the shopping lists
	// (→ SPEC §3.1): "Other" is shopping too.
	group(null, null, null);
	// Checklists come after everything to buy, in their own order (plan 36).
	for (const store of stores) {
		if (checklists.has(store.id)) group(store.id, store.name, store.icon ?? null, 'checklist');
	}

	return { groups };
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

/* ── Pouring a recipe onto the list ───────────────────────────────────────── */

/** An amount as both a list row and a recipe line hold it. */
export type Amount = { quantity: number | null; unit: string | null };

/** Something to buy, named — an ingredient, or a row already on the list. */
export type NamedAmount = Amount & { name: string };

/**
 * A name as the list will store it. Anything planning an add has to key on
 * *this* rather than on the raw text: an ingredient whose name runs past the
 * column's limit would otherwise be matched under its full spelling in one pass
 * and its truncated one in the next, and the two would disagree about whether
 * the row is new.
 */
export function itemName(name: string): string {
	return name.trim().slice(0, ITEM_NAME_MAX);
}

/**
 * Units that measure the same thing, and how much of the base unit one of them
 * is. Lowercased keys, because `L` is stored capitalised and "l" is what a
 * hand-typed row is likely to say.
 *
 * Deliberately only the two decimal pairs. Spoons look convertible (1 tbsp is
 * 3 tsp in both kitchens) but combining them turns "2 tbsp + 1 tsp" into
 * "2.33 tbsp", which is not an amount anybody can shop for — so tbsp, tsp,
 * pack and anything hand-typed only ever combine with themselves.
 *
 * A `Map`, not an object literal: the unit column is free text, so the lookup
 * key can be "constructor" (→ `unitLabel` for the same trap).
 */
const UNIT_BASE = new Map<string, { base: string; factor: number }>(
	Object.entries({
		g: { base: 'g', factor: 1 },
		kg: { base: 'g', factor: 1000 },
		ml: { base: 'ml', factor: 1 },
		l: { base: 'ml', factor: 1000 }
	})
);

/**
 * What a unit measures, and in what. An unknown unit measures itself, so it
 * combines with its own spelling and nothing else.
 *
 * No unit at all reads as `pcs`: "2 cucumbers" typed into a recipe parses to a
 * bare quantity, the same two cucumbers added through the sheet [3a] carry the
 * preselected `pcs`, and a list that kept those apart would be counting the
 * same vegetable twice.
 */
function dimensionOf(unit: string | null): { base: string; factor: number } {
	const key = unit?.trim().toLowerCase() || DEFAULT_UNIT;
	return UNIT_BASE.get(key) ?? { base: key, factor: 1 };
}

/**
 * Two amounts of the same thing as one, in the *first* one's unit — or null
 * when they can't be spoken of together.
 *
 * Keeping `base`'s unit is what stops a row changing under the person reading
 * it: "400 g pasta" that meets a kilo becomes 1.4 kg only if the row was
 * already in kilos. Null comes back for "some pasta" meeting "400 g" (there is
 * no number to add to) and for grams meeting packs — both of which the caller
 * treats as "leave the row alone", because the need is already on the list and
 * only the person holding the trolley can reconcile the amounts.
 */
export function combineAmounts(base: Amount, extra: Amount): { quantity: number } | null {
	if (base.quantity === null || extra.quantity === null) return null;

	const into = dimensionOf(base.unit);
	const from = dimensionOf(extra.unit);
	if (into.base !== from.base) return null;

	const total = base.quantity + (extra.quantity * from.factor) / into.factor;
	// Two decimals, because the column is a REAL and 0.1 + 0.2 is a famous number.
	return { quantity: Math.min(Math.round(total * 100) / 100, TOTAL_QUANTITY_MAX) };
}

/**
 * What one more of a thing does to a row that already has it, decided once for
 * every way something reaches the list (Lukas 2026-11-20: "always grouped as
 * good as possible").
 *
 * - **merge**: the two amounts add up (`combineAmounts`), and the row grows,
 *   in its own unit. Two cucumbers and three are five; 500 ml onto a litre is
 *   1.5 L.
 * - **set**: the row had no amount and the add has one: the row takes it.
 *   Only for a line somebody typed (`typed`), where the person just said how
 *   many; a recipe leaves "some pasta" alone (→ `planAdds`).
 * - **have**: nothing needs to change. The add said no amount, or (from a
 *   recipe) the amounts can't be added and the need is on the list already.
 * - **apart**: a typed line whose amount can't be spoken of together with the
 *   row's (3 pcs and 500 g). Somebody typed that on purpose, so it becomes a
 *   row of its own.
 */
export type AmountMerge =
	{ effect: 'merge' | 'set'; quantity: number; unit: string | null } | { effect: 'have' | 'apart' };

export function addOnto(row: Amount, extra: Amount, typed = false): AmountMerge {
	const combined = combineAmounts(row, extra);
	if (combined) return { effect: 'merge', quantity: combined.quantity, unit: row.unit };
	if (!typed || extra.quantity === null) return { effect: 'have' };
	if (row.quantity === null) {
		return {
			effect: 'set',
			quantity: Math.min(extra.quantity, TOTAL_QUANTITY_MAX),
			unit: extra.unit
		};
	}
	return { effect: 'apart' };
}

/** What adding one ingredient to the list does. */
export type AddEffect =
	/** Nothing by that name is on the list — it becomes a row. */
	| 'new'
	/** A row has it already and the two amounts add up — that row grows. */
	| 'merge'
	/** A row has it already and nothing needs to change. */
	| 'have';

export type PlannedAdd = {
	effect: AddEffect;
	/** What the list will say about it afterwards — what the picker previews. */
	result: Amount;
};

export type AddPlan = {
	/** One per ingredient, in the order they were handed over. */
	rows: PlannedAdd[];
	/** The rows to write, in order. */
	inserts: NamedAmount[];
	/** Rows already on the list whose amount grew. */
	updates: { id: string; quantity: number }[];
};

/**
 * What pouring these ingredients onto that list would do (→ SPEC §3.1).
 *
 * Matching is by name against what is still **open**: a recipe that wants
 * butter when butter is on the list tops up the row it finds, but butter you
 * bought this morning (checked, not yet swept up) is a fresh need and goes back
 * on. Amounts add up where they can — two recipes wanting two cucumbers each
 * leave one row asking for four — and where they can't, the row stands as it is
 * rather than the list growing a second line with the same word on it.
 *
 * `open` is expected in the list's own order, so the row a household has been
 * looking at longest is the one a duplicate name tops up.
 */
export function planAdds(
	open: (NamedAmount & { id: string })[],
	ingredients: NamedAmount[]
): AddPlan {
	/** Name → the row it will end up on, whether that row exists yet or not. */
	const known = new Map<string, { id: string | null; pending: NamedAmount | null } & Amount>();

	for (const item of open) {
		const key = suggestionKey(item.name);
		if (key && !known.has(key)) {
			known.set(key, { id: item.id, pending: null, quantity: item.quantity, unit: item.unit });
		}
	}

	const rows: PlannedAdd[] = [];
	const inserts: NamedAmount[] = [];
	const updates = new Map<string, number>();

	for (const ingredient of ingredients) {
		const name = ingredient.name.trim();
		const key = suggestionKey(name);
		// A line with no word in it asks for nothing, and mustn't write a nameless
		// row. The recipe form drops these, so this is the belt to that's braces.
		if (!key) {
			rows.push({ effect: 'have', result: { quantity: null, unit: null } });
			continue;
		}

		const target = known.get(key);

		if (!target) {
			const pending = { name, quantity: ingredient.quantity, unit: ingredient.unit };
			inserts.push(pending);
			// Held by reference: a recipe naming the same thing twice ("2 tbsp oil"
			// … "1 tbsp oil") tops up the row this pass is adding rather than
			// writing a second one.
			known.set(key, { id: null, pending, quantity: pending.quantity, unit: pending.unit });
			rows.push({ effect: 'new', result: { quantity: pending.quantity, unit: pending.unit } });
			continue;
		}

		const combined = addOnto(target, ingredient);

		if (combined.effect !== 'merge') {
			rows.push({ effect: 'have', result: { quantity: target.quantity, unit: target.unit } });
			continue;
		}

		target.quantity = combined.quantity;
		if (target.pending) target.pending.quantity = combined.quantity;
		else if (target.id) updates.set(target.id, combined.quantity);

		rows.push({ effect: 'merge', result: { quantity: combined.quantity, unit: target.unit } });
	}

	return {
		rows,
		inserts,
		updates: [...updates].map(([id, quantity]) => ({ id, quantity }))
	};
}
