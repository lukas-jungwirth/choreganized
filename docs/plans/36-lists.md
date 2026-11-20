# 36 · Lists: shopping lists you can open, and checklists you can run again

**Status: done. Step 1 2026-11-20 (v0.5.0, DECISIONS #264); step 2, checklists, 2026-11-20
(v0.5.0, DECISIONS #267).** Approved by Lukas on 2026-11-20 after three passes over the sketch. Depends on: 03 (Shopping), 15 (live list).
SPEC: §3 is rewritten when this is built; §2 (Home's stat tile), §4.8 (recipe pour-in) and §6
(notification names) each gain a line.
Design: no frame in `design/Hearth.dc.html` (→ `size:l`). The sketch is
`design/sketches/lists.html`, frames **[L1]–[L7]** plus the three add variants A, B, C. Its
phones work: open a list, tick a row, type in the field. Open it in a browser and build to it.

**Goal:** the tab stops being one shopping list cut by shop. Every shop becomes a **list** with
its own icon. A list can also be a **checklist** (vacation packing, "before we leave") whose
ticks stay until you start over. A list can be **opened by itself** to work in it. And the add
field shows, and remembers, where a thing goes.

The expected household: one grocery list, sometimes a hardware store, one or two checklists
(Lukas, 2026-11-20). The overview is designed for that, not for ten lists.

## For the session that builds this

- **One step per session and per PR.** Step 1 first; step 2 only once step 1 is on `dev`.
- **The plan and the sketch are not on `dev` yet.** They sit untracked in the main checkout.
  Commit `docs/plans/36-lists.md`, `docs/plans/README.md` and `design/sketches/lists.html` with
  step 1. Leave the other untracked sketches (`raccoon-cards.html`, `theme-modes.html`) alone.
- **Build to frames [L1]–[L7] and the phone tagged "After".** The phones tagged A, B, C and
  "Before" are comparisons Lukas decided between; they are not targets.
- **Decided by Lukas (2026-11-20):** two kinds with icons · empty shopping lists are not shown ·
  no "Recently bought" section, "{n} bought" in the card instead · adding is A and B together ·
  the whole header folds and a corner button opens the list · no explanatory copy in the New
  list sheet.
- **Assumed, not confirmed:** the tab is renamed "Lists" / "Listen" · a date on checklists is
  left for later. Say so in the handoff so Lukas can still flip the name.
- **What the sketch does not draw**, and SPEC §3 still governs: the undo bar, the live notice,
  dragging, the item sheet [3a], Manage lists, the "Other" list, error states, the empty state
  [7d] (now: no list has anything on it), 200% text.
- The sketch uses bare px and its own class names. In the app every size is a `--fs-*` step and
  every colour a token; the sketch's tokens are copied from `src/app.css`, so nothing new is
  needed except where a step says so.
- **Live updates on the new route**: an event invalidates `SHOPPING_DEP` (`lib/live.ts`), so
  the opened list's load only has to `depends` on it and start `liveShopping` the way the
  overview does. Checked in the code on 2026-11-20, not run.
- **German copy** is written by the session; list every new string in the PR description so
  Lukas can review the wording.
- A judgment call the plan does not cover → decide, build, one line in DECISIONS.md.

## Why (what Lukas reported on 2026-11-20)

1. Lists exist only as shops. A packing list is "technically possible" as a shop called
   Vacation, but everything ticked is deleted 12 h later and it counts as shopping on Home.
2. Quick add always lands in the first shop. The fast path cannot say otherwise.
3. Choosing the shop means the sheet [3a]: sliders, chip, confirm.
4. Nothing can be put away. Every shop with an open item is on screen all the time.

## What changed in the second pass (Lukas's five questions)

| Question                                  | Outcome                                                                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Show lists that have no items?            | **No.** They leave the overview; the list menu in the field still reaches them.                     |
| Is "Recently bought" a needless divider?  | **Kept, moved.** No section of its own: one line, "2 bought", at the foot of the card it came from. |
| Is "Add to" (a row of chips) intuitive?   | **Dropped.** Replaced by the list icon in the field (a menu) and by opening a list.                 |
| Does the new-list sheet need explaining?  | **No.** A two-way switch, "Shopping list · Checklist". The kind can be changed later.               |
| A due date on a checklist, or both kinds? | **Not in this plan.** Shape written down under "Later"; never on shopping lists.                    |

## What good list apps do (research, 2026-11-20)

Bring!, AnyList, Apple Reminders, Google Keep, Todoist, OurGroceries, Microsoft To Do, Things,
Listonic, PackPoint: help pages and reviews. The sketch has the table and the source links.

| Pattern                             | Who                              | Here                                    |
| ----------------------------------- | -------------------------------- | --------------------------------------- |
| Add from inside the list            | Bring!, AnyList, OurGroceries    | open a list and the field belongs to it |
| The item remembers where it belongs | OurGroceries, Reminders, AnyList | each known name keeps its last list     |
| Amount typed in the same line       | Bring! ("2 kg apples")           | quick add parses it                     |
| Suggestions that know the list      | AnyList                          | a bought name goes back, no double      |
| Ticked things below, newest first   | OurGroceries, Keep, Bring!       | "2 bought" inside each card             |
| One tap to run a checklist again    | Keep ("Uncheck all items")       | "Start over"                            |
| Hide what is empty                  | Bring!, Reminders                | empty shopping lists leave the overview |

What reviews complain about, and what that rules out: categories the app **guesses** (Reminders'
most common complaint) → we only remember what the household did. Accidental ticks → the settle
and the undo bar already cover it. No manual order (Bring!) → drag stays. Amount hidden behind a
details screen (AnyList, OurGroceries) → typed inline.

## The design

### Two kinds of list, one difference

|                       | **Shopping list** (`kind = 'buy'`)      | **Checklist** (`kind = 'checklist'`)             |
| --------------------- | --------------------------------------- | ------------------------------------------------ |
| A tick                | settles, moves under "{n} bought"       | stays in place, struck, with the ticker's avatar |
| Overnight             | bought rows are deleted (as today)      | nothing happens                                  |
| On the overview       | a card with its rows, can fold          | always one row; opens when tapped                |
| Shows                 | how many are left                       | a ring and "5/12"                                |
| Start over            | none                                    | unticks everything, with Undo                    |
| Home's stat tile      | counted                                 | not counted                                      |
| Recipes pour in       | yes (the first shopping list, as today) | never                                            |
| Teaches the word list | yes                                     | no (a packing item is not a shopping habit)      |

Today's shops become shopping lists with no change to their items. A one-off list ("Party on
Saturday") is a shopping list too.

### The overview [L1] [L7]

- Title **Lists**, meta "{n} things to get" (shopping lists only). The gear opens Manage lists
  (today's `/shopping/stores`).
- The add field, then **one card per list**. No headings between them: shopping lists first, in
  their sort order, then checklists. Sage icon well for shopping lists, terracotta for
  checklists. A dashed **New list** row ends the page.
- **A shopping list is on the overview only while it has something on it**: open rows, or rows
  bought and not yet swept. With nothing left to buy its header reads "All done" with a tick,
  and after the nightly sweep the card goes. "Other" stays virtual, as today.
- **Tap the header to fold, the corner button to open.** The whole header of a shopping list
  folds and unfolds it, with a small chevron after the name, the way any section with a chevron
  behaves. Opening full screen has a button of its own at the right edge (two arrows, 34 px on
  a sunken square, 44 px target), in the same place on every card. The second pass had the
  name open the list and the chevron fold it; Lukas asked whether that was clear, and it was
  not: nothing says a name is a button. Folded, a card shows a one-line preview ("Toothpaste,
  Cotton pads"). Folded state is per device, in a cookie read by the load (the theme is the
  precedent, DECISIONS #119).
- **A checklist is always one row** on the overview: icon, name, "7 left · Sunscreen, Swimwear…",
  ring and "5/12", and the same open button. A tap anywhere on it opens it. It never unfolds in
  place.
- **"{n} bought"** is the last line of a shopping list's card (was the "Recently bought"
  section). Tap to unfold the struck rows, newest first; tap a row's circle to put it back.
- Unchanged inside a card: the row, drag to reorder within the list, the settle, the undo bar,
  live ticks in the housemate's colour, the live notice.

### A list, opened [L4] [L5]

- Its own route, `/shopping/[listId]`, so Android's back button and the swipe-back both return
  to the overview, and a push can link to it. Tab bar stays.
- "‹ Lists" and a ⋯ menu (rename, icon, change kind, delete) · icon and name · "4 to get ·
  2 bought", or "5 of 12 done" over a progress bar · the add field · the rows.
- **The field here adds to this list and nothing else.** Its leading icon is the list's icon,
  with no menu. This is the way to fill a new checklist and to pack from one.
- A shopping list opened shows the same card body as on the overview, "{n} bought" included.
- A checklist: ticking is immediate and in place (no settle, no undo bar). Order never changes.
  **Start over** appears at the foot once anything is ticked, filled when everything is. It
  unticks every row in one transaction and shows the undo bar ("**Vacation packing** started
  over · Undo"). It never happens by itself.
- Live updates as on the overview.

### Adding from the overview [L2] [L3]

Three variants are drawn (A · the field says where it goes, B · open a list and work in it,
C · a field in every list). **This plan builds A and B together.** C is out: it needs empty
lists on screen and puts the field at the end of the list.

- **The field's leading icon is the list it adds to**, and the placeholder names it ("Add to
  Grocery…"). It starts on the first shopping list every time the screen is opened.
- **Tap the icon for the menu**: every list top to bottom with icon, name and what is on it
  ("4", "empty", "5/12"), then "New list". This is where an empty list lives. A choice made here
  stays until the screen is left.
- **It remembers.** `shopping_suggestions` gains the list each name last went to. When what is
  typed is a name the household knows, the icon changes by itself and a line under the field
  says why ("**Shampoo** goes to Drugstore, like last time."). A list picked from the menu
  wins. The app never guesses: an unknown name lands on the list shown.
- Suggestion rows show their list on the right; picking one adds it there. A name sitting under
  "{n} bought" is offered too, and picking it **unticks that row** instead of adding a second.
- **"2 l milk" sets the amount** (`parseIngredient` in `utils/ingredients.ts` already reads this
  for recipes). The sliders button is gone. Tapping a row still opens the sheet [3a] to edit;
  there "Store" becomes "List".
- An item added to a list that is folded or not on screen: the card appears or stays folded,
  its count changes, and it flashes sage once.

### New list, and managing them [L6]

- **New list** sheet: name · a switch **Shopping list | Checklist** · an icon from a fixed set
  of twelve lucide icons. No explanatory copy. On create, the list opens.
- Manage lists (was Manage stores [7g]): reorder, rename, icon, kind, delete.
- **The kind can be changed later**, which is what makes the missing explanation safe. Shopping
  list → checklist: bought rows become ticked rows. Checklist → shopping list: ticked rows
  become bought rows and are swept that night; the confirm says so.
- Deleting a shopping list moves its open items to "Other" (as today). Deleting a checklist
  deletes its rows, after a confirm that says how many.

## Build

Two PRs, each shippable on its own.

### Step 1 · Lists you can open, and a field that knows where things go (feature → minor)

**Data** (one migration, `ADD COLUMN` only):

- `stores.icon` TEXT NULL (a key from the fixed set; NULL renders the basket).
- `stores.kind` TEXT NOT NULL DEFAULT `'buy'`. Added now so step 2 needs no second migration;
  step 1 never writes `'checklist'`.
- `shopping_suggestions.store_id` TEXT NULL → `stores.id` ON DELETE SET NULL.
- **The table and column keep their names** (`stores`, `store_id`). The UI and the catalog say
  "list"; a rename buys nothing the household can see and drizzle's rename path is the one that
  has bitten before (DATA-MODEL, migration 0013). Log it in DECISIONS as a kept identifier.

**Service** (`services/shopping.ts`): `addItem` writes the suggestion's `storeId`;
`listItemNames` returns `{ name, storeId }`; `listStores` returns `icon` and `kind`;
`createStore`/`renameStore` take the icon. `splitList` returns bought rows per list instead of
one pool. A suggestion pick that matches a bought row calls `setChecked(false)` instead of
`addItem`.

**Screens**: `ShoppingGroup` becomes `ListCard` (a header that folds, an open button, the rows it has today,
the bought foot that replaces `BoughtSection`). New route `shopping/[listId]` sharing the card
body, guarded by `requireMember` and scoped by household like every other; a list id from another
household is a 404. `QuickAdd` gains the
leading icon, the menu, a fixed-list mode for the opened view and the amount parse; it loses the
sliders button. Cookie `lists_folded`. The live stream already carries everything both screens
need.

**Copy**: `m.shopping.*` gains the list vocabulary in `en.ts` and `de.ts`. Functions wherever a
name or a count is in the string. No em dashes.

**Tests that fail without it**: unit for the target rule (known name, unknown name, menu pick
wins, resets on leaving) and the amount parse · integration for the remembered list, bought
rows per list, and "pick a bought name → the row is unticked, no second row" · Playwright: fold
and reload; type a known name + Enter; pick a list from the menu and add two; open a list, add,
go back with the browser's back · visual baselines for `shopping*.png` refreshed, plus the
opened list and the menu.

**Built 2026-11-20** (v0.5.0, DECISIONS #264). Deviations: the New list sheet has no kind switch
yet (it comes with step 2); the ⋯ on an opened list edits name and icon only, and delete stays in
Manage lists; "Other" folds but can't be opened; a quick add of a known name keeps the household's
spelling. Drag to reorder was not verified by hand (the harness can't drag, on `dev` either).

### Step 2 · Checklists (feature → minor)

- `kind = 'checklist'` becomes writable: the New list sheet, `createStore(…, kind)`,
  `setStoreKind` with the conversions above.
- `splitList` keeps a checklist's ticked rows in place; `purgeCheckedItems` skips them;
  `countUnchecked` (Home) and `listOpenItems`/`addIngredients` (recipes) ignore checklists; the
  "added {n} items" push fires for shopping lists only; checklist adds do not write
  `shopping_suggestions`.
- `resetList(householdId, storeId)` and its undo (the ids it unticked, re-ticked with their
  original `checkedAt`/`checkedByMemberId`); a `reset` live event so the other phone follows.
- The checklist row on the overview and the opened checklist view (progress bar, Start over).
- **Tests**: unit for `splitList` with a checklist · integration for the sweep (a checklist row
  ticked 13 h ago survives), reset and its undo, Home's count, a recipe pour-in that must not
  match a checklist row, both kind conversions · Playwright: create a checklist, it opens, add
  three, tick two, start over, undo · visual baseline of an opened checklist, light and dark.

**Built 2026-11-20** (DECISIONS #267). Deviations: delete stays in Manage lists (as in step 1)
rather than in the ⋯ sheet; the kind confirm appears only when rows would move; "Other" sits
before the checklists; an opened checklist's field offers no suggestions; a checklist tick is a
silent refresh on the other phone (no "got" notice). Acceptance 13 and 15 were checked by
integration tests against the real service functions, not by hand.

### Later, each its own small plan if wanted

- **A date on a checklist** ("Needed Sat 28 Nov", drawn in the sketch). One nullable date per
  list, for this run: shows "in 8 days", lifts the list to the top of the overview in its last
  three days, one push the evening before if anything is unticked, cleared by Start over. Never
  on shopping lists, never per row: dates per row, reminders and owners are the Tasks tab.
  Build after one real trip, if it was missed.
- Paste several lines → several items (AnyList) · drag a row from one list into another ·
  "save as template / add all or pick some" (Bring!, AnyList starter lists) · a one-tap "I'm
  going shopping" push (Bring!).

## Acceptance (walk these in the running app)

Step 1

1. A household with today's data opens the tab and sees its shops that have items as cards,
   items untouched. Shops with nothing on them are not on screen.
2. Tap the field's icon: every list is in the menu, the empty ones marked "empty".
3. Pick Hardware store, add two things: both land there, its card appears, the field still
   says Hardware store. Leave the tab and come back: the field says Grocery again.
4. Type "Shampoo" (added to Drugstore once before): the icon changes to Drugstore and the line
   under the field says why; Enter puts it there. Type an unknown word: nothing changes.
5. "2 l milk" + Enter gives a row "Milk · 2 L".
6. Tap the open button on Grocery: the list opens alone. Add three things without touching anything else.
   The phone's back button returns to the overview.
7. Tick the last open row of a list: after the settle its header reads "All done" and
   "{n} bought" is still there to put it back. After the sweep the card is gone.
8. Tap Grocery's header: it folds. Reload: still folded. Another device is unaffected.
9. Tick, undo, drag, a housemate's tick and a recipe pour-in behave exactly as before.
10. 200% text size: the field, the menu and both headers survive (`text-size.spec.ts`).

Step 2

11. New list → "Vacation packing", Checklist, luggage icon. It opens. Add six rows.
12. Tick three: they stay in place, the header says 3 of 6, Home's stat tile does not change.
13. After `purgeCheckedItems` the three are still ticked.
14. Start over unticks all; Undo puts the three ticks back.
15. A recipe with "Sunscreen" does not top up the packing list's row.
16. Change the checklist to a shopping list: the confirm warns, the ticked rows are under
    "{n} bought".
17. Delete the checklist: the confirm names the rows, and they are gone.

## Open calls (the plan assumes the first answer)

1. **How to add**: A and B together (assumed), or one of A, B, C alone.
2. **The tab's name**: "Lists" / "Listen" (assumed, with the bag icon and shopping raccoon
   kept), or stay "Shopping" / "Einkauf".
3. **A date on checklists**: later, as its own step (assumed), now, or never.
