# 14 · "Add a recipe" chooser & focused import modes

**Goal:** replace the three scattered doors to a new recipe — the New FAB, the quiet
"Import from a link" link, and the stacked import page (link field over two collapsed
AI sections) — with **one chooser** the New button opens, and make the import screen
present **one focused method at a time**. UX polish on plans 12–13; no new data or
services.

Depends on: 12 (link import), 13 (AI import). SPEC: §4.3 + §4.7. Design: reuses the
existing `BottomSheet`; no new frame.

## Build

- `lib/components/cooking/AddRecipeSheet.svelte` — a `BottomSheet` with link rows:
  **From a link** (`/cooking/recipes/import`) and **Enter by hand** (`/cooking/recipes/new`)
  always, plus **From a photo** and **Paste text** (AI, tagged, → `?mode=photo`/`?mode=text`)
  **only when `aiEnabled`** — with no key there's nothing to offer, so they're hidden rather
  than shown as dead ends. Real `<a>`s, so it works without JS and closes by navigating.
- **Settings key sheet** (`AiImportSheet.svelte`) gains a **Test connection** button when a key
  is stored: `?/testAiKey` → `testGeminiKey` runs a tiny generation on the real model and reports
  "Connection works" or a typed reason (key refused / service busy / unreachable). The result is
  handled in the sheet, so it doesn't disturb the key field.
- **Library** (`/cooking/recipes`): the FAB and the empty-state button open the chooser
  (`onclick`, not `href`); the standalone "Import from a link" links are gone. Load adds
  `aiEnabled: getAiImportStatus(householdId).set`.
- **Import** (`/cooking/recipes/import`): load reads `?mode` (`link` default | `photo` |
  `text`); the page renders exactly one focused method — no more collapsed `<details>`.
  Link mode keeps the no-JSON-LD → **Try AI extraction** escalation, now with quiet links
  across to the photo/text modes. Photo/text modes with no key show a "Set up AI import"
  card → Settings. The five actions (`fetch`/`extractPage`/`extractText`/`extractPhotos`/
  `save`) are unchanged.
- **Photo picker** (`MultiPhotoField.svelte`): the plain browser file input becomes a grid
  of thumbnail tiles beside a dashed "add" tile with a camera lens (matching the editor's
  photo well [3c]), each thumbnail removable. A real `<input multiple>` lives inside the add
  tile (a `<label>`), so no-JS still posts; with JS each pick is capped, previewed, and
  written back into that input via a `DataTransfer`, so the native form post sends exactly
  the tiles shown. The submit gates on the count.
- i18n: `cooking.add.*` (en+de); drop the now-unused `cooking.import.entry`/`entryEmpty`;
  add `cooking.import.ai.setupCopy`/`setupCta`.
- Docs: SPEC §4.3/§4.7, DECISIONS #114, README status row.

## Acceptance

- [x] New FAB and empty-state button open the chooser; the four rows route correctly.
- [x] No key: the AI rows read "Set up AI import first" and go to Settings. With a key:
      they open the focused photo/text modes.
- [x] Each mode is a single focused screen; link mode keeps the Try-AI escalation and the
      cross-links to photo/text.
- [x] `npm run check` && `npm run build` clean.

## What was verified (session 2026-07-25)

`npm run check` (0/0) and `npm run build` clean. Walked the running app (seeded household,
German locale): the chooser renders the four rows with KI tags; with **no key** the AI rows
show "Zuerst KI-Import einrichten" and link to `/settings`; with a dummy key set they route
to `?mode=photo`/`?mode=text`. Each focused mode (photo picker, paste textarea, link field)
renders on its own clean screen, and a link fetch of a no-recipe page (`example.com`) shows
the "Mit KI auslesen" escalation with cross-links to the photo and text modes. Dummy key
removed afterwards. A _successful_ extraction still needs a real Gemini key (→ plan 13).

**Follow-up (2026-07-26):** hide the AI options entirely when no key is set (instead of the
"set up first" rows), and a **Test connection** button in the key sheet. `npm run check` (0/0)
and `npm run build` clean. The live UI walk wasn't possible this session — the dev login had
lapsed and re-auth needs the owner's Google sign-in — but both are thin glue over pieces
already exercised live: the chooser's `aiEnabled` gate, and the Gemini bad-key mapping that
`testGeminiKey` reuses (`generateContent` → `mapSdkError`, confirmed earlier via a real 400).
The success path ("Connection works") needs a valid key to see.
