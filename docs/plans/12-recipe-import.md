# 12 · Recipe import from a link

**Goal:** paste (or share) a recipe URL and land in the recipe editor with everything
prefilled — name, photo, time, servings, ingredients, steps — ready to check and save.
No AI involved: nearly every recipe site embeds a Schema.org `Recipe` as JSON-LD for
Google rich results (Chefkoch, gutekueche.at, Kitchen Stories, WordPress recipe plugins…),
and that one universal format maps almost 1:1 onto our tables.

Depends on: 07 (recipe editor + uploads), 11 (manifest, for the share target).
SPEC: add **§4.7 Recipe import** (write it as part of this plan — the behavior below is
the spec). Design: no new frame — reuse the [3c] editor as the preview; the import screen
itself is a simple SubHeader + TextField + Button + Banner composition from the existing kit.

## Build

- `lib/server/services/recipe-import.ts` — `fetchRecipePage(url)` + `parseRecipeJsonLd(html)`,
  composed by the action. Fetching rules:
  - `http(s)` only; resolve the hostname and **reject loopback/private/link-local ranges**
    (SSRF guard — the server fetches user-supplied URLs; check each redirect hop too, cap
    redirects at ~5). DNS-rebinding-grade defenses are out of scope for a two-person
    household app — log the judgment call in DECISIONS.
  - Browser-like `User-Agent` + `Accept: text/html`, ~10 s timeout, ~3 MB response cap,
    `text/html` content type only. Any failure → typed error the UI can translate
    (`unreachable` / `blocked` / `not-html` / `too-large`).
  - JSON-LD extraction needs **no new dependency**: pull `<script type="application/ld+json">`
    bodies (script content can't contain `</script>`, so a lenient regex is safe here),
    `JSON.parse` each, then walk: top-level object or array, `@graph` wrapper, `@type`
    as string or array, `Recipe` (accept subtypes). First match wins.
  - Field mapping → a `RecipeDraft` (plain object, not yet persisted):
    - `name` → name (trim, cap at the editor's existing limit).
    - `totalTime` (else `prepTime` + `cookTime`) — ISO-8601 duration `PT1H30M` → minutes.
    - `recipeYield` — number, or leading integer of a string ("4 Portionen" → 4).
    - `recipeIngredient[]` — keep as **raw lines**; the editor already parses lines via
      `lib/utils/ingredients.ts`, so the draft stays in the same shape the user types.
      Decode HTML entities, collapse whitespace, drop blanks, respect the existing
      60-row/length caps _before_ insert (plan 07 learned this the hard way).
    - `recipeInstructions` — strings, `HowToStep.text`, or `HowToSection.itemListElement`
      flattened in order → step texts (entities decoded, tags stripped).
    - `image` — string, array (take first), or `ImageObject.url`.
- **Photo import**: download the image URL server-side (same URL guards, ~10 MB cap) and
  push it through the existing `lib/server/uploads.ts` sharp → WebP pipeline. Image
  failure is **non-fatal** — the draft just has no photo (placeholder art as usual).
- `/cooking/recipes/import` route (`(app)`, `requireMember`):
  - URL field + "Fetch recipe" (form action, `use:enhance`, pending state).
  - On success: render the **same editor component the new/edit screens use** [3c],
    prefilled from the draft — the preview _is_ the editor, so every imperfect parse is a
    two-second fix. Saving goes through the existing create path in `services/recipes.ts`
    (which attaches the already-uploaded photo). Nothing is persisted before Save except
    the temp photo file — clean it up if the user cancels (or on a later import overwriting it).
  - On failure: Banner with the typed error (`m.cooking.import.*`), field keeps the URL,
    plus a "enter it manually" link to `/cooking/recipes/new`. A page with no JSON-LD
    recipe gets its own message — plan 13 turns that dead end into the AI fallback.
- Entry points: "Import from link" secondary action on `/cooking/recipes` next to New,
  and a link on the empty state [7e].
- **Share target** (`static/manifest.webmanifest`):
  ```json
  "share_target": { "action": "/cooking/recipes/import", "method": "GET",
                    "params": { "url": "url", "text": "text", "title": "title" } }
  ```
  The import page reads `?url=` — **and falls back to a URL found in `?text=`**, because
  Android browsers often put the link there — prefills the field and auto-submits.
- i18n: everything under a new `cooking.import` namespace in `en.ts` **and** `de.ts`
  (error messages, labels, the entry-point copy). Household content stays untranslated
  as always — imported names/ingredients/steps pass through verbatim.
- Docs: SPEC gains §4.7; DECISIONS entries start at **#108** (no-dependency JSON-LD
  parse, SSRF scope, share-target params, anything else judged); README status table
  gains this plan's row; drop "recipe import from URL" from the DECISIONS "Later" list.

## Acceptance

- [ ] A Chefkoch (or any JSON-LD) recipe URL → editor prefilled with name, minutes,
      servings, ingredient rows showing parsed amount chips ("500 g Mehl" → 500/g/Mehl),
      steps in order, photo present → Save → recipe in the library, fully usable in
      meal plan and cook mode.
- [ ] `@graph`-wrapped and `@type: ["Recipe", …]` array forms both parse (test with two
      different sites).
- [ ] A page without recipe JSON-LD → "no recipe found" banner + manual-entry link; app
      never crashes on malformed JSON-LD (bad JSON in one block → try the next).
- [ ] Unreachable host, non-HTML response, and >3 MB page each show their own clean error.
- [ ] `http://localhost:5173/…`, `http://127.0.0.1/…`, `http://192.168.1.1/…` are rejected
      without a request being made.
- [ ] Unparseable ingredient lines land name-only and are editable before save; >60 lines
      or over-long lines are capped server-side without orphaning the downloaded photo.
- [ ] Share target is in the manifest and `?url=`/`?text=` prefill + auto-fetch works when
      opened directly in the browser. (True share-sheet verification needs the installed
      PWA on Android — if that's not possible in the session, say so in the handoff.)
- [ ] `npm run check` && `npm run build` clean.

Out of scope: AI/LLM fallback, photo OCR, paste-text import (all plan 13); microdata/RDFa
parsing (JSON-LD covers the overwhelming majority — DECISIONS).
