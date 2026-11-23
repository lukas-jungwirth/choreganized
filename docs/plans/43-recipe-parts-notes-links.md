# 43 · Recipes with parts, clean ingredients and stored links

**Status: done (2026-11-23, v0.8.0, DECISIONS #320).** Agreed with Lukas on 2026-11-23 (DECISIONS #312–#315). Depends on: 42.
Closes issue #176. SPEC: §4.4, §4.5, §4.6, §4.8. Design: `design/sketches/recipe-rebuild.html`
(the recipe view frames).

**Goal:** the model a recipe is stored in cannot say three things the kitchen needs, so every
screen guesses them:

1. **What you buy vs. what you do with it.** "1 Karotte, in Scheiben geschnitten" is one
   name, so the shopping list gets "Karotte, in Scheiben geschnitten" (25 of 31 imported pages
   had such a line, probe of 2026-11-23).
2. **Which part of the dish a row belongs to.** A lasagne's Bolognese and Béchamel arrive as
   one flat list with two "Salz und Pfeffer" and three "Butter" (25 of 36 pages show sections;
   none survives the import). Issue #176 asks for sub-headings.
3. **Which words of a step name which ingredient.** Cook mode works it out again on every
   render with a word matcher, which cannot know that "Zwiebelwürfel" is the onion (26 of 29
   pages had such a word; on a Chefkoch lasagne 5 of 19 ingredients are never linked).

This plan changes the model and the two read-only screens. The editor (plan 46) and the import
(plan 44) write into it.

## The model

### Ingredient: amount · unit · name · note

- `name` is **what you buy**: "Karotte", "Faschiertes", "Kokosmilch".
- `note` (new, nullable, ≤ 120 characters) is everything else the line said: "in Scheiben
  geschnitten", "gemischt", "zum Würzen", "ein Teil kann durch Gemüsebrühe ersetzt werden",
  "oder veganes Hack", "z. B. Paprika, Zucchini", "für die Form", "optional".
- The shopping list, the cupboard (`services/pantry`), the diet guess and the tag pre-fill read
  `name` only. The recipe view and cook mode show the note in a smaller line under the name.
- One site line that names two things ("Salz und Pfeffer zum Würzen") is two rows, each with
  the note (the import does this, plan 44; a typed line is not split).
- An either/or ("Hackfleisch oder veganes Hack") is the first one named, with the other in the
  note (DECISIONS #314). The review screen offers the choice (plan 45).

### Parts

- `recipe_ingredients.section` and `recipe_steps.section` (new, nullable, ≤ 40 characters):
  the part's name as written, "Bolognese", "Béchamel", "Panade". Consecutive rows with the
  same value form one part. No table of their own: a part has no data besides its name and its
  place, and the two lists may name parts differently (sites do: "Ragu Bolognese:" over the
  ingredients, "Ragu:" over the steps).
- One recipe, not two (DECISIONS #312): servings scale every part together, the plan holds
  one dish, the shopping picker lists every part.
- Rows with no section come first and have no heading.

### Links: a step knows its ingredients and the words that name them

`recipe_step_ingredients` gains:

- `phrase` (nullable): the words in the step text that name the ingredient, exactly as they
  stand there: "Zwiebelwürfel", "Nudelplatten", "Möhren". Cook mode underlines every whole-word
  occurrence of the phrase in that step. Null: the step uses the ingredient without naming it
  ("restliche Zutaten unterheben"); it is listed under the step and nothing is underlined.
- `amount_phrase` (nullable): the amount the step text gives it, exactly as it stands there:
  "1 - 2 EL", "200 g", "2". Cooking for a different number rewrites this run and nothing else.
  It replaces the "number directly before an underlined word" guess of plan 23.
- The unique index on (step, ingredient) goes: a step may name one ingredient by two phrases
  ("Karotte schälen … die Schale zu den Möhren reiben"). Unique on (step, ingredient, phrase).
- `quantity` (the step's share) stays.

`recipe_steps.ingredients_set` stays and means what it meant: **true** = the stored links are
the answer, even when there are none. **False** = nobody has linked this step yet; the screens
fall back to the word matcher (`step-highlight.ts`) exactly as today. Every import and every
save from the new editor writes true. Existing recipes are not migrated: they read as before
until they are edited or tidied (plan 48).

### Units on the way to the list

A counting word (plan 42) never reaches a shopping row as a unit. A container word (Dose,
Becher, Glas, Flasche, Beutel) becomes `pack` with its number ("1 Dose Mais" → Mais · 1 Pkg.).
Every other counting word, and tbsp and tsp, put the name on the list with no amount
(DECISIONS #313).

## Screens

- **Recipe view [7a]**: ingredients grouped under part headings; the note under the name;
  steps grouped under their part headings, numbered straight through. Linked words underlined
  as in cook mode, scaled amounts marked as today.
- **Cook mode [7b]**: the step's part as a second eyebrow ("STEP 5 OF 10 · BÉCHAMEL"). The
  underlines and the scaled amounts come from the stored phrases when `ingredients_set` is
  true. The peek sheet groups by part. The larger layout is plan 47.
- **Ingredient picker [3e]**: one row per name. Rows with the same name in two parts are one
  row with the amounts added where the units agree (the merge rules of `planAdds`), and the
  parts named in the quiet line ("Bolognese · Béchamel").
- **Editor [3c]**: must not lose the new fields before plan 46 rebuilds it. Each ingredient row
  posts its note and section as hidden fields and each step its section and links; a line that
  is retyped keeps its note unless the name changed. No new controls here.
- **Share text and duplicate**: carry parts and notes.

## Build

- `schema.ts` + `npm run db:generate`: the columns above, the index change. DATA-MODEL.md.
- `services/recipes.ts`: read and write the fields; `RecipeIngredientRow.note/section`,
  `RecipeStepRow.section`, links with `phrase` / `amountPhrase`; clamps for each.
- `utils/step-links.ts` (new, pure): `renderStep(step, ingredients, factor)` → segments from
  stored links (phrase occurrences, amount runs scaled with `scaleQuantity` and written back
  in the style they were typed, the existing `formatLike`). `readStep` picks this or the
  matcher by `ingredientsSet`. `CookStepText` and the recipe view take segments as today.
- `services/recipe-shopping.ts` + `planAdds` input: names only, container → pack, merge across
  parts.
- `utils/recipes.ts` `readRecipeForm`: the hidden fields, validated like everything else.
- Catalog: part eyebrow, picker's parts line. SPEC §4.4–4.6, §4.8. DECISIONS.
- Seed (`scripts/seed-data.ts`): one recipe with two parts, notes and stored links (a lasagne),
  so every screen has one to show. `--cookbook` keeps its flat ones.

## Tests

- Unit: `step-links.test.ts` (a phrase twice in one step; a phrase inside a longer word is not
  underlined; a missing phrase renders plain; amount run scaled: "1 - 2 EL" × 2 → "2 - 4 EL",
  "½" × 2 → "1", decimal comma kept; a link to a deleted ingredient is dropped).
- Integration: `recipes.test.ts` (round trip of note, section, phrase, amount phrase; two
  phrases for one ingredient in one step; household scoping unchanged),
  `recipe-shopping` (note never reaches the list; "1 Dose Mais" → pack; "2 Zehen Knoblauch" →
  name only; same name in two parts merges).
- Convention: migration drift (already a test).
- e2e: the seeded lasagne: headings in the view, part eyebrow in cook mode, cooking for 8
  rewrites the stored amount run, the picker shows one Butter row.
- Visual: `recipe`, `recipe-bottom`, `cook-mode` baselines refreshed; one new shot of the
  two-part recipe.

## Acceptance

- [x] The seeded lasagne shows "Bolognese" and "Béchamel" over its ingredients and its steps.
- [x] "Faschiertes" with note "gemischt" shows both in the recipe and only "Faschiertes" on the
      shopping list.
- [x] A step whose text says "Zwiebelwürfel" underlines it and a tap shows the onion's amount.
- [x] Cooking for twice as many turns "1 - 2 EL Olivenöl" into "2 - 4 EL Olivenöl" in the step
      and leaves "180 °C" and "5 - 7 Min." alone.
- [x] A recipe saved before this plan looks and cooks exactly as before.
- [x] Editing and saving any recipe in the old editor loses no note, part or link.
- [x] `npm run verify` and `npm run test:visual` clean.

As built: DECISIONS #320 (stored-link rendering is chosen by "the pins carry words", so steps
pinned by hand before this plan read as before; the picker groups by name across the whole
recipe; the seeded lasagne has a third part, "Schichten"). Walked by the e2e journeys in
`tests/e2e/cooking.spec.ts` against the production build with the seeded lasagne.
