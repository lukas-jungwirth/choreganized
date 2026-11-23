# 48 · Tidy a saved recipe

**Status: todo.** Proposed on 2026-11-23 with the recipe rebuild; small, last. Depends on: 44, 45. SPEC: §4.5 (the ••• menu), §4.7. Design: reuses plan 45's review screen.

**Goal:** the household's cookbook was imported before plans 42–45. Its recipes keep working
(plan 43 changes nothing for them), but their names still carry notes ("Hackfleisch,
gemischtes"), they have no parts, and their links are the matcher's guesses. Importing each one
again from its link would lose the photo, the tags, the favourite and the plan history.

## What it does

- The recipe's ••• menu gains **Tidy with AI**, shown when a provider is set up.
- It sends the saved recipe (name, ingredient lines as stored, steps) through plan 44's
  pipeline as if it were a page's card, so the same gate applies: no row invented or lost, no
  amount changed, no step reworded.
- The answer opens in plan 45's review screen. **Save** updates the recipe in place: id,
  photo, tags, favourite, plan entries and timers stay. **Discard** changes nothing.
- A step's hand-made links (`ingredients_set` true) are kept as they are; only unlinked steps
  get the model's links.
- One recipe per tap. No batch run: every tidy is looked at by a person.

## Build

- `services/ai-import.ts`: `tidyRecipe(connections, recipe, context)`.
- `routes/(app)/cooking/recipes/[id]/+page.server.ts`: the action; the review route takes a
  recipe id as its source and saves through `updateRecipe`.
- `RecipeMenuSheet.svelte`, catalog (en, de), SPEC, DECISIONS.

## Tests

- Integration: tidy against the fake provider keeps id, image, tags, favourite; a hostile
  answer that drops a row is caught by the gate.
- e2e: tidy the seeded "Hackfleisch, gemischtes" recipe; the name becomes "Hackfleisch", the
  note "gemischt"; its plan entry still opens it.

## Acceptance

- [ ] A recipe imported before the rebuild can be tidied in two taps (menu, Save) when the
      review is clean.
- [ ] Nothing changes unless Save is tapped.
- [ ] `npm run verify` clean.
