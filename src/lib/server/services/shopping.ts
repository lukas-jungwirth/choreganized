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
import { and, asc, count, desc, eq, isNull, lt, sql } from 'drizzle-orm';
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
};

/**
 * A store's slice of the list, once the screen has grouped it. Exported for
 * the components that render one — the shape itself is `utils/shopping`'s.
 */
export type ShoppingGroup = ItemGroup<ShoppingListItem>;

/* ── Reading ──────────────────────────────────────────────────────────────── */

/**
 * The household's list, flat. Grouping it by store and lifting the checked
 * items out into "recently bought" is `splitList`'s job, and the screen calls
 * it — with the stores it already loaded for the sheet's chips, and again on
 * every optimistic tick (→ `utils/shopping`, DECISIONS #105).
 */
export function getShoppingList(householdId: string): ShoppingListItem[] {
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
				addedByColor: members.color
			})
			.from(shoppingItems)
			.leftJoin(members, eq(shoppingItems.addedByMemberId, members.id))
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

export function listItemNames(householdId: string, limit = SUGGESTION_POOL_MAX): string[] {
	return db
		.select({ name: shoppingSuggestions.name })
		.from(shoppingSuggestions)
		.where(eq(shoppingSuggestions.householdId, householdId))
		.orderBy(desc(shoppingSuggestions.lastUsedAt), asc(shoppingSuggestions.name))
		.limit(limit)
		.all()
		.map((row) => row.name);
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
		.where(and(eq(shoppingItems.householdId, householdId), isNull(shoppingItems.checkedAt)))
		.orderBy(asc(shoppingItems.sortOrder), asc(shoppingItems.createdAt), asc(shoppingItems.id))
		.all();
}

export type StoreSummary = {
	id: string;
	name: string;
	/** Everything filed here, checked items included — what [7g] counts. */
	itemCount: number;
};

export function listStoresWithCounts(householdId: string): StoreSummary[] {
	return db
		.select({
			id: stores.id,
			name: stores.name,
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

/** Where the quick-add field puts things: the topmost store, or "Other". */
export function defaultStoreId(householdId: string): string | null {
	const first = db
		.select({ id: stores.id })
		.from(stores)
		.where(eq(stores.householdId, householdId))
		.orderBy(asc(stores.sortOrder), asc(stores.createdAt), asc(stores.id))
		.limit(1)
		.get();

	return first?.id ?? null;
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
function rememberName(tx: Transaction, householdId: string, name: string): void {
	const trimmed = name.trim();
	const nameKey = suggestionKey(trimmed);
	if (!nameKey) return;

	tx.insert(shoppingSuggestions)
		.values({ householdId, name: trimmed, nameKey, lastUsedAt: new Date() })
		.onConflictDoUpdate({
			target: [shoppingSuggestions.householdId, shoppingSuggestions.nameKey],
			set: { name: trimmed, lastUsedAt: new Date() }
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
	const item = db.transaction((tx) => {
		const values = normalize(householdId, input);
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

		rememberName(tx, householdId, values.name);

		return row;
	});

	notifyShoppingAdd({ householdId, actorMemberId: memberId, itemCount: 1 });

	return item;
}

/**
 * Renaming a row teaches the same lesson adding one does — most of all when
 * the edit is somebody fixing a typo they'd otherwise be offered forever. A
 * save that didn't touch the name only moves that name back up the pool, which
 * is exactly where somebody who just edited the item would look for it.
 */
export function updateItem(householdId: string, itemId: string, input: UpdateItemInput): boolean {
	return db.transaction((tx) => {
		const values = normalize(householdId, input);
		const result = tx
			.update(shoppingItems)
			.set(values)
			.where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId)))
			.run();

		// Nothing was updated ⇒ the id wasn't ours, and neither is the name.
		if (result.changes === 0) return false;

		rememberName(tx, householdId, values.name);
		return true;
	});
}

/** Check or uncheck. Unchecking clears who checked it, so nothing lies. */
export function setChecked(
	householdId: string,
	itemId: string,
	memberId: string,
	checked: boolean
): boolean {
	const result = db
		.update(shoppingItems)
		.set(
			checked
				? { checkedAt: new Date(), checkedByMemberId: memberId }
				: { checkedAt: null, checkedByMemberId: null }
		)
		.where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId)))
		.run();

	return result.changes > 0;
}

export function deleteItem(householdId: string, itemId: string): boolean {
	const result = db
		.delete(shoppingItems)
		.where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId)))
		.run();

	return result.changes > 0;
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
		const targetStore = resolveStoreId(householdId, storeId);
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
		for (const row of rows) rememberName(tx, householdId, row.name);

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
	}

	return result;
}

/**
 * The nightly cleanup's one statement: everything checked before `before`
 * (→ DECISIONS #13). `lt` on a NULL column never matches, so open items are
 * excluded by the comparison itself.
 */
export function purgeCheckedItems(householdId: string, before: Date): number {
	return db
		.delete(shoppingItems)
		.where(and(eq(shoppingItems.householdId, householdId), lt(shoppingItems.checkedAt, before)))
		.run().changes;
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
	return db.transaction((tx) => {
		const inGroup = tx
			.select({ id: shoppingItems.id })
			.from(shoppingItems)
			.where(
				and(
					eq(shoppingItems.householdId, householdId),
					storeId === null ? isNull(shoppingItems.storeId) : eq(shoppingItems.storeId, storeId),
					isNull(shoppingItems.checkedAt)
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

export function createStore(householdId: string, name: string): Store {
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
				sortOrder: next?.sortOrder ?? 0
			})
			.returning()
			.get();
	});
}

export function renameStore(householdId: string, storeId: string, name: string): boolean {
	const trimmed = name.trim().slice(0, STORE_NAME_MAX);
	if (!trimmed) return false;

	const result = db
		.update(stores)
		.set({ name: trimmed })
		.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
		.run();

	return result.changes > 0;
}

/**
 * Deleting a store never deletes shopping: `shopping_items.store_id` is
 * ON DELETE SET NULL, so its items reappear under "Other" (→ DATA-MODEL.md).
 */
export function deleteStore(householdId: string, storeId: string): boolean {
	return db.transaction((tx) => {
		const result = tx
			.delete(stores)
			.where(and(eq(stores.id, storeId), eq(stores.householdId, householdId)))
			.run();

		if (result.changes === 0) return false;

		renumber(tx, householdId);
		return true;
	});
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
