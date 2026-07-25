# 13 · AI import: fallback extraction, pasted text & photos

**Goal:** cover what plan 12 can't. With a household-provided Anthropic API key, extract a
recipe from (a) a fetched page that has **no JSON-LD**, (b) **pasted text** (for
bot-blocked sites), and (c) **photos of a cookbook/magazine page**. Every path lands in
the same editable preview from plan 12 — AI never saves anything on its own.

Depends on: 12 (import screen + preview flow), 10 (Settings, `requireOwner` shape).
SPEC: extend §4.7 + add the Settings row to §6. Design: no new frame — Settings `RowGroup`
row + BottomSheet for the key; import screen gains a "From photo" section and a paste box.

## Build

- **Schema**: `households.anthropicApiKey` (`text`, nullable) → `npm run db:generate`.
  Stored plaintext in the household's own SQLite file inside a single-tenant container —
  encrypting with a key that lives in the same container buys nothing real; log the
  judgment in DECISIONS. The key must never reach the client: server-only modules, and
  Settings' `load` returns only a masked hint (`sk-ant-…xyz`, last 4) + set/unset flag.
- **Settings → Household**: "AI import" row (owner-only mutation via the `requireOwner`-
  in-transaction shape from plan 10; visible read-only to members). Sheet: what the key
  is for, one-line cost note, TextField (never prefilled with the real key), Save /
  Remove. Server-side shape check (`sk-ant-` prefix) only — real validation happens on
  first use.
- `lib/server/services/ai-import.ts` — new dependency **`@anthropic-ai/sdk`** (note
  version in DECISIONS). Client constructed per call with the household's key.
  - `const MODEL = 'claude-opus-4-8'` — one constant, current Anthropic default
    recommendation. `claude-haiku-4-5` is the budget alternative (vision-capable,
    roughly a fifth of the cost; either way a recipe extraction is cents at most) —
    **owner's call, log the choice in DECISIONS.**
  - Structured output via `client.messages.parse()` with `output_config.format`
    (`zodOutputFormat` if zod is already in the tree, else a hand-written JSON schema):
    `{ name, timeMinutes?, servings?, ingredients: string[], steps: string[] }`.
    **Ingredients come back as raw lines exactly as written in the source** and go
    through the same `lib/utils/ingredients.ts` parse as typed input and plan 12 — one
    convergent path into the editor. Prompt rules: extract only what's present, never
    invent amounts, **keep the source language** (a German recipe stays German — recipe
    content is household content, SPEC §9).
  - `extractFromText(key, text)` — cap input ~40k chars; `extractFromImages(key, images)`
    — base64 `image` blocks (`media_type: image/webp`) before the text prompt.
  - Error mapping with the SDK's **typed errors**, not string matching:
    `AuthenticationError` → "key invalid — check Settings"; `RateLimitError` → try
    later; parse/validation failure or empty result → "couldn't find a recipe". All via
    `m.cooking.import.ai.*`.
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
- i18n: `cooking.import.ai.*` + `settings.aiImport.*` in `en.ts` and `de.ts`.
- Docs: SPEC §4.7 + §6; DECISIONS (SDK version, model choice, plaintext-key call,
  explicit-tap rule); README status row.

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
- [ ] Wrong key → error pointing at Settings (typed `AuthenticationError` path, no raw
      API error shown); member without owner role cannot change the key (server-enforced).
- [ ] `npm run check` && `npm run build` clean. (API-dependent criteria need a real key
      in the dev env — if unavailable, verify the error paths + UI states and say so
      explicitly in the handoff; never claim untested extraction works.)

Out of scope: other providers / local models (PWA has no bridge to on-device Gemma;
browser-local inference means GB-scale downloads — DECISIONS), automatic Tier-2 without
a tap, streaming progress, multi-recipe pages.
