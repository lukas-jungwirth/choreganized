# 46 · The recipe editor, rebuilt around parts and links

**Status: todo.** Asked for by Lukas on 2026-11-23; he saw the sketch the same day and asked
for the four changes marked "(Lukas, sketch feedback)" below, which the sketch now shows.
Depends on: 43. SPEC: §4.4 rewritten. Design: `design/sketches/recipe-rebuild.html`, frames E1,
E2, E3a, E3b, E3. Replaces frame [3c].

**Goal:** Lukas: "the UI is also a little bit too small sometimes to really work it out and
not that easy to understand what to add, like timer, ingredients, move, delete." Today a step
is a textarea with three 16 px icons beside it and two rows of small chips under it marked
"auto", and an ingredient is one typed line with a chip. Parts, notes and stored links
(plan 43) have no place in it at all.

## What it does

**Ingredients**

- Rows under **part headings**. "Add part" names one; a part's name is edited in place; an
  empty name dissolves the part into the one above.
- **A recipe with one part never shows the word "part"** (agreed with Lukas on 2026-11-23:
  most recipes have none). No heading over the ingredients or the steps, no "Part" row in the
  ingredient sheet, no "Move to part…" in a step's menu. The only hint is a quiet **"Add
  part"** button at the end of each list. Tapping it asks for a name ("Béchamel") and puts a
  new heading below what is already there; the rows above stay as they are, without a
  heading, until they are given a name too. From the first part on, the "Part" row and "Move
  to part…" appear. The recipe view and cook mode already show no heading and no part name
  for such a recipe (plan 43).
- A row shows amount and unit (or counting word), the **name**, and the note in a second,
  smaller line. Tapping it opens the ingredient sheet [E2]: name, amount, note, part.
  **The amount is a number and a unit, kept apart** [E2, E2b] (agreed with Lukas on
  2026-11-23 after three drafts he turned down: a tall number box beside wrapped unit chips,
  a number box with a scrolling chip row, and one typed field with a chip. His reasons: a
  typed field has to guess what is number and what is unit, auto-suggest and adding words are
  hard to make free of frustration, and an open field where anything goes overwhelms people):
  - **Number**: numbers only ("500", "1,5", "½", "1/2"), the number keyboard, nothing else
    accepted.
  - **Unit**: a button showing the current unit ("g", or "No unit"). It opens a panel [E2b]
    with **everything visible, nothing to type or scroll**: the eight units; about twelve
    everyday counting words (Zehe, Bund, Dose, Prise, Scheibe, Becher, Glas, Stange, Zweig,
    Blatt, Msp., Würfel; the English ones when the app is in English); the household's own
    words after those, outlined; "No unit"; and **"Add your own"**, the only way a new word
    comes in. The row's current word is always in the panel, also when it is one the reader
    knows but the panel does not list ("Tasse").
  - **One list for everyone** (this amends DECISIONS #313, which let a row keep any word): a
    unit is one of the eight, one of the counting words the reader knows (plan 42, about 40,
    of which the panel shows the everyday dozen), or a word the household added. The AI import
    picks from the same list (plan 44). Own words are per household, kept in the table plan 44
    adds, and listed in Settings where one can be removed.
- **Typing a whole line stays the fast way in**: an add field at the foot of each part takes
  a line ("400 g Nudeln", "1 Karotte, in Scheiben") and reads it with plan 42's reader; what
  follows a comma or stands in brackets becomes the note. The rule is fixed and simple: the
  number comes first, then a unit **only if the next word is on the list** (the household's
  own words included), and everything else is the name. "500 rote Zwiebeln" is 500 of "rote
  Zwiebeln"; "Mehl 500 g" is 500 g Mehl; "Salz 2 Prisen fein" has its number in the middle and
  stays a name. The row shows what was understood, and a line read wrongly is fixed by tapping
  the row, in the two fields above.
- Reorder by **dragging the grip** (`svelte-dnd-action`, already a dependency), also from one
  part into another; the ingredient sheet's Part row does the same without a drag. The arrows
  of DECISIONS #67 go.

**Steps**

- Cards under part headings, numbered straight through. The text is a textarea at reading size
  (`--fs-17`), growing with its content.
- Under the text, **two rows that say what they hold** [E3a] (Lukas, sketch feedback: it was
  not clear how to get from a step to its links), each at least 48 px high, label left, value
  right, a chevron: **Ingredients** with the linked names ("Karotten, Faschiertes", or "Link
  the words that name them" when there are none) and **Timer** with its name and time (or "Add
  a timer"). Tapping the text edits the text; tapping a row opens its sheet.
- A **⋯** button on the card holds Move up, Move down, **Move to part…** and Delete.
  **Move to part… opens a list of every part** [E3b] (Lukas, sketch feedback: "what if there
  are three different parts?"), with the current one marked, "No part" and "New part"; the
  step lands at the end of the part picked. The same list moves an ingredient from its sheet.
  Steps are not dragged; ingredients are.
- **Ingredients** opens the link sheet [E3] (Lukas, sketch feedback: the superscript names
  beside linked words read badly):
  - The step's text on top, every word tappable, shown **as cook mode will show it**: a linked
    word underlined in amber, a linked amount in amber.
  - Under it, **"Linked in this step"**: one row per link, the words as they stand in the text,
    an arrow, the ingredient ("“Zwiebelwürfel” → Zwiebel"), and ✕ to remove it.
  - Tap a word → the list gives way to "Link “…” to" with the ingredients, the likely one
    first → linked. Tap a linked word → pick another.
  - **An amount is linked with its word** (Lukas: "400 grams of carrots … when I adjust the
    portions it should become 800 grams, can I link the value and the ingredient"). When a
    number, with or without a unit, stands beside the linked word, it becomes the link's
    `amount_phrase` (plan 43) automatically, provided the unit is the ingredient's own and the
    amount is not more than the ingredient's. "Beside" is the rule cook mode rewrites by (the
    review of plan 43): before the word with at most three words and no other number or
    sentence end in between ("400 g geschälte Karotten"), else right after it ("Karotten
    (400 g)"). The link's row then carries a switch,
    "400 g follows the number of people" / "400 g stays as written"; tapping the amount in the
    text flips the same switch. A number that stands further away, or in another
    sentence, cannot follow the number of people: tapping it says so ("Not next to its
    ingredient, so it stays as written") and offers nothing to pick.
  - **A step may use part of an ingredient** (Lukas: "the step says 200 g of carrots but in
    total there are 400"). Nothing extra to do: the step's "200 g" is linked like any amount,
    the link also stores 200 g as the step's share (`quantity`, plan 43), and its row reads
    "200 g of 400 g". For twice as many both move: the text says 400 g, cook mode's list says
    "400 g of 800 g". The automatic link is only made while the amount is not more than the
    ingredient's total; an amount above it is left unlinked and can be linked by hand.
  - **"Show for 4 / 8 people"** at the top rewrites the text the way cook mode will, so the
    effect of a linked amount is visible before saving. The two numbers are the recipe's
    servings and twice that; the control is absent when the recipe has no servings.
  - A time ("2 - 3 Min.") or a temperature is never an amount and is not tappable.
  - Below the list: the ingredients this step uses without naming them, with "Add ingredient".
- **Suggestions, not silence**: when the text changes, the matcher proposes links for words it
  recognises (dotted underline, "Link Zwiebel?"); a tap accepts. A stored link whose phrase is
  no longer in the text is shown as "no longer in the text" until it is re-linked or removed.
- Saving a step from this editor writes `ingredients_set = true` (plan 43): from then on cook
  mode shows exactly what the editor showed.

**The rest** (photo, name, time, servings, tags) keeps its behaviour and takes the larger
controls of the sketch.

## Open, to settle with Lukas before building

- **Singular and plural.** The panel says "Zehe"; a recipe for two reads better as "2 Zehen".
  Proposal, not agreed: a built-in word is shown in the number that fits the amount, an own
  word as it was added.
- **Where "Add your own" asks for the word**: in the panel itself, or a small sheet over it.

## Build

- `RecipeForm.svelte` (1190 lines) is split: `RecipeBasics`, `IngredientList`,
  `IngredientSheet` (rebuilt), `StepList`, `StepCard`, `StepLinkSheet`, `StepTimerSheet`
  (kept). The form still posts through one action with `use:enhance`; `readRecipeForm` reads
  structured fields per row, no longer a typed line (the line is only the add field's input).
- `UnitPanel.svelte` (new, `lib/components/cooking`): the panel of [E2b]; the Settings row and
  sheet for the household's own unit words (the table is plan 44's).
- `utils/step-links.ts` (plan 43) gains `suggestLinks(text, ingredients, links)` on top of the
  matcher, and `tokens(text)` for the tappable words.
- Removed: the amount chip + "reading" preview of DECISIONS #100–101 (the row is structured
  now), `StepIngredientsSheet`, `composeIngredientLine`.
- Catalog (en, de). SPEC §4.4. DESIGN-SYSTEM (the action row, if it becomes a `ui` component).
  DECISIONS (what replaces #67, #100, #101, #127).

## Tests

- Unit: `tokens`, `suggestLinks` (a compound is suggested for nothing; an exact name is; an
  accepted link is never suggested again), `readRecipeForm` with parts, notes and links.
- Integration: save, reload, save again changes nothing (no drift).
- e2e: build a two-part recipe by typing; link "Zwiebelwürfel" to Zwiebel by tapping the word;
  set a timer; move a step to another part; cook it: the word is underlined.
- Visual: the editor top, an open part, a step card, the link sheet, the ingredient sheet;
  light and dark; German at 200 % text size.

## Acceptance

- [ ] Every control on a step is labelled and at least 44 px high.
- [ ] In a recipe with three parts, a step can be moved to any of them from ⋯ → Move to part….
- [ ] A step that says "400 g Karotten" links the amount with the word; "Show for 8" in the
      link sheet and cook mode for 8 both read "800 g Karotten". Switching the amount off
      leaves it at 400 g in both.
- [ ] The number field takes "500", "1,5" and "½" and refuses letters; the unit button opens
      the panel with the eight units, the everyday counting words, the household's own words,
      "No unit" and "Add your own", all visible without scrolling at 390 × 844.
- [ ] Picking "Zehe" in the panel saves the row with that unit; "Add your own" with "Kugel"
      adds it for this household only, shows it in the panel from then on, and Settings lists
      it with a way to remove it.
- [ ] In the add field, "2 Kugel Mozzarella" saves 2 Kugel of "Mozzarella" for the household
      that added the word and 2 of "Kugel Mozzarella" for one that did not; "500 rote
      Zwiebeln" saves 500 of "rote Zwiebeln"; "Salz 2 Prisen fein" stays a name.
- [ ] A step that says "200 g Karotten" in a recipe with 400 g shows "200 g of 400 g" in the
      link sheet and in cook mode, and "400 g of 800 g" for twice as many.
- [ ] A word in a step can be linked to an ingredient in two taps, and cook mode underlines it.
- [ ] Typing "1 Karotte, in Scheiben geschnitten" into the add field gives name "Karotte" and
      that note.
- [ ] An ingredient can be dragged into another part; a step can be moved to another part.
- [ ] A recipe without parts shows no heading, no "Part" row in the ingredient sheet and no
      "Move to part…"; only "Add part" at the end of each list. After adding one part, all
      three appear, and the rows above the new heading are unchanged.
- [ ] An old recipe opens with the matcher's guesses as suggestions and saves as stored links.
- [ ] `npm run verify` and `npm run test:visual` clean.
