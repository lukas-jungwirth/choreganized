# 03 · Shopping

**Goal:** the complete shopping feature: grouped list, quick add, full add/edit sheet,
check/uncheck, empty state, store management, auto-cleanup, Home tile accuracy.

Depends on: 02. Design: [03 main] [3a] [7d] [7g]. SPEC: [§3](../SPEC.md#3-shopping-tab).

## Build

- `lib/server/services/shopping.ts` — list (grouped: stores by sortOrder + "Other"), addItem
  (name required; quantity/unit/store optional), updateItem, toggleChecked, deleteItem;
  stores: create/rename/reorder/delete (delete → items to NULL store). All `householdId`-first.
- `/shopping` page:
  - Header + "{checked} of {total} done"; quick-add field (Enter adds to first store, + opens
    sheet [3a] with the typed name).
  - Groups per store (uppercase label + pin icon), rows per design: CheckCircle, name,
    compact qty ("×6" for pcs, "2 L" otherwise), adder mini-avatar. Checked → struck, sorted
    to group end (checkedAt asc). Row tap → edit sheet; circle tap → toggle (optimistic).
  - Empty state [7d].
- Add/edit `ShoppingItemSheet` [3a]: item, quantity stepper, unit select (pcs g kg ml L pack),
  store chips; CTA "Add to {store} list" / "Save changes"; delete row when editing.
- `/shopping/stores` [7g]: reorder (pointer drag or up/down affordance — keep it simple,
  document choice), inline rename, add, delete w/ confirm; item counts; helper copy about
  order + "Other".
- Cron: register nightly cleanup job (03:30 local per household) deleting items checked >12 h
  ago — add to `lib/server/cron.ts` registry (pattern per ARCHITECTURE.md; the registry runs
  a minute tick, job gates itself by local time — first real cron job, keep it exemplary).
- Home: stat tile count already queries this table (02) — verify.
- Push hook: call a no-op `notifyShoppingAdd(...)` from addItem (function stub in
  `lib/server/push.ts` if 05 hasn't landed; 05 fills it in — keeps the call site here).

## Acceptance

- [ ] Add via quick-field and via sheet; item appears under the right store with adder avatar.
- [ ] Check/uncheck: strikethrough + reorder within group; "n of m done" updates; unchecking
      restores position.
- [ ] Edit changes name/qty/store; delete removes; empty list shows [7d] with working CTA.
- [ ] Stores: add/rename/reorder/delete all reflected in list grouping order; deleting a store
      moves items to "Other".
- [ ] Cleanup job removes stale checked items (test by backdating `checkedAt` in dev).
- [ ] `npm run check` && `npm run build` clean; UI matches the design frames.

Out of scope: shopping push notification content (05), recipe "add all to list" (07 — uses
this service's addItem with dedupe helper `addIngredients`, stub the export now if trivial).
