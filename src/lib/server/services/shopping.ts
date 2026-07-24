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
import { and, asc, count, eq, isNull, lt, sql } from 'drizzle-orm';
import { ITEM_NAME_MAX, QUANTITY_MAX, STORE_NAME_MAX } from '$lib/utils/shopping';
import { db } from '../db';
import { members, shoppingItems, stores, type ShoppingItem, type Store } from '../db/schema';
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
	/** Null once the housemate who added it has left. */
	addedBy: { displayName: string; color: string } | null;
};

export type ShoppingGroup = {
	/** Null = the virtual "Other" group. */
	storeId: string | null;
	/** The store's own name; null for the "Other" group, which the screen names. */
	name: string | null;
	items: ShoppingListItem[];
};

export type ShoppingList = {
	/** Stores in walking order, empty ones omitted, "Other" last. */
	groups: ShoppingGroup[];
	/** The header's "{checked} of {total} done"; `total` 0 ⇒ the empty state. */
	checked: number;
	total: number;
};

/* ── Reading ──────────────────────────────────────────────────────────────── */

/**
 * `storeList` is a parameter so a caller that already needs the stores (the
 * page load renders them as the sheet's chips) hands over the same read: two
 * separate queries could otherwise straddle a housemate's store delete and
 * disagree about which stores exist.
 */
export function getShoppingList(
	householdId: string,
	storeList: Store[] = listStores(householdId)
): ShoppingList {
	const rows = db
		.select({
			id: shoppingItems.id,
			name: shoppingItems.name,
			quantity: shoppingItems.quantity,
			unit: shoppingItems.unit,
			storeId: shoppingItems.storeId,
			checkedAt: shoppingItems.checkedAt,
			createdAt: shoppingItems.createdAt,
			addedByName: members.displayName,
			addedByColor: members.color
		})
		.from(shoppingItems)
		.leftJoin(members, eq(shoppingItems.addedByMemberId, members.id))
		.where(eq(shoppingItems.householdId, householdId))
		// The SQL half of `compareItems` — open items in the order they were
		// added, then the checked ones in the order they were ticked off.
		.orderBy(
			sql`${shoppingItems.checkedAt} is null desc`,
			asc(shoppingItems.checkedAt),
			asc(shoppingItems.createdAt),
			asc(shoppingItems.id)
		)
		.all();

	const byStore = new Map<string | null, ShoppingListItem[]>();
	let checked = 0;

	for (const row of rows) {
		if (row.checkedAt) checked++;

		const item: ShoppingListItem = {
			id: row.id,
			name: row.name,
			quantity: row.quantity,
			unit: row.unit,
			storeId: row.storeId,
			checkedAt: row.checkedAt?.getTime() ?? null,
			createdAt: row.createdAt.getTime(),
			addedBy:
				row.addedByName && row.addedByColor
					? { displayName: row.addedByName, color: row.addedByColor }
					: null
		};

		const bucket = byStore.get(item.storeId);
		if (bucket) bucket.push(item);
		else byStore.set(item.storeId, [item]);
	}

	const groups: ShoppingGroup[] = [];

	for (const store of storeList) {
		const items = byStore.get(store.id);
		if (items?.length) groups.push({ storeId: store.id, name: store.name, items });
	}

	const other = byStore.get(null);
	if (other?.length) groups.push({ storeId: null, name: null, items: other });

	return { groups, checked, total: rows.length };
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
	const quantity = normalizeQuantity(input.quantity);

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

function normalizeQuantity(quantity: number | null | undefined): number | null {
	if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) return null;
	const clamped = Math.min(Math.max(quantity, 0), QUANTITY_MAX);
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

export function addItem(householdId: string, memberId: string, input: AddItemInput): ShoppingItem {
	const item = db
		.insert(shoppingItems)
		.values({ householdId, ...normalize(householdId, input), addedByMemberId: memberId })
		.returning()
		.get();

	notifyShoppingAdd({ householdId, actorMemberId: memberId, itemCount: 1 });

	return item;
}

export function updateItem(householdId: string, itemId: string, input: UpdateItemInput): boolean {
	const result = db
		.update(shoppingItems)
		.set(normalize(householdId, input))
		.where(and(eq(shoppingItems.id, itemId), eq(shoppingItems.householdId, householdId)))
		.run();

	return result.changes > 0;
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

/**
 * "Add all ingredients to the shopping list" (plan 07), in one transaction and
 * one notification.
 *
 * Dedupe is by name against what's still *open*: a recipe that wants butter
 * when butter is already on the list adds nothing, but butter you bought this
 * morning (checked, not yet cleaned up) is a fresh need and goes back on.
 * Quantities are never merged — "400 g pasta" plus "400 g pasta" is a decision
 * for the person holding the trolley, not for us.
 */
export function addIngredients(
	householdId: string,
	memberId: string,
	ingredients: IngredientInput[],
	storeId?: string | null
): { added: number; skipped: number } {
	const result = db.transaction((tx) => {
		const open = new Set(
			tx
				.select({ name: shoppingItems.name })
				.from(shoppingItems)
				.where(and(eq(shoppingItems.householdId, householdId), isNull(shoppingItems.checkedAt)))
				.all()
				.map((row) => row.name.trim().toLowerCase())
		);

		const rows: (typeof shoppingItems.$inferInsert)[] = [];
		// A batch insert would otherwise stamp every row with the same
		// millisecond, and the list's tiebreaker after `createdAt` is the (random)
		// id — a recipe's ingredients would land shuffled. One ms apart keeps them
		// in the order the recipe lists them.
		const stamp = Date.now();

		for (const ingredient of ingredients) {
			const values = normalize(householdId, { ...ingredient, storeId });
			const key = values.name.toLowerCase();
			// `open` grows as we go, so a recipe listing the same thing twice
			// contributes one line rather than two.
			if (!values.name || open.has(key)) continue;
			open.add(key);
			rows.push({
				householdId,
				...values,
				addedByMemberId: memberId,
				createdAt: new Date(stamp + rows.length)
			});
		}

		if (rows.length) tx.insert(shoppingItems).values(rows).run();

		return { added: rows.length, skipped: ingredients.length - rows.length };
	});

	if (result.added > 0) {
		notifyShoppingAdd({ householdId, actorMemberId: memberId, itemCount: result.added });
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
