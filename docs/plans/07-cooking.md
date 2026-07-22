# 07 · Cooking: recipes & meal plan

**Goal:** the Cooking tab minus cook mode: weekly plan, plan-a-meal sheet (incl. custom meals

- add-ingredients-to-shopping), recipe library with full CRUD, image upload, recipe view.

Depends on: 02 (03 for shopping integration). Design: [04 main] [3d] [3c] [7a] [7c] [7e].
SPEC: [§4.1–4.5](../SPEC.md#4-cooking-tab).

## Build

- `lib/utils/ingredients.ts` — lenient "400 g pasta" ⇄ {quantity, unit, name} parse/format
  (unit whitelist: g kg ml l L pcs pack tbsp tsp; fractions ½ ¼ ¾, "1/2"; fallback name-only).
- `lib/server/services/recipes.ts` — CRUD with ingredients/steps replace-in-tx, duplicate,
  list (recent + search), image attach; `services/meals.ts` — week view query (Mon–Sun of
  current week), upsert meal for date (recipe or custom title, cook optional), remove;
  `addIngredientsToShopping(householdId, recipeId)` → shopping service dedupe-add (case-
  insensitive name match against unchecked items; matched → skip).
- Image upload: form file input → resize to ≤1200px WebP via `sharp` (add dep, note version
  in DECISIONS), save under `UPLOADS_DIR/recipes/{id}.webp`; serve via
  `api/uploads/[...path]/+server.ts` with `requireMember` + path check (household's recipes
  only). Placeholder art component for missing images (striped pattern per design).
- `/cooking` [04]: "This week" + month, day strip (today sage), meal rows (today highlighted
  "Tonight · {member}"), Add-a-meal placeholders → `MealPlanSheet` [3d]; Recipe library
  section (2 recent cards + "Browse all · n").
- `MealPlanSheet` [3d]: recipe search+recents with radio, "Cook something not saved" free
  text, cook member chips (optional), "Add ingredients to shopping list" toggle (visible only
  with recipe selected, default on), CTA "Add to {weekday}"; prefilled + **Remove meal** when
  the day already has one.
- `/cooking/recipes` (browse all: grid, search, new button; empty [7e]),
  `/cooking/recipes/new` + `/[id]/edit` [3c] (full-screen form: photo, name, time, servings,
  ingredient rows freeform w/ reorder+remove, step rows w/ reorder+remove),
  `/cooking/recipes/[id]` [7a] (hero, meta, Add to plan → day picker → MealPlanSheet, basket
  shortcut + "Add all to list", ingredients, steps, **Start cook mode** button → route stub
  until 08, ••• sheet [7c]: edit/duplicate/share (Web Share text)/delete confirm).
- Home integration: tonight's-dinner card now live (02 wrote the query — verify photo/cook
  states, "Add tonight's dinner" empty state links here).

## Acceptance

- [x] Recipe CRUD round-trip incl. photo (resized file on disk, served authed, 404 for other
      households), duplicate, delete (meal keeps title snapshot).
- [x] Ingredient parser: "400 g pasta" → 400/g/pasta; "2 eggs" → 2/–/eggs; "salt" → name-only;
      formats back compactly.
- [x] Plan a recipe on Thursday w/ toggle on → meal row shows, ingredients appear on shopping
      list deduped; plan a custom meal ("Pizza night") w/ cook → renders w/o recipe link.
- [x] One meal per day: planning over an existing day replaces after the prefilled sheet;
      Remove meal works.
- [x] Week strip + rows match [04] at 390px; empty library shows [7e].
- [x] Home dinner card correct for: recipe w/ photo, custom meal, nothing planned.
- [x] `npm run check` && `npm run build` clean.

Out of scope: cook mode + timers (08).

## Session notes (2026-07-22)

Everything above was walked through in the dev server at 390px against the seeded household.
Worth knowing before you build on it:

- **Photos**: `sharp@0.35.3` is the one new dependency (→ [DECISIONS #62–64](../DECISIONS.md)).
  `lib/server/uploads.ts` validates and re-encodes _before_ anything is inserted, and
  `/api/uploads/[...path]` authorises by looking the path up as a recipe's `imagePath` in the
  caller's household. Measured: 2000×1400 JPEG → 1200×840 WebP / 8 KB; 1600² PNG → 1200² /
  7.5 KB. Cross-household read → 404, no session → /login.
- **A real bug the walkthrough caught** (→ [#65](../DECISIONS.md)): Drizzle leaves column names
  unqualified in a statement without a join, so an `exists (…)` subquery written next to a
  plain `select` compared the inner table with itself. Read the generated SQL when mixing
  `sql` with column references.
- **What the code review caught after that**, all fixed here: adapter-node's 512K
  `BODY_SIZE_LIMIT` would have rejected every real photo _in production only_ (→ [#72]) — the
  headline reason a dev-server walkthrough isn't enough; the unit-alias table answered
  `constructor` with a function, so "2 constructor tomatoes" crashed the insert and orphaned
  the photo it had already written; planning a recipe a housemate had just deleted planned
  nothing and reported success (→ [#73]); searching the plan sheet while a recipe was selected
  hid one match, so a one-hit search showed none; `0 kg flour` kept a unit the edit screen then
  deleted on the next save; and the search field's × cleared the box without re-running the
  search. Ingredient lines are now length-capped server-side and blanks are dropped before the
  60-row cap rather than after it.
- **Deviations from the design**, all logged: a ••• on planned meal rows (#66), arrow reorder
  instead of drag (#67), our pill `Toggle` for the shopping switch (#68), "Copy recipe" where
  Web Share is missing (#70), `chef-hat` rather than the mockup's music note on "Start cook
  mode" (#71).
- **For plan 08**: `/cooking/recipes/[id]/cook` exists with the guard, the recipe lookup and
  the dark surface; replace the placeholder screen. `--cook-surface` is the new token for the
  10% white those screens fill chips with. Ingredient names come back through
  `formatAmount`/`formatIngredient` in `$lib/utils/ingredients`, which is what the "this step
  uses…" line and the ingredients peek want.
- **New shared kit**: `ui/SearchField`, `RowGroup surface="sunken"` — both on `/dev/kit`.
