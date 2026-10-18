# 23 · Amounts in step text follow servings

**Goal:** "Cooking for {n}" scales the ingredient list and each step's "uses" line (#124, #127).
The step's own sentence is left alone, though, so "Add 2 tomatoes" still says 2 when you cook for
twice as many. Scale the amount written right before an ingredient in a step, **only where it is
certain**, and leave everything else exactly as written.

Depends on: 07. SPEC: §4.5, §4.6. Design: there is no frame. A scaled number is marked quietly
inside the existing step text.

## Build

- `utils/step-amounts.ts` (pure) runs over `readStep` segments. It finds an amount **directly
  before** an ingredient segment: a number or fraction, then an optional unit alias, then
  whitespace.
- It scales only when **all** of these hold:
  - The factor is not 1.
  - The text's unit normalises to the row's unit, or neither has one.
  - On a pinned step, the number equals the pinned share or the row total. On an unpinned step,
    it is no more than the total.
- It matches against the **unscaled** reading and the raw pins, then applies the factor. Cook mode
  scales the rows before `readStep`, which loses the totals.
- Only the number changes. The unit stays as written ("2 EL" → "4 EL"), and so does the decimal
  comma. `ingredients.ts` exports small helpers for the amount pattern and unit aliases, and there
  is a formatter that keeps commas.
- `StepSegment` gains an optional `amount`.
- `CookStepText` marks a scaled number subtly; its accessible text says it was adjusted.
- The recipe view's step list moves to segments **without underlines**.
- The editor always shows the text as written.
- Docs: SPEC §4.5/§4.6; DECISIONS (render-time, conservative, nothing stored).

## Acceptance

- [ ] At 4 → 8 servings, "2 Tomaten hinzufügen" reads "4 Tomaten", and "200 g Mehl" reads "400 g
      Mehl", in the recipe view and cook mode.
- [ ] "180 °C", "2 cm", "10 Minuten", "in 4 Portionen", a number before a non-ingredient, and a
      pinned share that doesn't match are all left untouched.
- [ ] At the written servings, nothing changes.
- [ ] `npm run verify` and `npm run test:visual` clean.

Out of scope: amounts written after the name ("Tomaten, 2 Stück"); words for numbers ("zwei").
