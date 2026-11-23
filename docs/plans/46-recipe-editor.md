# 46 · The recipe editor, rebuilt around parts and links

**Status: todo. The sketch has to be agreed first.** Asked for by Lukas on 2026-11-23.
Depends on: 43. SPEC: §4.4 rewritten. Design: `design/sketches/recipe-rebuild.html`, frames
E1–E5. Replaces frame [3c].

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
  smaller line. Tapping it opens the ingredient sheet: amount, unit (the eight, or "other" with
  a free word), name, note, part.
- **Typing stays the fast way in**: an add field at the foot of each part takes a line
  ("400 g Nudeln", "1 Karotte, in Scheiben") and reads it with plan 42's reader; what follows
  a comma or stands in brackets becomes the note. The row shows what was understood.
- Reorder by **dragging the grip** (`svelte-dnd-action`, already a dependency), also from one
  part into another. The arrows of DECISIONS #67 go.

**Steps**

- Cards under part headings, numbered straight through. The text is a textarea at reading size
  (`--fs-17`), growing with its content.
- Under the text, **one labelled row of actions**, each at least 44 px high, with an icon and
  a word: **Ingredients** (count), **Timer** (its time when set), and a **⋯** menu with Move
  up, Move down, Move to part, Delete. A grip on the card drags it.
- **Ingredients** opens the link sheet: the step's text with every word tappable. Linked words
  are underlined in amber with the ingredient's name beside them. Tap a word (or drag across
  several) → pick the ingredient → linked. Tap a linked word → change or unlink. Below the
  text: the ingredients this step uses without naming them, with "Add ingredient". An amount
  the text gives an ingredient is shown as part of the link and can be switched off.
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
- [ ] A word in a step can be linked to an ingredient in two taps, and cook mode underlines it.
- [ ] Typing "1 Karotte, in Scheiben geschnitten" into the add field gives name "Karotte" and
      that note.
- [ ] An ingredient can be dragged into another part; a step can be moved to another part.
- [ ] An old recipe opens with the matcher's guesses as suggestions and saves as stored links.
- [ ] `npm run verify` and `npm run test:visual` clean.
