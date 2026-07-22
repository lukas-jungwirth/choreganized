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

- [ ] Recipe CRUD round-trip incl. photo (resized file on disk, served authed, 404 for other
      households), duplicate, delete (meal keeps title snapshot).
- [ ] Ingredient parser: "400 g pasta" → 400/g/pasta; "2 eggs" → 2/–/eggs; "salt" → name-only;
      formats back compactly.
- [ ] Plan a recipe on Thursday w/ toggle on → meal row shows, ingredients appear on shopping
      list deduped; plan a custom meal ("Pizza night") w/ cook → renders w/o recipe link.
- [ ] One meal per day: planning over an existing day replaces after the prefilled sheet;
      Remove meal works.
- [ ] Week strip + rows match [04] at 390px; empty library shows [7e].
- [ ] Home dinner card correct for: recipe w/ photo, custom meal, nothing planned.
- [ ] `npm run check` && `npm run build` clean.

Out of scope: cook mode + timers (08).
