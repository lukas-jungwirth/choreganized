# 47 · Cook mode: what this step needs, at reading size

**Status: todo.** Asked for by Lukas on 2026-11-23; he saw the sketch the same day ("Cook mode
looks good"), so frames C1–C3 are agreed, the "Get ready" screen and the 27 px step text included.
Depends on: 43. SPEC: §4.6. Design: `design/sketches/recipe-rebuild.html`, frames C1–C3.
Changes frame [7b].

**Goal:** Lukas: "I want to make it as easy as possible … to have the recipe really easy to
follow, so the steps are clear, it's clear which ingredient is for which step." Today the
answer to "what goes in now, and how much?" is a 13 px grey line under two buttons ("This step
uses 2 tbsp Curry paste"), a tap on an underlined word, or a peek sheet. Plan 43 makes the
links reliable; this plan makes them the second thing on the screen.

## What it does

1. **The step's ingredients are a list under the text**, one row each: the amount in amber,
   the name, the note in a smaller line ("in Scheiben geschnitten"), and "of 500 g" where the
   step takes a share. Scaled for the number cooked for. It replaces the "This step uses…"
   line and stays while a timer runs.
2. **The part is on screen**: "STEP 5 OF 10 · BÉCHAMEL", and the progress bar shows where one
   part ends and the next begins.
3. **The text keeps its underlines and its tap bubble** (DECISIONS #133), from stored links.
   An amount the text gives is shown scaled, as today.
4. **A first screen before step 1, "Get ready"**: every ingredient under its part, with its
   note, tickable. Ticks are kept on the device for this cook. Skippable with Next; reachable
   again from the Ingredients button.
5. **Text size follows the step's length**: a short step keeps `--fs-33`; one of more than
   about 220 characters steps down to `--fs-26`, so a long imported step fits without
   scrolling past its ingredients.
6. **Tips the import left out** (plan 44's "left out", if the cook put none back) are not
   shown here. Notes are.

## Build

- `routes/(app)/cooking/recipes/[id]/cook/+page.svelte`, `CookStepText.svelte`,
  `IngredientsPeekSheet.svelte` (grouped by part), new `CookStepIngredients.svelte`,
  `CookGetReady.svelte`.
- The step cursor gains a position 0 (`?step=0`); timers, the dock and the notification links
  keep pointing at real steps.
- Catalog (en, de). SPEC §4.6. DECISIONS.

## Tests

- Unit: the size step; the rows a step shows (share, note, scaled).
- e2e: the seeded two-part recipe: Get ready ticks survive Prev/Next and a reload; step 5
  shows its part and its three ingredients with amounts; cooking for 8 doubles them; a running
  timer leaves the list in place.
- Visual: Get ready, a step with ingredients, a long step, a step with a running timer; German
  at 200 %.

## Acceptance

- [ ] On every step the ingredients and their amounts can be read without a tap.
- [ ] The part name is on screen for a recipe with parts and absent for one without.
- [ ] A 400-character step and its ingredient list fit a 390 × 844 screen without scrolling,
      at normal text size.
- [ ] Old recipes (matcher fallback) show the same list from the matcher's reading.
- [ ] `npm run verify` and `npm run test:visual` clean.
