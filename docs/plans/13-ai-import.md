# 13 · AI import: fallback extraction, pasted text & photos

**Goal:** cover what plan 12 can't. With a household-provided Google **Gemini** API key
(from AI Studio), extract a recipe from (a) a fetched page that has **no JSON-LD**, (b)
**pasted text** (for bot-blocked sites), and (c) **photos of a cookbook/magazine page**.
Every path lands in the same editable preview from plan 12 — AI never saves anything on
its own.

Depends on: 12 (import screen + preview flow), 10 (Settings, `requireOwner` shape).
SPEC: extend §4.7 + add the Settings row to §6. Design: no new frame — Settings `RowGroup`
row + BottomSheet for the key; import screen gains a "From photo" section and a paste box.

## Build

- **Schema**: `households.geminiApiKey` (`text`, nullable) → `npm run db:generate`.
  Stored plaintext in the household's own SQLite file inside a single-tenant container —
  encrypting with a key that lives in the same container buys nothing real; log the
  judgment in DECISIONS. The key must never reach the client: server-only modules, and
  Settings' `load` returns only a masked hint (`AIza…wxyz`, last 4) + set/unset flag.
- **Settings → Household**: "AI import" row (owner-only mutation via the `requireOwner`-
  in-transaction shape from plan 10; visible read-only to members). Sheet: what the key
  is for, where to get it (Google AI Studio), one-line cost note, TextField (never
  prefilled with the real key), Save / Remove. Server-side shape check (`AIza` prefix,
  Google API keys are `AIzaSy…`) only — real validation happens on first use.
- `lib/server/services/ai-import.ts` — new dependency **`@google/genai`** (the current
  unified Google Gen AI SDK; the older `@google/generative-ai` is deprecated — note the
  version in DECISIONS). Client constructed per call with the household's key:
  `new GoogleGenAI({ apiKey })`.
  - `const MODEL = 'gemini-2.5-flash'` — one constant, vision-capable and cheap enough
    that a recipe extraction is a fraction of a cent (Google's AI Studio free tier may
    cover a two-person household outright; the owner supplies their own key regardless).
    `gemini-2.5-pro` is the higher-quality alternative if Flash misreads busy pages —
    **owner's call, log the choice in DECISIONS.** Confirm the current recommended model
    id at build time (a newer Gemini line may be GA) and bump this one constant.
  - Structured output via `ai.models.generateContent({ model, contents, config })` with
    `config.responseMimeType = 'application/json'` and a **hand-written `responseSchema`**
    (zod is not in the tree, so no `zodOutputFormat` equivalent — a plain schema object
    `{ type: 'object', properties: {…}, required: […] }`) for
    `{ name, timeMinutes?, servings?, ingredients: string[], steps: string[] }`, then
    `JSON.parse(response.text)` and validate the shape before use. The extraction rules
    go in `config.systemInstruction`: extract only what's present, never invent amounts,
    **keep the source language** (a German recipe stays German — recipe content is
    household content, SPEC §9). **Ingredients come back as raw lines exactly as written
    in the source** and go through the same `lib/utils/ingredients.ts` parse as typed
    input and plan 12 — one convergent path into the editor.
  - `extractFromText(key, text)` — cap input ~40k chars, sent as a text part;
    `extractFromImages(key, images)` — `inlineData` parts (`mimeType: 'image/webp'`,
    base64 `data`) placed **before** the text prompt. WebP is a supported Gemini image
    type; inline bytes + prompt must stay under the ~20 MB request cap (the sharp
    re-encode below keeps each photo tiny, so 1–3 photos are safe).
  - Error mapping. Gemini's SDK has **no typed error hierarchy** like Anthropic's — it
    throws a single `ApiError` carrying the HTTP `.status`, so branch on status, not on
    error classes (log this difference in DECISIONS): a bad key returns **400 with an
    "API key not valid" message** (and/or 403) → "key invalid — check Settings"; `429`
    → try later; a parse/validation failure or empty result → "couldn't find a recipe".
    All copy via `m.cooking.import.ai.*`; never surface the raw SDK error.
- **Import screen** (extends plan 12's route):
  - Tier-1 "no recipe found" dead end becomes: key set → **"Try AI extraction"** button
    (explicit tap = cost transparency, no silent API calls) reusing the already-fetched
    HTML, stripped to readable text server-side (drop `script/style/nav/header/footer`,
    tags → text, entities decoded). No key → hint linking to Settings.
  - **Paste text**: collapsed "Paste the recipe text instead" section → textarea →
    same extraction. This is the answer for Cloudflare-403 sites.
  - **From photo**: 1–3 images through the existing `lib/server/uploads.ts` validation +
    sharp re-encode (≤1200 px WebP ≈ small token cost) _before_ they're sent to the API.
    The first photo is offered as the recipe photo in the preview (keep/remove).
  - Every success renders the plan-12 preview/editor with a quiet "AI-extracted — check
    before saving" note. Failures leave the user's input in place.
- i18n: `cooking.import.ai.*` + `settings.aiImport.*` in `en.ts` and `de.ts` (the key
  names stay provider-neutral; copy that names the provider or the key source points at
  Google AI Studio / Gemini).
- Docs: SPEC §4.7 + §6; DECISIONS (SDK version, model choice, plaintext-key call,
  explicit-tap rule, error-by-status-not-typed-class note); README status row.

## Acceptance

- [ ] No key set: Tier 1 behaves exactly as in plan 12; AI affordances show only the
      Settings hint; Settings row shows "not set", members see it read-only.
- [ ] Owner sets a key (masked afterwards, never the full value in any response or the
      client bundle — verify via the network tab); Remove clears it.
- [ ] A recipe page without JSON-LD → "Try AI extraction" → prefilled editor with sane
      ingredients/steps → Save works end-to-end.
- [ ] Pasted German recipe text → extraction stays German; amounts parse into the chips.
- [ ] Photo of a cookbook page → extracted recipe in the preview, photo attached; a
      non-recipe photo → graceful "couldn't find a recipe", no crash.
- [ ] Wrong key → error pointing at Settings (the `ApiError` 400/403 "API key not valid"
      path, no raw API error shown); member without owner role cannot change the key
      (server-enforced).
- [ ] `npm run check` && `npm run build` clean. (API-dependent criteria need a real key
      in the dev env — if unavailable, verify the error paths + UI states and say so
      explicitly in the handoff; never claim untested extraction works.)

Out of scope: other providers / local models (PWA has no bridge to on-device Gemma;
browser-local inference means GB-scale downloads — DECISIONS), automatic Tier-2 without
a tap, streaming progress, multi-recipe pages.
