# 40 · Recipe tags and library filters

**Status: todo.** Asked for by Lukas on 2026-11-22: "right now there is only the list with a
search but no filter at all … type of meal, diet types". Depends on: 07, 12, 14 (all done).
Followed by plan 41 (the tags fill themselves in). SPEC: §4.3 (library), §4.4 (form), §4.5
(recipe view) change as described below; DATA-MODEL gains the new table and columns.
Design: **`design/sketches/recipe-filters.html`**, phones 1–5. Open it in a browser. The
library, the filter sheet and the no-match screen work and share one sample library of 14
recipes; use it as the seed for the tests.

**Goal:** the library [04] is a grid and a name search. A recipe gets a few **fixed tags**
(meal, kind, diet, free from) and a **heart**, and the library filters and sorts by them and by
the time recipes already have. A household that never tags sees almost nothing new: a filter
group only appears once at least one recipe uses it.

## The vocabulary

A fixed list, app words like the meal slots (translated; household content stays as typed).
Keys live in a new `lib/utils/recipe-tags.ts`; names live in the catalog under
`cooking.tags`.

| Group     | Keys                                                                   | Per recipe       | Filter reads it as                    |
| --------- | ---------------------------------------------------------------------- | ---------------- | ------------------------------------- |
| Meal      | `breakfast` `lunch` `dinner` `snack` (the plan's `MEAL_SLOTS`, reused) | any number       | any of the chosen                     |
| Kind      | `main` `soup` `salad` `side` `dessert` `baking`                        | any number       | any of the chosen                     |
| Diet      | `meat` `fish` `vegetarian` `vegan`                                     | one, or none yet | any of the chosen; vegetarian ⊇ vegan |
| Free from | `gluten` `lactose`                                                     | any number       | all of the chosen                     |

Across groups the filters narrow (dinner **and** vegetarian). Plus, from data that exists:

- **Ready in:** at most 20 · 30 · 45 · 60 minutes, from `recipes.time_minutes`. A recipe with
  no time drops out once a cap is set.
- **Only favourites:** the heart.
- **Sort:** Newest (today's order) · A–Z · Quickest (no time last) · **Not cooked lately**.

Suggested German: Hauptspeise · Suppe · Salat · Beilage · Nachspeise · Backen; Fleisch ·
Fisch · Vegetarisch · Vegan; Glutenfrei · Laktosefrei; Nur Favoriten; Fertig in; Neueste ·
A–Z · Schnellste · Länger nicht gekocht. Meal names are the existing `cooking.slots`
(Frühstück · Mittagessen · Abendessen · Snack). No em dashes in copy (→ DECISIONS #205).

## The model

`npm run db:generate`, then DATA-MODEL:

- **`recipe_tags`** (`recipe_id` → recipes, cascade; `tag` text, e.g. `meal:dinner`,
  `kind:soup`, `free:gluten`), unique on the pair, indexed by recipe. The service refuses a key
  not in `recipe-tags.ts`.
- **`recipes.diet`** text enum (`meat` `fish` `vegetarian` `vegan`), NULL = not set. A column,
  not a tag: it is one value, and the ladder (vegetarian ⊇ vegan) is a rule on that value.
- **`recipes.favourite`** boolean, default false. **One heart per household** (see Choices).

The recipe form writes tags the way it writes ingredients: replaced wholesale on save
(`services/recipes.ts`), inside the same transaction. The household scoping rule holds:
every new query filters by `householdId`.

## The library [04] (sketch phones 1–3)

1. **One pure filter.** `lib/utils/recipe-filter.ts`: `parseRecipeFilter(URLSearchParams)`
   (unknown keys and values ignored, never an error), `toSearchParams(filter)`,
   `matchesRecipeFilter(summary, filter)` and `sortRecipes(list, sort)`. The server load and
   the sheet's live count both call it, so the count on the button and the grid can't disagree.
2. **The load** (`cooking/recipes/+page.server.ts`): `listRecipes(householdId, { search })`
   now returns each summary with `tags`, `diet`, `favourite` and `lastPlanned`, and the search
   matches the recipe name **or** an ingredient name (same lenient key the shopping list uses).
   The load returns that searched set as the sheet's **index**, plus the filtered and sorted
   `recipes` for the grid. Libraries are tens to a few hundred recipes; the index is a few KB.
3. **The URL is the state**, like `?q=` today: `q`, `meal`, `kind`, `diet`, `free` (each
   repeatable), `max`, `fav=1`, `sort`. The search form gains the active filters as hidden
   inputs so typing keeps them. Chips are links to the next URL, so the library works without
   JavaScript; with it, the same `replaceState`/`keepfocus`/`noscroll` navigation as the search.
4. **The chip row** under the search: **Filter** (with a count of active filters), then each
   active filter as a filled chip with ×, then up to three **quick chips**: Favourites ·
   Under 30 min · Vegetarian. A quick chip only shows when it could match something
   (no heart anywhere → no Favourites chip; no diet set anywhere → no Vegetarian chip).
5. **The result line** under the row: "{n} of {total} recipes" and **Clear** when anything is
   active, the sort's name when it isn't Newest.
6. **The filter sheet** (`BottomSheet`): Only favourites (Toggle), Meal, Kind, Diet, Free from
   (`Chip` rows), Ready in (`SegmentedControl`: Any · 20 · 30 · 45 · 60), Sort by (chips).
   **A group with no recipe using it is not shown** (Ready in needs one recipe with a time;
   Favourites one heart). The sheet edits a draft; the button counts it live ("Show 6
   recipes", disabled "Nothing fits" at 0) and navigates on tap; **Clear all** resets the
   draft but keeps the search.
7. **Nothing fits** (phone 3): "Nothing fits all of these" and, per active filter, a row
   "Without {filter} · {n} recipes" that drops it; rows that would still find nothing are left
   out. A search with no filters keeps today's "Nothing matches …" line, now saying recipe or
   ingredient.
8. **Cards** gain two small marks on the photo: a filled heart for a favourite, a leaf for
   vegetarian and vegan. Nothing else on the card changes.
9. **"Not cooked lately"** reads the meal plan: `max(meals.date)` per recipe over days up to
   and including today (future plans don't count), a left join, never-planned first, then
   oldest. Meals are never pruned, so the history is whole from the day a household started
   planning. It means _planned_, which is close enough; say so in SPEC.

## The recipe form [3c] (sketch phone 4)

A **Tags** block between servings and ingredients, in a card: Meal, Kind (multi-select
chips), Diet (one chip or none; tapping the chosen one clears it), Free from (multi).

- **Folded while empty** (Lukas, 2026-11-22): a recipe entered by hand with no tags shows one
  row, "Tags · meal, kind, diet", that unfolds on tap. Any tag set → it opens unfolded, so an
  edit always shows what's there.
- The import preview reuses this form, so plan 41's suggestions land here; this plan only
  builds the block and the save.

## The recipe view [7a] (sketch phone 5)

- A **heart** in the photo's top bar beside the menu, a `use:enhance` form action
  (`?/favourite`) on the recipe route. Filled = favourite.
- The set tags under the time and servings, as small sunken pills (diet with a leaf). Each
  one is a **link** to the library filtered by it (`/cooking/recipes?kind=soup`). No tags, no
  row.

## Seed

`npm run db:seed` tags its demo recipes and hearts one or two, so a fresh dev database shows
every group. The e2e/visual fixtures get the sketch's 14 recipes (names, times, tags, hearts)
and a few past meals for "Not cooked lately".

## Choices made in this plan (Lukas may change them)

- Fixed list only; no household-made tags. Cuisine left out to keep the sheet short.
- One heart per household, not per member.
- Quick chips: Favourites · Under 30 min · Vegetarian.
- "Not cooked lately" counts planned days, not cook-mode opens.

## Tests

- **Unit** (`recipe-filter.test.ts`): parse ignores junk and repeats; any-of within a group,
  all-of for Free from, vegetarian includes vegan, no time drops out under a cap, each sort
  (ties by name, no time last, never-planned first), round trip parse ↔ params.
- **Integration** (`recipes` service): tags saved and replaced with the recipe, unknown key
  refused, cascade on delete, other household's tags never returned, search by ingredient,
  `lastPlanned` ignores future days and other households.
- **Convention:** nothing new to allow-list; the new action sits behind `requireMember`.
- **Playwright** (`cooking.spec.ts`): tap Vegetarian, see the count; open the sheet, pick
  Dinner, see "Show n", apply; reload keeps it; the no-match escape drops a filter; heart a
  recipe on its page and find it under Favourites; tap a tag on the recipe view and land
  filtered; set tags in the form and see them after save.
- **Visual**: library with filters active, the sheet, nothing fits, the form's Tags block
  (folded and open), the recipe view with tags; en + de at 200% text size. Refresh baselines
  on purpose.

## Acceptance

- [ ] Phones 1–5 of the sketch, built with the kit (`Chip`, `BottomSheet`, `Toggle`,
      `SegmentedControl`, `SearchField`), tokens only, `--fs-N` type.
- [ ] A household with no tags sees the chip row with just **Filter** and what its data allows
      (Under 30 min), and a sheet without the Meal / Kind / Diet / Free from groups.
- [ ] Every filter and the sort live in the URL; reload, back and a shared link reproduce the
      grid; it works with JavaScript off (Enter submits, chips are links).
- [ ] The sheet's count always equals the grid it navigates to.
- [ ] Searching "lemon" finds a recipe whose ingredients name a lemon.
- [ ] SPEC §4.3–§4.5 and DATA-MODEL updated; DECISIONS entries for the fixed vocabulary, diet
      as one column with the ladder, groups that appear once used, the folded block, one heart
      per household, and "not cooked lately" from the plan.
- [ ] Version: next minor.
