# 28 · Import: AI repairs bad cards, text import without AI, smaller photo uploads

**Status: todo.** Depends on: 22 (and the audit fixes in PRs #44 and #45, DECISIONS #158–#159).

**Goal:** close the three gaps the recipe-import audit (2026-10-25) left open. Without AI, every
way into a recipe should work: pasted text and a page with no recipe card included. With AI, a
broken card should be **fixed**, not copied row for row. And a photo import should never fail
because the phone's pictures are big.

The three parts don't depend on each other. Ship each as its own PR, in any order. **C** is the
smallest; **B** is the biggest win for a household without AI.

## A · AI repairs a bad recipe card

**Why.** "Improve with AI" sends the card as JSON and must return **the same number of rows**
(the fidelity rule, `utils/recipe-draft.ts` → DECISIONS #148). That rule stops the model from
inventing rows. It also stops it from fixing anything structural:

- merging an ingredient a site split in two;
- dropping a section title the readers missed;
- splitting one giant step into several;
- filling in a method the card left out.

PR #45 now fixes the common cases without AI. The rule still forbids the model from fixing the
rest. And the model never sees the page, only the card, so a card with no steps stays a card
with no steps.

**Build**

- **Thin card → extract mode.** A card with no steps, no ingredients, or a single step longer
  than ~600 characters (an HTML method that didn't split) is "thin". A thin card goes to the
  model in **extract** mode with the page's readable text _and_ the card JSON as a hint ("the
  site's own card, which may be incomplete"), not in improve mode. The draft notice says so.
- **Improve mode keeps its guarantee by provenance, not by count.**
  - Add `from: integer[]` to each ingredient and step in `RECIPE_DRAFT_SCHEMA`: the indexes of
    the card rows this output row came from.
  - The gate checks that every card row is used by at least one output row, unless the model
    marks it as a heading. A new `dropped: [{ index, reason: 'heading' | 'duplicate' }]` list
    carries those.
  - It also checks that no output row comes from nowhere (an empty `from`), and that a split
    step's parts each appear in the source step's text, compared loosely after normalising.
  - Merges (two rows → one) and splits (one row → several) then pass, and invented rows still
    fail.
  - With household instructions the rows may change freely, as today.
- **Prompt.** The improve paragraph changes from "the same number, in the same order" to
  "repair the structure: merge pieces of one ingredient, drop section titles, split a step that
  holds several instructions; say where each row came from".
- **Docs.** DECISIONS records the change to #148. SPEC §4.7 changes "the card's rows stay the
  card's".

**Tests**

- Gate unit tests for provenance: a merge passes; a split passes; an invented row fails; a
  dropped row without a reason fails; a heading drop passes.
- Integration tests with the fake adapter: a thin card goes to extract mode with the page text
  in the prompt.
- An e2e journey with the fake provider: smittenkitchen-style page, AI on → draft with steps.

**Open question (decide when building):** whether a draft from thin-card extraction should keep
the card's name, servings and time over the model's (recommended: yes, as improve does today).

## B · Text import without AI

**Why.** Text mode (`?mode=text`) is AI-only: without a provider it shows the setup hint and
nothing else. A page with no recipe card is a dead end without AI too. Yet pasted recipe text is
very regular: a title, an ingredient list under "Zutaten / Ingredients", a method under
"Zubereitung / Instructions". This matters most for the sites that refuse the server (402/403:
Allrecipes, Serious Eats, Budget Bytes; see the `refused` message from PR #45). There, copy and
paste is the only way in.

**Build**

- **A pure reader: `utils/recipe-text.ts` → `parseRecipeText(text): RecipeJsonLd | null`.**
  - Name: the first short non-empty line that isn't a heading.
  - Sections by heading, in German and English. Ingredients: Zutaten, Ingredients, Für …, Was
    du brauchst. Method: Zubereitung, Anleitung, So geht's, Instructions, Directions, Method,
    Steps. A sub-heading ("Für den Teig:") inside a section is skipped.
  - Without headings: a line that starts with an amount (`parseIngredient` finds a quantity) is
    an ingredient; a numbered line or a sentence is a step.
  - Servings ("für 4 Personen", "Serves 4", "4 Portionen") and time ("Zubereitungszeit: 30
    Min.", "Total time 1 hr 10 mins") read from lines anywhere.
  - Bullets, checkboxes ("▢") and numbering stripped. The result goes through the existing
    `tidyIngredientLines` / `tidySteps`.
  - It returns null when it finds neither ingredients nor steps.
- **Text mode without AI.** The textarea is always shown. Without AI, "Read recipe" runs
  `parseRecipeText` and opens the editor with a notice ("Read from your text — check it over").
  With AI, the button runs the model as today, and if the model fails the text reader's draft
  opens instead, with the reason, the way an improve falls back to the card.
- **A page with no card, AI off.** Run the same reader over the page's readable lines
  (`readableParts` already keeps headings and list items on their own lines). A draft with both
  ingredients and steps opens with the notice. Otherwise the screen says "no recipe" as now.
- **Copy** in `en.ts` / `de.ts`: the notice, and the text-mode lead without AI.
- **Docs.** SPEC §4.3 (chooser: text mode no longer AI-only) and §4.7; DECISIONS.

**Tests**

- Unit tests with real pasted text saved as fixtures (`src/lib/utils/fixtures/text-*.txt`): a
  chefkoch print view, gutekueche, an English WP Recipe Maker blog (the "▢ 1 cup" checkboxes), a
  recipe with no headings at all, and a recipe with sub-headings.
- A Playwright journey: text mode with AI off → editor prefilled → save.
- The link journey: a page with no card and AI off opens a draft read from its text.

## C · Shrink photos before upload

**Why.** A photo import sends 1–3 photos in one request. `BODY_SIZE_LIMIT` is 20 MB
(`Dockerfile`), the server accepts up to 15 MB per photo (`uploads.ts`), and nothing makes them
smaller in the browser. Three full-size phone photos can go over 20 MB. adapter-node then
answers 413 and the form lands on the error page, losing the instructions typed with it. (This
follows from the code; not reproduced.) Separately, the model gets the photos at 1200 px, the
size kept for display. That is tight for small cookbook print.

**Build**

- **Client-side downscale** in `MultiPhotoField` and the recipe form's photo picker.
  - Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`, draw to a canvas
    at most **2000 px** on the long edge, and encode as JPEG (q≈0.85; WebP where `toBlob`
    supports it). Swap the File in the form's `FileList` (`DataTransfer`) before submit.
  - Keep the original when the browser can't decode it (HEIC outside Safari) or when it's
    already small. The server still validates and re-encodes everything; this only saves
    bandwidth and the 413.
- **The model reads a bigger version than the one stored.** `reencodeUpload` returns two sizes
  for the AI path: ~2000 px for the model and 1200 px for the stored recipe photo
  (`IMAGE_MAX_PX`). Check the cost of the extra image tokens on Gemini, OpenAI and Anthropic;
  ~1600 px is the fallback if 2000 is too much.
- **A 413 never shows the error page.** The import page's `use:enhance` turns an `error` result
  with status 413 into the upload's own "too large" message, with the form kept.
- **Docs.** ARCHITECTURE "Deployment" (`BODY_SIZE_LIMIT` reasoning) and DECISIONS.

**Tests**

- A Playwright journey uploads three generated 4000×3000 JPEGs (made in the test with `sharp`,
  ~6 MB each). It asserts the request stays under the limit and the fake-AI import succeeds.
- A unit test for the two-size re-encode.
- The 413 path tested by uploading past the limit with downscaling disabled (a test-only flag on
  the field, or `page.route` posting raw).

## Acceptance

- [ ] **A:** a card with no steps (smittenkitchen-style, with the plugin markup removed) and AI
      on → a draft with steps, from extract mode.
- [ ] **A:** a card with one row split in two and a section title among the ingredients, AI on →
      the draft merges the row and drops the title; the gate accepts it. A model that adds an
      ingredient the card doesn't have is still refused (the card opens as written, with the
      notice).
- [ ] **B:** with AI off, pasting each text fixture opens the editor with the right name,
      ingredients and steps (spot-checked by hand in the running app for two of them).
- [ ] **B:** with AI off, a page with no recipe card but a readable "Zutaten / Zubereitung"
      layout opens a draft; a page with neither still says "no recipe".
- [ ] **B:** with AI on, text mode still uses the model; a model failure falls back to the text
      reader's draft with the reason.
- [ ] **C:** three large phone photos import without a 413, and the request is visibly smaller
      (network panel or test assertion). The stored photo is still ≤1200 px WebP.
- [ ] `npm run verify` and `npm run test:visual` clean; SPEC, DECISIONS and this table updated.

Out of scope: OCR without AI (photos still need a provider); ingredient groups in the data model
(section titles stay dropped); multi-recipe pages.
