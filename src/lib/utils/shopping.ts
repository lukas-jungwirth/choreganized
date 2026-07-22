/**
 * The three things the shopping list's server and browser halves must agree on:
 * which units exist, how a quantity is written, and what order rows sit in.
 *
 * The order matters twice: the service sorts in SQL, and the page re-sorts in
 * the browser when a check is applied optimistically (the row has to move to
 * the end of its group *before* the server answers). Two sorts, one comparator.
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
 * The compact quantity a row shows: "×6" for pieces, "2 L" for anything
 * measured, nothing at all when there's no quantity to speak of.
 *
 * "×1" is deliberately nothing: [3a]'s stepper opens at 1, so every item added
 * through the sheet would otherwise wear a badge that says no more than its own
 * name does. One litre still reads "1 L" — there the unit is the information.
 */
export function formatQuantity(quantity: number | null, unit: string | null): string {
	if (quantity === null || quantity <= 0) return '';

	// REAL column: 2 must not render as "2.0", and 1.5 must keep its half.
	const amount = String(Number(quantity));

	if (!unit || unit === DEFAULT_UNIT) return quantity === 1 ? '' : `×${amount}`;

	return `${amount} ${unit}`;
}

/** The fields the order is decided on — a subset of the row and of the list item. */
export type OrderedItem = {
	id: string;
	/** ms epoch; null = still to buy. */
	checkedAt: number | null;
	createdAt: number;
};

/**
 * Open items first in the order they were added, then the checked ones in the
 * order they were ticked off (→ SPEC §3.1: "row moves to the group's end").
 * `id` is the final tiebreaker so a group whose items were written in the same
 * millisecond — every bulk insert, including the seed — still has one stable
 * order instead of flickering between renders.
 *
 * `getShoppingList`'s ORDER BY says exactly this in SQL; keep them in step.
 */
export function compareItems(a: OrderedItem, b: OrderedItem): number {
	if ((a.checkedAt === null) !== (b.checkedAt === null)) return a.checkedAt === null ? -1 : 1;
	if (a.checkedAt !== null && b.checkedAt !== null && a.checkedAt !== b.checkedAt) {
		return a.checkedAt - b.checkedAt;
	}
	if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
