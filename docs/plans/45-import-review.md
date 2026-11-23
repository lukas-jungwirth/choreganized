# 45 · Import review: the recipe as it will look, with what to check

**Status: todo. The sketch has to be agreed first.** Asked for by Lukas on 2026-11-23
(DECISIONS #311, #314). Depends on: 43, 44. SPEC: §4.7 gains the review screen. Design:
`design/sketches/recipe-rebuild.html`, frames R1–R4. No frame in `Hearth.dc.html`.

**Goal:** Lukas: "I send a recipe to the app. Ideally, most part is done automatically and
perfectly aligned, but if it's not possible reliably, there should be an easy-to-follow flow to
finalize the recipe." Today every import lands in the full editor form, a long page of fields
in which the two things worth looking at are not marked. This plan puts a review screen
between the import and the save.

## What it does

1. **An import opens as the recipe will look**: photo, name, servings and time, the ingredient
   list under its part headings with notes, the steps with their linked words underlined. Not a
   form.
2. **Save is at the top and always works.** A clean import is one tap.
3. **What the gate could not vouch for is marked on the thing itself** (plan 44's check
   items), counted at the top ("3 things to check"), and each one is settled where it stands:

   | Item             | Shown as                               | One tap                         |
   | ---------------- | -------------------------------------- | ------------------------------- |
   | `choice`         | "Hackfleisch **oder** veganes Hack"    | pick one; the other → note      |
   | `amount-differs` | the row, "the page says 500 g"         | keep the page's · use the other |
   | `name-differs`   | the row with the page's line under it  | keep · edit                     |
   | `line-added`     | "Also on the page: …"                  | keep · remove                   |
   | `reworded`       | the step, the page's sentence under it | use the page's text             |
   | `servings`       | "For how many people?" with a stepper  | set it                          |
   | `no-steps`       | "This page has no method"              | add steps (opens the editor)    |

   Quiet items (`info`) sit folded at the bottom: converted amounts, ingredients no step uses,
   and **"Left out"**, the page's sentences the import dropped, each with "Put back".

4. **Tapping anything else edits that one thing** in a sheet: an ingredient (amount, unit or
   counting word, name, note, part), a step's text, a step's links (tap a word, plan 46's
   sheet). The whole editor is one tap away ("Edit everything") and keeps the draft.
5. **Nothing is stored before Save**, as today, except the temp photo.
6. A draft **survives a reload and the app going to the background** (a shared link, then a
   message arrives): it is kept in `sessionStorage` under the import's id, and dropped on Save
   or Discard.

## Build

- `routes/(app)/cooking/recipes/import/review` (or a state of the import route; decide while
  building, the URL must survive a reload).
- `lib/components/cooking/review/*`: the check banner, a check row per kind, the left-out
  list. Reuse the recipe view's ingredient and step components from plan 43, so the review and
  the saved recipe cannot drift apart.
- The item sheets are plan 46's (`IngredientSheet` rebuilt, the step link sheet). If 46 has not
  landed, this plan builds those two sheets and 46 adopts them.
- Catalog (en, de): every item's line and its two buttons. No em dashes in copy.
- SPEC §4.7, DECISIONS.

## Tests

- Unit: applying each kind of resolution to a draft (pure functions in `utils/recipe-review.ts`).
- e2e: import a fixture through the fake provider with a `choice` and an `amount-differs`;
  settle both; Save; the recipe has the chosen name and the page's amount. A second run: Save
  straight away with items open; the defaults are stored. Reload mid-review keeps the draft.
- Visual: the review screen clean, with items, and the left-out list open; German at 200 %.

## Acceptance

- [ ] Sharing a link from the browser ends on the review screen; a clean one saves in one tap.
- [ ] Every row of the table above can be reached with a fixture and settled in one tap.
- [ ] "Put back" restores a dropped sentence as a step at its place in the page's order.
- [ ] The saved recipe looks like the review did.
- [ ] `npm run verify` and `npm run test:visual` clean.
