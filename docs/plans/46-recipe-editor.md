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
- A row shows amount and unit (or counting word), the **name**, and the note in a second,
  smaller line. Tapping it opens the ingredient sheet [E2]: name, amount, note, part.
  **The amount is one typed field whose chip opens the units** (Lukas, 2026-11-23, after two
  rejected drafts: a tall number field beside wrapped unit chips, then a number field with
  chips in a scrolling row; his own proposal: "you write 500g and when detected it is possible
  to change the unit"). "500 g", "2 EL", "1 Dose", "2 Zehen" are typed into one field and read
  by plan 42's reader. A chip in the field shows what was read, the way the add field on Lists
  shows "×3" (plan 37). **The chip is a button**: it opens a small menu of the eight units and
  "No unit", with the current one marked and the row's own counting word listed when it has
  one; picking a unit rewrites the field ("500 g" → "500 kg"). No amount typed, no chip. A
  line of examples sits under the field.
- **Typing stays the fast way in**: an add field at the foot of each part takes a line
  ("400 g Nudeln", "1 Karotte, in Scheiben") and reads it with plan 42's reader; what follows
  a comma or stands in brackets becomes the note. The row shows what was understood.
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
    number, with or without a unit, stands directly before the linked word, it becomes the
    link's `amount_phrase` (plan 43) automatically, provided the unit is the ingredient's own
    and the amount is not more than the ingredient's. The link's row then carries a switch,
    "400 g follows the number of people" / "400 g stays as written"; tapping the amount in the
    text flips the same switch. A number that stands elsewhere ("Karotten, etwa 400 g") is
    linked by tapping it and picking the ingredient.
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

## Build

- `RecipeForm.svelte` (1190 lines) is split: `RecipeBasics`, `IngredientList`,
  `IngredientSheet` (rebuilt), `StepList`, `StepCard`, `StepLinkSheet`, `StepTimerSheet`
  (kept). The form still posts through one action with `use:enhance`; `readRecipeForm` reads
  structured fields per row, no longer a typed line (the line is only the add field's input).
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
- [ ] Typing "500 g" into the amount field shows the chip "500 g"; tapping the chip and
      picking kg makes the field and the chip read "500 kg", and the row is saved as 500 kg.
- [ ] A step that says "200 g Karotten" in a recipe with 400 g shows "200 g of 400 g" in the
      link sheet and in cook mode, and "400 g of 800 g" for twice as many.
- [ ] A word in a step can be linked to an ingredient in two taps, and cook mode underlines it.
- [ ] Typing "1 Karotte, in Scheiben geschnitten" into the add field gives name "Karotte" and
      that note.
- [ ] An ingredient can be dragged into another part; a step can be moved to another part.
- [ ] An old recipe opens with the matcher's guesses as suggestions and saves as stored links.
- [ ] `npm run verify` and `npm run test:visual` clean.
