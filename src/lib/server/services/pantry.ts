/**
 * What the household keeps in the cupboard (→ SPEC §4.8).
 *
 * Nobody fills in a pantry inventory, so this one isn't declared — it's learned
 * from the one moment somebody is already thinking about it: the ingredient
 * picker [3e], where a recipe's salt, oil and pepper get left off the shopping
 * list because there's plenty at home. Leave a name off twice and the picker
 * opens with it unticked from then on; tick it once and the row is forgotten,
 * because a household that puts olive oil on the list has run out of olive oil.
 *
 * Two rather than one: the first skip is as likely to be "we bought that this
 * morning" as it is to be a cupboard staple, and pre-unticking something you do
 * need to buy is the one mistake this feature must not make often.
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { suggestionKey } from '$lib/utils/shopping';
import { db } from '../db';
import { pantryStaples } from '../db/schema';

/**
 * better-sqlite3 gives Drizzle a single connection, so a plain `db` read inside
 * a `db.transaction` callback runs *in* that transaction (→ services/shopping).
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** How many times something has to be left off before the picker assumes it. */
export const STAPLE_AFTER = 2;

/**
 * The names this household is taken to have at home already, as `suggestionKey`
 * keys — what the picker opens unticked.
 */
export function listStapleKeys(householdId: string): Set<string> {
	const rows = db
		.select({ nameKey: pantryStaples.nameKey })
		.from(pantryStaples)
		.where(
			and(eq(pantryStaples.householdId, householdId), gte(pantryStaples.skipCount, STAPLE_AFTER))
		)
		.all();

	return new Set(rows.map((row) => row.nameKey));
}

/**
 * What one pass of the picker taught us: `bought` went on the list, `left` was
 * offered and declined.
 *
 * Only names the sheet actually offered as ticked are passed as `left` — a row
 * that was already on the list is unticked because there is nothing to do, not
 * because the cupboard is full, and learning from it would be learning the
 * wrong thing (→ `services/recipe-shopping.ts`).
 */
export function rememberStaples(
	householdId: string,
	{ bought, left }: { bought: string[]; left: string[] }
): void {
	if (!bought.length && !left.length) return;

	db.transaction((tx) => {
		forget(tx, householdId, bought);
		for (const name of left) count(tx, householdId, name);
	});
}

/** Bought ⇒ not in the cupboard. The row goes rather than counting down. */
function forget(tx: Transaction, householdId: string, names: string[]): void {
	const keys = [...new Set(names.map(suggestionKey).filter(Boolean))];
	if (!keys.length) return;

	tx.delete(pantryStaples)
		.where(and(eq(pantryStaples.householdId, householdId), inArray(pantryStaples.nameKey, keys)))
		.run();
}

/**
 * One more skip against a name. `name` is overwritten with the spelling last
 * seen for the same reason `shopping_suggestions` does it: it's the one the
 * household is writing today, and the row is only ever read back to a person.
 */
function count(tx: Transaction, householdId: string, name: string): void {
	const trimmed = name.trim();
	const nameKey = suggestionKey(trimmed);
	if (!nameKey) return;

	tx.insert(pantryStaples)
		.values({ householdId, name: trimmed, nameKey, skipCount: 1, lastSkippedAt: new Date() })
		.onConflictDoUpdate({
			target: [pantryStaples.householdId, pantryStaples.nameKey],
			set: {
				name: trimmed,
				// The existing row's count, not the 1 above: in an upsert's SET the
				// table name means the row that was already there (`excluded` is the
				// one we tried to write).
				skipCount: sql`${pantryStaples.skipCount} + 1`,
				lastSkippedAt: new Date()
			}
		})
		.run();
}
