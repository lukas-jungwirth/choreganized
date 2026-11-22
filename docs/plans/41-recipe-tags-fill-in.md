# 41 · Recipe tags fill themselves in

**Status: todo.** Second half of Lukas's filter request (2026-11-22). Depends on: **40** (the
tags, the form block and the filters), 13, 20, 22 (AI import), 12 (link import).
SPEC: §4.2 (plan sheet), §4.3 (library), §4.7 (import) change as described below.
Design: **`design/sketches/recipe-filters.html`**, phone 4 (the dotted suggestions), phone 6
(the sorting pass) and phone 7 (the plan sheet). The last two work.

**Goal:** nobody tags 40 recipes by hand. The link import reads the tags recipe sites already
publish, the AI import picks from the same fixed list, recipes already in the library get a
short sorting pass (with a guessed diet, and an AI pre-fill when AI is set up), and the plan
sheet puts the recipes for the chosen meal first.

## 1 · Suggestions in the form

The import preview reuses the recipe form [3c] (plan 40's Tags block). An imported draft
carries **suggested** tags and diet: they arrive ticked, with a small `--mustard` dot, under a
line "The dotted ones came from the website." ("…from the AI." for an AI import). Touching a
chip clears its dot. Saving saves what is ticked, dotted or not; the dot is never stored.
With suggestions the block opens unfolded.

## 2 · The link import (`recipe-import.ts`)

Read three more fields of the schema.org `Recipe` card (JSON-LD and Microdata alike, strings or
arrays): `recipeCategory`, `keywords` (comma-separated string or array) and `suitableForDiet`. Map them through one word list in `lib/utils/recipe-tags.ts`, English and German,
whole words, case- and accent-insensitive:

- Kind: "main course", "Hauptgericht", "Hauptspeise" → main; "soup", "Suppe", "Eintopf" →
  soup; "salad", "Salat" → salad; "side", "Beilage" → side; "dessert", "Nachspeise",
  "Nachtisch", "Süßspeise" → dessert; "baking", "Backen", "Kuchen", "Gebäck", "Brot" → baking.
- Meal: "breakfast", "Frühstück", "brunch" → breakfast; "lunch", "Mittagessen" → lunch;
  "dinner", "Abendessen" → dinner; "snack", "appetizer", "Vorspeise", "Fingerfood" → snack.
- Diet: `VeganDiet`, "vegan" → vegan; `VegetarianDiet`, "vegetarisch", "vegetarian" →
  vegetarian. Meat and fish are never read from a page (sites rarely say so; the guess
  in §4 does it better).
- Free from: `GlutenFreeDiet`, "glutenfrei", "gluten-free" → gluten; `LowLactoseDiet`,
  "laktosefrei", "lactose-free" → lactose.

No match, no tag. Both vegan and vegetarian found → vegan. `npm run import:probe` prints the
tags it would suggest, so a new site can be checked in one command.

## 3 · The AI import (`services/ai-import.ts`)

`RECIPE_DRAFT_SCHEMA` gains `tags: array(string({ enum: RECIPE_TAG_KEYS }))` and
`diet: nullable(string({ enum: RECIPE_DIETS }))`, the same way `unit` is already limited to
`RECIPE_UNITS`, so the model can only answer with known keys. The rules paragraph says: meal
and kind only when the recipe clearly is one; diet from the ingredients (meat or fish named →
that; neither → vegetarian; also no dairy, egg or honey → vegan); free-from only when the
ingredients make it certain. The link-plus-AI path (plan 22) takes the page's tags first and
the AI's only where the page said nothing. `scripts/fake-ai.ts` and the recorded fixtures
learn the two fields; every provider's strict schema mode must still accept the schema
(`schema.test.ts`).

## 4 · The sorting pass (sketch phone 6)

- **Entry:** a dashed row at the end of the library grid, "{n} recipes have no tags yet ·
  Sort", only while no filter or search is active and at least one recipe has neither a tag
  nor a diet. Gone once everything is tagged.
- **Route** `/cooking/recipes/sort` (guarded, household-scoped): one untagged recipe per card
  (photo, name, time, a short ingredient hint), the form's chip groups, **Skip** and **Next**.
  Next saves through the same service as the form and moves on; Skip leaves it untagged and
  moves on (skipped ones come back next visit, after the rest). A progress bar "3 of 9 done ·
  stop any time"; back returns to the library. The last card ends on the library.
- **Diet guess** (`lib/utils/diet-guess.ts`, pure): ingredient names against a meat word list
  and a fish word list (en + de, whole words, the same plural forgiveness as the step matcher,
  → SPEC §4.4) → meat / fish; neither → vegetarian; no dairy, egg or honey word either →
  vegan. Shown dotted as "our guess", never saved without Next.
- **AI pre-fill** (only when `isAiEnabled`): a button above the first card, "Let the AI
  suggest tags", sends the untagged recipes' names and ingredient names (no photos, no steps)
  in one call, at most 50 per call, and fills each card's chips as dotted suggestions. Nothing
  is saved until each card's Next. It is a button, never automatic: it sends recipes to the
  provider.

## 5 · The plan sheet [3d] (sketch phone 7)

- With any recipe tagged for the chosen slot, the list splits: **For {meal} · {n}** first,
  then **Everything else**. Order within each is today's. Untagged recipes count as everything
  else. Nothing is hidden: Saturday's lunch is often last night's soup. With no recipe tagged
  for that slot, the list is today's list, unlabelled.
- Switching **Which meal?** reorders live.
- The library's quick chips (Favourites · Under 30 min · Vegetarian, each only when it could
  match) sit under the search, filtered in the browser like the sheet's search is today,
  through plan 40's `matchesRecipeFilter`.

## Tests

- **Unit:** the word-list mapping (each row above, German and English, arrays and
  comma strings, accents, "vegan" beats "vegetarian", no false hit on a word inside another);
  `diet-guess` (meat, fish, vegetarian, vegan, German plurals, "Eier" blocks vegan, "Butter"
  blocks vegan).
- **Integration:** an imported fixture page with `recipeCategory: "Suppe"` and
  `suitableForDiet: VeganDiet` → draft suggestions kind:soup + vegan; AI import against the
  fake server returns tags; an unknown tag from a provider is dropped, not saved; the sort
  route only lists the household's untagged recipes; Next saves, Skip doesn't.
- **Playwright:** import from the fixture site, see dotted chips, save, find the recipe under
  Soup; run the sorting pass over three recipes; plan a breakfast and see the breakfast
  recipe first.
- **Visual:** the form with suggestions, the sorting pass card, the plan sheet split; en + de.

## Choices made in this plan (Lukas may change them)

- Suggestions are ticked, not merely offered: an import that says "vegan" usually is.
- The AI pre-fill is one button, capped at 50 recipes a call.
- The plan sheet orders, never hides.

## Acceptance

- [ ] A link import from a page with category and diet data arrives with dotted chips; one
      without arrives with none and the block folded.
- [ ] An AI import (fake provider) arrives with tags from the fixed list only.
- [ ] The sorting pass tags a library of untagged recipes card by card; the library row
      disappears when it's done; the diet guess is right for the sketch's four examples.
- [ ] Planning a breakfast lists breakfast recipes first; planning a dinner with no dinner
      tags shows today's list.
- [ ] SPEC §4.2, §4.3, §4.7 updated; DECISIONS entries for reading page tags (never meat or
      fish), the guess's rule, the AI pre-fill as an explicit button, and ordering over hiding.
- [ ] Version: next minor.
