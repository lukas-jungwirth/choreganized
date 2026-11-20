/**
 * The shopping list and the stores it's grouped by (→ SPEC §3).
 *
 * Two rules run through every function here:
 *
 * - `householdId` first, and it's in the WHERE clause of every statement — a
 *   forged item or store id from another household finds nothing
 *   (→ docs/ARCHITECTURE.md "Server patterns").
 * - Store order is the walking order, so `sortOrder` is kept contiguous from 0:
 *   every move and delete renumbers the whole (tiny) list rather than leaving
 *   gaps for the next writer to reason about.
 */
import { and, asc, count, desc, eq, isNotNull, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { isListIcon, isListKind, type KnownName, type ListKind } from '$lib/utils/lists';
import {
	ITEM_NAME_MAX,
	QUANTITY_MAX,
	STORE_NAME_MAX,
	TOTAL_QUANTITY_MAX,
	itemName,
	planAdds,
	splitList,
	suggestionKey,
	type ItemGroup
} from '$lib/utils/shopping';
import { db } from '../db';
import {
	members,
	shoppingItems,
	shoppingSuggestions,
	stores,
	type ShoppingItem,
	type Store
} from '../db/schema';
import { publish, type LiveActor } from '../live';
import { notifyShoppingAdd } from '../push';

/*
 * Items with no store fall under one virtual group, always last (→ SPEC §3.1).
 * It is identified by a null `storeId` and carries no name of its own: "Other"
 * is copy, and the screen rendering it knows which language it is in
 * (→ `$lib/i18n`, `shopping.other`).
 */

/** Anything longer is a paste accident, not a unit ("tbsp" from a recipe is fine). */
const UNIT_MAX = 12;

/**
 * better-sqlite3 gives Drizzle a single connection, so a plain `db` read inside
 * a `db.transaction` callback runs *in* that transaction and sees its
 * uncommitted writes. Only the helpers that write need the `tx` handle.
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ShoppingListItem = {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	storeId: string | null;
	/**
	 * ms epoch, not a Date: these two cross to the browser, which re-sorts the
	 * group itself while a check is in flight (→ `compareItems`).
	 */
	checkedAt: number | null;
	createdAt: number;
	/**
	 * Manual walking order within the store group, low first. Crosses to the
	 * browser because it re-sorts the group itself while a drag is in flight
	 * (→ `compareOpen`).
	 */
	sortOrder: number;
	/** Null once the housemate who added it has left. */
	addedBy: { displayName: string; color: string } | null;
	/**
	 * Who ticked it, while it is ticked: a checklist row wears their small
	 * avatar (plan 36 step 2). Null when open, or once they have left.
	 */
	checkedBy: { displayName: string; color: string } | null;
};

/**
 * The rows that belong to shopping: on a shopping list, or on none ("Other").
 * A checklist's rows are not shopping (plan 36 step 2): the nightly sweep,
 * Home's count and a recipe's pour-in all leave them alone.
 */
export function notOnChecklist(): SQL {
	return sql`(${shoppingItems.storeId} is null or ${shoppingItems.storeId} not in (select ${stores.id} from ${stores} where ${stores.kind} = 'checklist'))`;
}

/**
 * A store's slice of the list, once the screen has grouped it. Exported for
 * the components that render one — the shape itself is `utils/shopping`'s.
 */
export type ShoppingGroup = ItemGroup<ShoppingListItem>;

/* ── Reading ──────────────────────────────────────────────────────────────── */

/**
 * The household's lists, flat. Grouping them by list and setting the checked
 * items apart under "{n} bought" is `splitList`'s job, and the screen calls
 * it — with the stores it already loaded for the sheet's chips, and again on
 * every optimistic tick (→ `utils/shopping`, DECISIONS #105).
 */
export function getShoppingList(householdId: string): ShoppingListItem[] {
	const checker = alias(members, 'checker');
	return (
		db
			.select({
				id: shoppingItems.id,
				name: shoppingItems.name,
				quantity: shoppingItems.quantity,
				unit: shoppingItems.unit,
				storeId: shoppingItems.storeId,
				checkedAt: shoppingItems.checkedAt,
				createdAt: shoppingItems.createdAt,
				sortOrder: shoppingItems.sortOrder,
				addedByName: members.displayName,
				addedByColor: members.color,
				checkedByName: checker.displayName,
				checkedByColor: checker.color
			})
			.from(shoppingItems)
			.leftJoin(members, eq(shoppingItems.addedByMemberId, members.id))
			.leftJoin(checker, eq(shoppingItems.checkedByMemberId, checker.id))
			.where(eq(shoppingItems.householdId, householdId))
			// Not the rendered order — that is `splitList`'s — but a stable one, so
			// two reads of an unchanged list produce byte-identical payloads.
			.orderBy(asc(shoppingItems.createdAt), asc(shoppingItems.id))
			.all()
			.map((row) => ({
				id: row.id,
				name: row.name,
				quantity: row.quantity,
				unit: row.unit,
				storeId: row.storeId,
				checkedAt: row.checkedAt?.getTime() ?? null,
				createdAt: row.createdAt.getTime(),
				sortOrder: row.sortOrder,
				addedBy:
					row.addedByName && row.addedByColor
						? { displayName: row.addedByName, color: row.addedByColor }
						: null,
				checkedBy:
					row.checkedAt && row.checkedByName && row.checkedByColor
						? { displayName: row.checkedByName, color: row.checkedByColor }
						: null
			}))
	);
}

/**
 * What the add field completes from: the names this household has used, most
 * recently used first (→ SPEC §3.1).
 *
 * The whole pool goes to the browser with the page and is filtered there —
 * a household's vocabulary is a few hundred short strings, and the alternative
 * is a request per keystroke for a field whose entire point is that it keeps
 * up with typing. The cap is what keeps that promise true for a household that
 * has been at this for years; the tail it cuts off is the words nobody has
 * written in months.
 */
const SUGGESTION_POOL_MAX = 250;

/**
 * Each name comes with the list it last went to (plan 36), which is how the add
 * field's icon moves by itself when a known name is typed [L3]. Null is
 * "Other", or a list deleted since.
 */
export function listItemNames(householdId: string, limit = SUGGESTION_POOL_MAX): KnownName[] {
	return db
		.select({ name: shoppingSuggestions.name, storeId: shoppingSuggestions.storeId })
		.from(shoppingSuggestions)
		.where(eq(shoppingSuggestions.householdId, householdId))
		.orderBy(desc(shoppingSuggestions.lastUsedAt), asc(shoppingSuggestions.name))
		.limit(limit)
		.all();
}

export function listStores(householdId: string): Store[] {
	return (
		db
			.select()
			.from(stores)
			.where(eq(stores.householdId, householdId))
			// `sortOrder` is unique in practice; the rest is belt and braces so two
			// stores can never trade places between two reads of the same list.
			.orderBy(asc(stores.sortOrder), asc(stores.createdAt), asc(stores.id))
			.all()
	);
}

/** One list, if it is this household's — what `/shopping/[listId]` opens. */
export function getStore(householdId: string, storeId: string): Store | undefined {
	return db
		.select()
		.from(stores)
		.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
		.get();
}

/**
 * What is still to buy, in the list's own order and stripped to the four
 * columns that decide where a new ingredient lands (→ `planAdds`). Both the
 * picker's preview and the add it previews read the list through this, so the
 * two can't be looking at different lists.
 *
 * The order is `compareOpen`'s, `sortOrder` first — the walking order, not the
 * order things were added. It matters for the one case where a name is on the
 * list twice: the row a recipe tops up is then the one *higher up the group*,
 * which is the one somebody dragged there and is looking at.
 */
export function listOpenItems(householdId: string): {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
}[] {
	return db
		.select({
			id: shoppingItems.id,
			name: shoppingItems.name,
			quantity: shoppingItems.quantity,
			unit: shoppingItems.unit
		})
		.from(shoppingItems)
		.where(
			and(
				eq(shoppingItems.householdId, householdId),
				isNull(shoppingItems.checkedAt),
				// A packing list's "Sunscreen" is not a need a recipe can top up.
				notOnChecklist()
			)
		)
		.orderBy(asc(shoppingItems.sortOrder), asc(shoppingItems.createdAt), asc(shoppingItems.id))
		.all();
}

export type StoreSummary = {
	id: string;
	name: string;
	icon: string | null;
	kind: ListKind;
	/** Everything filed here, checked items included — what [7g] counts. */
	itemCount: number;
};

export function listStoresWithCounts(householdId: string): StoreSummary[] {
	return db
		.select({
			id: stores.id,
			name: stores.name,
			icon: stores.icon,
			kind: stores.kind,
			// Counting the item id, not the row: a store with nothing in it is a
			// single all-NULL join row, and count(*) would call that 1.
			itemCount: count(shoppingItems.id)
		})
		.from(stores)
		.leftJoin(shoppingItems, eq(shoppingItems.storeId, stores.id))
		.where(eq(stores.householdId, householdId))
		.groupBy(stores.id)
		.orderBy(asc(stores.sortOrder), asc(stores.createdAt), asc(stores.id))
		.all();
}

/* ── Items ────────────────────────────────────────────────────────────────── */

export type AddItemInput = {
	name: string;
	quantity?: number | null;
	unit?: string | null;
	/**
	 * Leave it out and the item lands where quick-add sends things — the
	 * topmost store (→ SPEC §3.1). `null` pins it to "Other" on purpose.
	 */
	storeId?: string | null;
};

export type UpdateItemInput = {
	name: string;
	quantity: number | null;
	unit: string | null;
	storeId: string | null;
};

/** Trimmed, capped, and never a store belonging to somebody else's household. */
function normalize(householdId: string, input: AddItemInput) {
	// The *row's* ceiling, not the field's: a row that two recipes merged up to
	// 1200 g comes back through here whenever anybody edits the item — to move it
	// to another store, or to fix a typo — and the typed ceiling would silently
	// shave it to 999 on the way past (→ `utils/shopping` `TOTAL_QUANTITY_MAX`).
	// 999 is still what the stepper *offers*; this is what the column may hold.
	const quantity = normalizeQuantity(input.quantity, TOTAL_QUANTITY_MAX);

	return {
		name: input.name.trim().slice(0, ITEM_NAME_MAX),
		quantity,
		// A unit measures a quantity. Without one it's a leftover from the sheet's
		// preselected "pcs", and keeping it would mean the row says "no amount, of
		// pieces" — so the column stays honest and empties too.
		unit: quantity === null ? null : normalizeUnit(input.unit),
		storeId: resolveStoreId(householdId, input.storeId)
	};
}

/**
 * `max` is what the caller may store. Everything that writes a row passes
 * `TOTAL_QUANTITY_MAX`, because a merged amount legitimately outgrows what a
 * field may be typed with; `QUANTITY_MAX` remains the stepper's own ceiling,
 * enforced where the typing happens (→ `utils/shopping`).
 */
function normalizeQuantity(
	quantity: number | null | undefined,
	max: number = QUANTITY_MAX
): number | null {
	if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) return null;
	const clamped = Math.min(Math.max(quantity, 0), max);
	// Recipes bring fractions ("0.5 kg"); the stepper only ever sends integers.
	const rounded = Math.round(clamped * 100) / 100;
	return rounded > 0 ? rounded : null;
}

/**
 * The sheet offers six units (→ `UNITS`), but the column is free text on
 * purpose: plan 07 pours recipe ingredients onto the list and a recipe may well
 * say "tbsp". Anything unreasonably long is a paste accident, not a unit.
 */
function normalizeUnit(unit: string | null | undefined): string | null {
	const trimmed = unit?.trim().slice(0, UNIT_MAX) ?? '';
	return trimmed || null;
}

/**
 * `undefined` → the default store, `null` → "Other", an id → itself, but only
 * if this household owns it. An id it doesn't own (forged, or a store a
 * housemate deleted a second ago) is not silently swapped for another store:
 * the item goes to "Other", where it's visible rather than misfiled.
 */
function resolveStoreId(householdId: string, storeId: string | null | undefined): string | null {
	if (storeId === undefined) return defaultStoreId(householdId);
	if (storeId === null) return null;

	const store = db
		.select({ id: stores.id })
		.from(stores)
		.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
		.get();

	return store?.id ?? null;
}

/**
 * Where the quick-add field and a recipe put things: the topmost shopping
 * list, or "Other". Never a checklist (plan 36 step 2).
 */
export function defaultStoreId(householdId: string): string | null {
	const first = db
		.select({ id: stores.id })
		.from(stores)
		.where(and(eq(stores.householdId, householdId), eq(stores.kind, 'buy')))
		.orderBy(asc(stores.sortOrder), asc(stores.createdAt), asc(stores.id))
		.limit(1)
		.get();

	return first?.id ?? null;
}

/** What kind of list a row on `storeId` is on. "Other" (null) is shopping. */
function listKind(householdId: string, storeId: string | null): ListKind {
	if (storeId === null) return 'buy';
	const row = db
		.select({ kind: stores.kind })
		.from(stores)
		.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
		.get();
	return row?.kind ?? 'buy';
}

/**
 * Every name that lands on the list is learned, so the add field can offer it
 * back for the rest of the household's life together — long after the item
 * itself has been bought and swept up (→ `listItemNames`, DECISIONS #106).
 *
 * An upsert on (household, key): writing "rinderhackfleisch" over
 * "Rinderhackfleisch" moves the same row up rather than starting a second one,
 * and the spelling last used is the one offered back.
 */
function rememberName(
	tx: Transaction,
	householdId: string,
	name: string,
	storeId: string | null
): void {
	const trimmed = name.trim();
	const nameKey = suggestionKey(trimmed);
	if (!nameKey) return;

	// The list goes with it: the place a name went *last* is where the add field
	// sends it next time (plan 36 [L3]). Always the latest, so moving Shampoo to
	// another list once is how the household changes its mind.
	tx.insert(shoppingSuggestions)
		.values({ householdId, name: trimmed, nameKey, storeId, lastUsedAt: new Date() })
		.onConflictDoUpdate({
			target: [shoppingSuggestions.householdId, shoppingSuggestions.nameKey],
			set: { name: trimmed, storeId, lastUsedAt: new Date() }
		})
		.run();
}

/**
 * The next free slot at the end of a store group's manual order — the item
 * version of `createStore`'s `coalesce(max, -1) + 1`. "Other" (null store) is a
 * group like any other, so it needs `isNull`, not `eq(null)`.
 */
function nextItemSortOrder(tx: Transaction, householdId: string, storeId: string | null): number {
	const row = tx
		.select({ next: sql<number>`coalesce(max(${shoppingItems.sortOrder}), -1) + 1` })
		.from(shoppingItems)
		.where(
			and(
				eq(shoppingItems.householdId, householdId),
				storeId === null ? isNull(shoppingItems.storeId) : eq(shoppingItems.storeId, storeId)
			)
		)
		.get();

	return row?.next ?? 0;
}

export function addItem(householdId: string, memberId: string, input: AddItemInput): ShoppingItem {
	const values = normalize(householdId, input);
	// A packing item is not a shopping habit (plan 36): a checklist's rows teach
	// the add field nothing and ping nobody's phone.
	const shopping = listKind(householdId, values.storeId) === 'buy';

	const item = db.transaction((tx) => {
		const row = tx
			.insert(shoppingItems)
			.values({
				householdId,
				...values,
				addedByMemberId: memberId,
				// A new item lands at the end of the group it joins, where the eye
				// last left off (→ SPEC §3.1).
				sortOrder: nextItemSortOrder(tx, householdId, values.storeId)
			})
			.returning()
			.get();

		if (shopping) rememberName(tx, householdId, values.name, values.storeId);

		return row;
	});

	if (shopping) notifyShoppingAdd({ householdId, actorMemberId: memberId, itemCount: 1 });
	// Fire-and-forget, outside the transaction, next to the push for the same
	// reason: the row is written, and nobody's failure to hear about it may
	// unwrite it (→ `../live.ts`, DECISIONS #135).
	publishShopping(householdId, memberId, {
		kind: 'added',
		itemId: item.id,
		name: item.name
	});

	return item;
}

export type QuickAddResult = { itemId: string; restored: boolean };

/**
 * What the add field does (plan 36): a name sitting under "{n} bought" in the
 * list it is going to is **put back** rather than added a second time, the way
 * the suggestion offering it promised. Anything else is an ordinary `addItem`.
 *
 * Only the target list is searched: an opened list adds to itself and nothing
 * else, and Milk bought at another shop is a fresh need here. A typed amount
 * travels with the row it puts back; no amount leaves the row's own alone.
 */
export function quickAddItem(
	householdId: string,
	memberId: string,
	input: AddItemInput
): QuickAddResult {
	const values = normalize(householdId, input);
	const key = suggestionKey(values.name);

	// A checklist has no "{n} bought" to put a row back from: its ticked rows
	// stay where they are, and a second "Towels" is what was typed.
	if (listKind(householdId, values.storeId) === 'checklist') {
		const item = addItem(householdId, memberId, { ...input, storeId: values.storeId });
		return { itemId: item.id, restored: false };
	}

	const restored = db.transaction((tx) => {
		const match = tx
			.select({ id: shoppingItems.id, name: shoppingItems.name })
			.from(shoppingItems)
			.where(
				and(
					eq(shoppingItems.householdId, householdId),
					values.storeId === null
						? isNull(shoppingItems.storeId)
						: eq(shoppingItems.storeId, values.storeId),
					isNotNull(shoppingItems.checkedAt)
				)
			)
			.orderBy(desc(shoppingItems.checkedAt), asc(shoppingItems.id))
			.all()
			// `suggestionKey` in JavaScript rather than SQL's lower(), which only
			// folds ASCII: "Äpfel" and "äpfel" are the same row to the household.
			.find((row) => suggestionKey(row.name) === key);

		if (!match) return null;

		tx.update(shoppingItems)
			.set({
				checkedAt: null,
				checkedByMemberId: null,
				// Back at the end of the list's walking order, where a new add goes.
				sortOrder: nextItemSortOrder(tx, householdId, values.storeId),
				...(values.quantity !== null ? { quantity: values.quantity, unit: values.unit } : {})
			})
			.where(and(eq(shoppingItems.id, match.id), eq(shoppingItems.householdId, householdId)))
			.run();

		rememberName(tx, householdId, match.name, values.storeId);
		return match;
	});

	if (!restored) {
		const item = addItem(householdId, memberId, input);
		return { itemId: item.id, restored: false };
	}

	publishShopping(householdId, memberId, {
		kind: 'unchecked',
		itemId: restored.id,
		name: restored.name
	});

	return { itemId: restored.id, restored: true };
}

/**
 * Renaming a row teaches the same lesson adding one does — most of all when
 * the edit is somebody fixing a typo they'd otherwise be offered forever. A
 * save that didn't touch the name only moves that name back up the pool, which
 * is exactly where somebody who just edited the item would look for it.
 */
export function updateItem(householdId: string, itemId: string, input: UpdateItemInput): boolean {
	const edited = db.transaction((tx) => {
		const values = normalize(householdId, input);
		const result = tx
			.update(shoppingItems)
			.set(values)
			.where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId)))
			.run();

		// Nothing was updated ⇒ the id wasn't ours, and neither is the name.
		if (result.changes === 0) return false;

		if (listKind(householdId, values.storeId) === 'buy') {
			rememberName(tx, householdId, values.name, values.storeId);
		}
		return true;
	});

	// Silent: an edit changes the row for whoever is looking, but "Elisabeth
	// edited Milk" isn't news anyone standing in a shop needs read out.
	if (edited) publish(householdId, { topic: 'shopping', kind: 'changed' });

	return edited;
}

/**
 * Check or uncheck. Unchecking clears who checked it, so nothing lies.
 *
 * `RETURNING` rather than a second read: the live event names the item ("Elisabeth
 * checked off **Tomatoes**"), and the name is right there in the row being
 * written. It also answers "was this ours?" better than `changes` did — a row
 * comes back or it doesn't.
 */
export function setChecked(
	householdId: string,
	itemId: string,
	memberId: string,
	checked: boolean
): boolean {
	const row = db
		.update(shoppingItems)
		.set(
			checked
				? { checkedAt: new Date(), checkedByMemberId: memberId }
				: { checkedAt: null, checkedByMemberId: null }
		)
		.where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId)))
		.returning({ name: shoppingItems.name, storeId: shoppingItems.storeId })
		.get();

	if (!row) return false;

	// A checklist tick stays where it is, with no settle to play on the other
	// phone and no "Elisabeth got Passports" to announce: it just refreshes there.
	if (listKind(householdId, row.storeId) === 'checklist') {
		publish(householdId, { topic: 'shopping', kind: 'changed' });
		return true;
	}

	publishShopping(householdId, memberId, {
		kind: checked ? 'checked' : 'unchecked',
		itemId,
		name: row.name
	});

	return true;
}

export function deleteItem(householdId: string, itemId: string): boolean {
	const result = db
		.delete(shoppingItems)
		.where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId)))
		.run();

	if (result.changes === 0) return false;

	publish(householdId, { topic: 'shopping', kind: 'changed' });
	return true;
}

export type IngredientInput = {
	name: string;
	quantity?: number | null;
	unit?: string | null;
};

export type IngredientAddResult = {
	/** New rows on the list. */
	added: number;
	/** Rows that were already there and now ask for more. */
	merged: number;
	/** Rows that were already there and needed no change. */
	skipped: number;
};

/**
 * Ingredients onto the list, in one transaction and one notification — what the
 * picker sheet [3e] submits (→ SPEC §4.8).
 *
 * The rules are `planAdds`', because the sheet has just shown the household what
 * this call is about to do and the two must agree. In short: matched by name
 * against what is still *open* (butter bought this morning is a fresh need and
 * goes back on), amounts added up where they can be — two recipes wanting two
 * cucumbers each leave one row asking for four — and the row left as it stands
 * where they can't.
 */
export function addIngredients(
	householdId: string,
	memberId: string,
	ingredients: IngredientInput[],
	storeId?: string | null
): IngredientAddResult {
	const result = db.transaction((tx) => {
		const plan = planAdds(
			listOpenItems(householdId),
			ingredients.map((ingredient) => ({
				name: itemName(ingredient.name),
				quantity: normalizeQuantity(ingredient.quantity, TOTAL_QUANTITY_MAX),
				unit: normalizeUnit(ingredient.unit)
			}))
		);

		// One store for the whole batch, so the manual order is a single run
		// appended to that group — the recipe's own order, kept by `sortOrder`
		// (which the list sorts on before `createdAt`, so a shared insert stamp is
		// fine now).
		// Never onto a checklist (plan 36 step 2): a pour-in aimed at one goes
		// where every other pour-in goes.
		const resolved = resolveStoreId(householdId, storeId);
		const targetStore =
			listKind(householdId, resolved) === 'checklist' ? defaultStoreId(householdId) : resolved;
		const start = nextItemSortOrder(tx, householdId, targetStore);

		const rows = plan.inserts.map((row, index) => ({
			householdId,
			name: row.name,
			// A unit measures a quantity — `normalize`'s rule, applied here because
			// the amount may have grown since it was normalised (→ `planAdds`).
			quantity: row.quantity,
			unit: row.quantity === null ? null : row.unit,
			storeId: targetStore,
			addedByMemberId: memberId,
			sortOrder: start + index
		}));

		if (rows.length) tx.insert(shoppingItems).values(rows).run();

		for (const update of plan.updates) {
			tx.update(shoppingItems)
				.set({ quantity: update.quantity })
				.where(and(eq(shoppingItems.id, update.id), eq(shoppingItems.householdId, householdId)))
				.run();
		}

		// Only what actually went on the list as a new word: a topped-up or
		// skipped name is one the household already knows, by definition.
		for (const row of rows) rememberName(tx, householdId, row.name, targetStore);

		return {
			added: rows.length,
			merged: plan.rows.filter((row) => row.effect === 'merge').length,
			skipped: plan.rows.filter((row) => row.effect === 'have').length
		};
	});

	// A topped-up row counts as a change worth announcing — "2 cucumbers" quietly
	// becoming "4" is exactly what a housemate standing in the shop wants to hear
	// about — but it is announced as what it is, not as an item that isn't there.
	if (result.added > 0 || result.merged > 0) {
		notifyShoppingAdd({
			householdId,
			actorMemberId: memberId,
			itemCount: result.added,
			toppedUpCount: result.merged
		});
		// One event for the batch, counted rather than named: a recipe pours in
		// several at once, and eight toasts in a row is not an improvement.
		publishShopping(householdId, memberId, {
			kind: 'added',
			count: result.added + result.merged
		});
	}

	return result;
}

/**
 * The nightly cleanup's one statement: everything checked before `before`
 * (→ DECISIONS #13). `lt` on a NULL column never matches, so open items are
 * excluded by the comparison itself.
 */
export function purgeCheckedItems(householdId: string, before: Date): number {
	const purged = db
		.delete(shoppingItems)
		.where(
			and(
				eq(shoppingItems.householdId, householdId),
				lt(shoppingItems.checkedAt, before),
				// A checklist's ticks stay until somebody starts it over (plan 36).
				notOnChecklist()
			)
		)
		.run().changes;

	// 03:30, so almost always nobody — but a phone left open on the list
	// overnight would otherwise keep offering rows that no longer exist.
	if (purged > 0) publish(householdId, { topic: 'shopping', kind: 'changed' });

	return purged;
}

/**
 * Persist a store group's manual walking order (drag-to-reorder, → SPEC §3.1).
 *
 * The client hands us the ids it thinks the group holds, in the order it just
 * dropped them. We trust the *order* but not the *set*: only ids that are this
 * household's, in this store, and still open are renumbered 0…n−1, and any open
 * item the client didn't mention (added on another device mid-drag) keeps
 * trailing in a stable spot. So a stale tab can neither drop rows off the list
 * nor pull another group's item into this one.
 */
export function reorderItems(
	householdId: string,
	storeId: string | null,
	orderedIds: string[]
): boolean {
	// A checklist's ticked rows keep their place (plan 36 step 2), so they are
	// part of its order; a shopping list's bought rows are sorted by tick.
	const everyRow = listKind(householdId, storeId) === 'checklist';

	const reordered = db.transaction((tx) => {
		const inGroup = tx
			.select({ id: shoppingItems.id })
			.from(shoppingItems)
			.where(
				and(
					eq(shoppingItems.householdId, householdId),
					storeId === null ? isNull(shoppingItems.storeId) : eq(shoppingItems.storeId, storeId),
					everyRow ? undefined : isNull(shoppingItems.checkedAt)
				)
			)
			.orderBy(asc(shoppingItems.sortOrder), asc(shoppingItems.createdAt), asc(shoppingItems.id))
			.all()
			.map((row) => row.id);

		const known = new Set(inGroup);
		const seen = new Set<string>();
		const ordered: string[] = [];
		for (const id of orderedIds) {
			if (known.has(id) && !seen.has(id)) {
				seen.add(id);
				ordered.push(id);
			}
		}
		// Nothing the client dropped covers the rest ⇒ keep it, in its old order, last.
		for (const id of inGroup) if (!seen.has(id)) ordered.push(id);

		writeItemOrder(tx, householdId, ordered);
		return true;
	});

	if (reordered) publish(householdId, { topic: 'shopping', kind: 'changed' });
	return reordered;
}

/**
 * Announce a change that has a person behind it (→ `../live.ts`).
 *
 * The actor is looked up here rather than threaded through every signature: it
 * is one indexed read on a table with two rows in it, and it keeps the actions
 * thin the way `docs/ARCHITECTURE.md` asks. A member that has since left the
 * household simply doesn't publish — an event with nobody's name and nobody's
 * colour has nothing for the screen to do.
 */
function publishShopping(
	householdId: string,
	memberId: string,
	change: {
		kind: 'checked' | 'unchecked' | 'added' | 'reset';
		itemId?: string;
		name?: string;
		count?: number;
	}
): void {
	const actor = memberBadge(householdId, memberId);
	if (!actor) return;

	publish(householdId, { topic: 'shopping', ...change, actor });
}

/** Just enough of a member to name them and colour their tick. */
function memberBadge(householdId: string, memberId: string): LiveActor | null {
	const row = db
		.select({ displayName: members.displayName, color: members.color })
		.from(members)
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.get();

	return row ? { memberId, ...row } : null;
}

/** Writes 0…n−1 down the given item ids. Mirrors stores' `writeOrder`. */
function writeItemOrder(tx: Transaction, householdId: string, orderedIds: string[]): void {
	orderedIds.forEach((id, sortOrder) => {
		tx.update(shoppingItems)
			.set({ sortOrder })
			.where(and(eq(shoppingItems.id, id), eq(shoppingItems.householdId, householdId)))
			.run();
	});
}

/* ── Stores ───────────────────────────────────────────────────────────────── */

/** A stored icon is a key from the fixed set or nothing (→ `utils/lists`). */
function normalizeIcon(icon: string | null | undefined): string | null {
	return isListIcon(icon) ? icon : null;
}

/** A new list goes to the end of the household's order, a shopping list unless told. */
export function createStore(
	householdId: string,
	name: string,
	icon?: string | null,
	kind: ListKind = 'buy'
): Store {
	return db.transaction((tx) => {
		const next = tx
			.select({ sortOrder: sql<number>`coalesce(max(${stores.sortOrder}), -1) + 1` })
			.from(stores)
			.where(eq(stores.householdId, householdId))
			.get();

		return tx
			.insert(stores)
			.values({
				householdId,
				name: name.trim().slice(0, STORE_NAME_MAX),
				icon: normalizeIcon(icon),
				kind: isListKind(kind) ? kind : 'buy',
				sortOrder: next?.sortOrder ?? 0
			})
			.returning()
			.get();
	});
}

/** `icon` left out keeps the list's icon; anything else (null included) replaces it. */
export function renameStore(
	householdId: string,
	storeId: string,
	name: string,
	icon?: string | null
): boolean {
	const trimmed = name.trim().slice(0, STORE_NAME_MAX);
	if (!trimmed) return false;

	const result = db
		.update(stores)
		.set(icon === undefined ? { name: trimmed } : { name: trimmed, icon: normalizeIcon(icon) })
		.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
		.run();

	return result.changes > 0;
}

/**
 * Deleting a shopping list never deletes shopping: `shopping_items.store_id` is
 * ON DELETE SET NULL, so its items reappear under "Other" (→ DATA-MODEL.md).
 * A checklist takes its rows with it (plan 36 step 2): "Passports" under
 * "Other" would be a shopping need nobody has. The confirm says how many.
 */
export function deleteStore(householdId: string, storeId: string): boolean {
	const deleted = db.transaction((tx) => {
		if (listKind(householdId, storeId) === 'checklist') {
			tx.delete(shoppingItems)
				.where(and(eq(shoppingItems.householdId, householdId), eq(shoppingItems.storeId, storeId)))
				.run();
		}

		const result = tx
			.delete(stores)
			.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
			.run();

		if (result.changes === 0) return false;

		renumber(tx, householdId);
		return true;
	});

	if (deleted) publish(householdId, { topic: 'shopping', kind: 'changed' });
	return deleted;
}

/**
 * Turn a shopping list into a checklist or back (plan 36: "the kind can be
 * changed later"). The rows are not touched, because the two kinds read the
 * same columns differently: a bought row *is* a ticked row. Shopping list →
 * checklist, its bought rows stay ticked until Start over; checklist →
 * shopping list, its ticked rows are under "{n} bought" and the next nightly
 * sweep takes them. The confirm in the sheet says which.
 */
export function setStoreKind(householdId: string, storeId: string, kind: ListKind): boolean {
	if (!isListKind(kind)) return false;

	const result = db
		.update(stores)
		.set({ kind })
		.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
		.run();

	if (result.changes === 0) return false;

	publish(householdId, { topic: 'shopping', kind: 'changed' });
	return true;
}

/* ── Start over ───────────────────────────────────────────────────────────── */

/** One tick Start over took away, as the undo puts it back. */
export type ResetTick = { id: string; checkedAt: number; by: string | null };

/**
 * Start over (plan 36 [L4]): untick every row of a checklist in one
 * transaction. Answers with what it unticked, so the undo bar can put exactly
 * those ticks back, with their own time and ticker. Null when the list isn't
 * this household's checklist: a shopping list is never started over.
 */
export function resetList(
	householdId: string,
	memberId: string,
	storeId: string
): { name: string; ticks: ResetTick[] } | null {
	const result = db.transaction((tx) => {
		const list = tx
			.select({ name: stores.name, kind: stores.kind })
			.from(stores)
			.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
			.get();
		if (!list || list.kind !== 'checklist') return null;

		const onList = and(
			eq(shoppingItems.householdId, householdId),
			eq(shoppingItems.storeId, storeId),
			isNotNull(shoppingItems.checkedAt)
		);

		const ticked = tx
			.select({
				id: shoppingItems.id,
				checkedAt: shoppingItems.checkedAt,
				by: shoppingItems.checkedByMemberId
			})
			.from(shoppingItems)
			.where(onList)
			.all();

		tx.update(shoppingItems).set({ checkedAt: null, checkedByMemberId: null }).where(onList).run();

		return {
			name: list.name,
			ticks: ticked.map((row) => ({
				id: row.id,
				checkedAt: row.checkedAt?.getTime() ?? Date.now(),
				by: row.by
			}))
		};
	});

	// So the other phone follows: its rows untick on the refetch this triggers.
	if (result) publishShopping(householdId, memberId, { kind: 'reset', name: result.name });

	return result;
}

/**
 * Undo for Start over: the ticks it took away, back as they were. The browser
 * hands them back, so nothing is taken on trust: only rows of this checklist
 * that are still unticked, a ticker who is in this household (or nobody), and
 * a time that isn't in the future. A row ticked again meanwhile keeps its new
 * tick. Answers with how many were put back.
 */
export function undoReset(householdId: string, storeId: string, ticks: ResetTick[]): number {
	const restored = db.transaction((tx) => {
		const list = tx
			.select({ kind: stores.kind })
			.from(stores)
			.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
			.get();
		if (!list || list.kind !== 'checklist') return 0;

		const ours = new Set(
			tx
				.select({ id: members.id })
				.from(members)
				.where(eq(members.householdId, householdId))
				.all()
				.map((row) => row.id)
		);
		const now = Date.now();
		let count = 0;

		for (const tick of ticks) {
			if (!Number.isFinite(tick.checkedAt) || tick.checkedAt <= 0 || tick.checkedAt > now) continue;
			const by = tick.by !== null && ours.has(tick.by) ? tick.by : null;
			count += tx
				.update(shoppingItems)
				.set({ checkedAt: new Date(tick.checkedAt), checkedByMemberId: by })
				.where(
					and(
						eq(shoppingItems.id, tick.id),
						eq(shoppingItems.householdId, householdId),
						eq(shoppingItems.storeId, storeId),
						isNull(shoppingItems.checkedAt)
					)
				)
				.run().changes;
		}

		return count;
	});

	if (restored > 0) publish(householdId, { topic: 'shopping', kind: 'changed' });
	return restored;
}

/** One step up or down the walking order; a no-op at either end. */
export function moveStore(householdId: string, storeId: string, direction: 'up' | 'down'): boolean {
	return db.transaction((tx) => {
		const ordered = tx
			.select({ id: stores.id })
			.from(stores)
			.where(eq(stores.householdId, householdId))
			.orderBy(asc(stores.sortOrder), asc(stores.createdAt), asc(stores.id))
			.all()
			.map((row) => row.id);

		const from = ordered.indexOf(storeId);
		const to = direction === 'up' ? from - 1 : from + 1;
		if (from === -1 || to < 0 || to >= ordered.length) return false;

		[ordered[from], ordered[to]] = [ordered[to], ordered[from]];
		writeOrder(tx, householdId, ordered);
		return true;
	});
}

/** Writes 0…n−1 in the given order. Only the rows that actually move are touched. */
function writeOrder(tx: Transaction, householdId: string, orderedIds: string[]): void {
	orderedIds.forEach((id, sortOrder) => {
		tx.update(stores)
			.set({ sortOrder })
			.where(and(eq(stores.id, id), eq(stores.householdId, householdId)))
			.run();
	});
}

/** Closes the gap a deleted store leaves behind (`sortOrder` stays contiguous). */
function renumber(tx: Transaction, householdId: string): void {
	const ordered = tx
		.select({ id: stores.id })
		.from(stores)
		.where(eq(stores.householdId, householdId))
		.orderBy(asc(stores.sortOrder), asc(stores.createdAt), asc(stores.id))
		.all()
		.map((row) => row.id);

	writeOrder(tx, householdId, ordered);
}
