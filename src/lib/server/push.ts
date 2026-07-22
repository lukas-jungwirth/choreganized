/**
 * Web push (VAPID) — the one module that talks to the push service.
 *
 * **Plan 05 owns this file.** It arrives early and nearly empty because the
 * call sites belong to the features, not to the delivery mechanism: plan 03
 * knows the moment somebody adds to the shopping list, and that knowledge
 * shouldn't have to be rediscovered later. So the event is announced here now
 * and the announcement goes nowhere until plan 05 wires up `sendToMembers`.
 *
 * Contract for everything added here (→ docs/ARCHITECTURE.md "Notifications"):
 * event-driven sends are **fire-and-forget** — never awaited in a request, and
 * they never throw into it. Failures are logged; a 404/410 from the push
 * service prunes the subscription row.
 */

export type ShoppingAddNotice = {
	householdId: string;
	/** Who added — plan 05 skips them (never notify your own add) and coalesces per member. */
	actorMemberId: string;
	/** How many items this one action put on the list. */
	itemCount: number;
};

/**
 * "🛒 {member} added {n} items to the list" (→ SPEC §3.5), to every *other*
 * member with `notifyShoppingUpdates` on, at most one per member per ~15 min.
 *
 * No-op until plan 05. Called from `services/shopping.ts` for every path that
 * adds — the quick field, the sheet, and plan 07's "add all ingredients".
 */
export function notifyShoppingAdd(notice: ShoppingAddNotice): void {
	void notice;
}
