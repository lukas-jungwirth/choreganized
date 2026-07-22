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

- [x] Add via quick-field and via sheet; item appears under the right store with adder avatar.
- [x] Check/uncheck: strikethrough + reorder within group; "n of m done" updates; unchecking
      restores position.
- [x] Edit changes name/qty/store; delete removes; empty list shows [7d] with working CTA.
- [x] Stores: add/rename/reorder/delete all reflected in list grouping order; deleting a store
      moves items to "Other".
- [x] Cleanup job removes stale checked items (test by backdating `checkedAt` in dev).
- [x] `npm run check` && `npm run build` clean; UI matches the design frames.

Out of scope: shopping push notification content (05), recipe "add all to list" (07 — uses
this service's addItem with dedupe helper `addIngredients`, stub the export now if trivial).

## Session notes (2026-07-22)

Walked at 390×844 against [03]/[3a]/[7d]/[7g] and on a 1280px window (centred column, tab bar
on the column), with `npm run db:seed` data: added by the field and by the sheet, checked and
unchecked (strike, travel to the group's end, "2 of 12 done", position restored on uncheck),
edited a name/quantity/store, cleared a quantity back to "—", deleted from the sheet, then
renamed · reordered · added · deleted a store and watched its two items reappear under "Other".
Home's tile agreed with the list throughout ("9 on shopping list" for 9 open items).

The cleanup job was verified on the **production build** rather than the dev server: `init`
only runs once per process, so a dev server that started before `cron.ts` existed never
registers the job. `npm run build`, one item backdated to 13 h ago, `node build/index.js` — the
first minute tick logged `[cron] cleared 1 checked shopping item(s)` and left the item checked
5 h ago alone.

**Not verified, and why:** pressing **Enter** in the quick field. The automation's synthetic
Return doesn't trigger the browser's implicit form submission in this Chromium shell (same
family of gap as the `<dialog>` `close` event in [#36](../DECISIONS.md)) — the text lands in
the field and nothing submits. Implicit submission activates the form's only submit button,
which is the sage +, and that path is verified end-to-end. Also unexercised: `addIngredients`,
which has no UI until plan 07 — it type-checks and reads correctly, but nothing has run it.

**Deviations** (all logged in [DECISIONS.md](../DECISIONS.md) #41–#46)

- **The quick field adds; a sliders button opens the sheet.** The plan says "+ opens sheet",
  SPEC §3.1 says the + adds and an "expand affordance" opens it. SPEC wins → #41.
- **Stores reorder with ↑/↓ buttons, not drag** (the plan left the choice open) → #44. Rename
  is an always-live field that saves on blur; delete asks first.
- **`×1` is never rendered and 0 means "no quantity"** → #42; units stay free text so plan 07's
  "tbsp" survives → #43.
- **A checked row drops its adder avatar** — that's what [03] draws → #46. The sheet always
  offers an "Other" chip, which [3a] doesn't draw, because store-less items exist.
- **`--r-block: 16px`** joined `app.css` (quick-add, the sheet's delete block, add-a-store) —
  the tokens-only rule again (→ #34).
- **`services/shopping.ts` ships `addIngredients` for real** instead of the stub the plan
  allowed: dedupe is against _open_ items only (butter bought this morning is a fresh need),
  and quantities are never merged.
- Two shared components changed rather than being forked: `PageHeader` now groups `meta` and
  `actions` into one trailing block (Shopping needs both), and `dates.ts` gained `clockIn`,
  with `hourIn` re-expressed in terms of it so there's one way to ask what time it is.

**Two things found by walking it**

1. **`npm run db:seed` duplicated the household's stores.** Onboarding already creates Grocery ·
   Drugstore · Hardware store with UUID ids, and the seed inserted its own deterministic ones
   next to them — invisible until this plan gave stores a screen, then six chips in [3a]. The
   seed now matches by name and only inserts what's missing.
2. **The quick field kept its text after the sheet added the item**, inviting a second identical
   add. The value now lives on the page, and the sheet reports a successful _add_ (`onadded`)
   so it can be cleared — cancelling, saving an edit or deleting all keep what was typed.

## Review pass (2026-07-22)

Eleven findings; the six that were worth changing are fixed and re-walked in the browser:

- **A form showed somebody else's error.** Both the quick field and the sheet read the
  page-wide `form`, so a rejected quick-add painted "Give the item a name." onto the next item
  you opened for editing. Each form now owns the failure it caused (`result.data.error` from its
  own `enhance`), and the page brokers nothing.
- **`onsaved` fired on delete**, wiping whatever was typed in the quick field. It's `onadded`
  now, and only the add path calls it.
- **The page read `stores` twice per request** — once for the groups, once for the chips. A
  housemate deleting a store between the two reads could have made them disagree;
  `getShoppingList` now takes the list the load already has.
- **The cron's try/catch sat outside the household loop** while its comment promised per-
  household isolation. It's inside now — one household's failure costs only its own sweep.
- **`Select` spread `{...rest}` after its own `class`** — the same trap plan 02's review found
  in `Chip`: `<Select class="…">` would have erased the field's styling. Merged, like Chip and
  Button.
- **The stepper's `min="1"` blocked a typed 0** when the field is `clearable` — the browser
  demanded "≥ 1" from someone asking for no quantity at all. 0 now means "none", the same as
  stepping down past 1.

Reported, deliberately not changed: `createStore` doesn't reject a blank name the way
`renameStore` does (both actions already do, and there's no good return shape for it); the
item actions discard the service's boolean, so editing an item a housemate just deleted
reports success (the refreshed list tells the truth a moment later); and the two shopping
pages each keep their own copy of the `.rows` list styles and a `readName` helper.
