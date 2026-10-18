# 20 · AI providers: bring your own key, live model picker, backup

**Goal:** AI import (plan 13) is Gemini-only, with one key and a model fixed in code. A household
should be able to bring the provider it already has: **Google Gemini**, **OpenAI (ChatGPT)**,
**Anthropic (Claude)**, or **OpenRouter**, whose one key reaches many models, free ones among
them. It picks the model from **the provider's own live list**, so a new model is there the day it
ships and nothing goes stale. An optional **backup** connection takes over when the main one
answers "limit reached", "busy" or "key refused". Free tiers are allowed, and the sheet says
plainly that they can be unreliable. Settings' "AI recipe import" becomes **"AI features"**,
because recipe import is the first AI feature, not the only one.

Depends on: 13, 14. SPEC: §4.7, §6. Design: there is no frame. This reuses Settings' `RowGroup`
row and the `BottomSheet` + `SheetOption` shapes from Language and Theme.

## Build

- **Schema**: a new table `ai_connections`:
  - Columns: `id`, `householdId` (FK, cascade), `slot` (`primary | backup`),
    `provider` (`gemini | openai | anthropic | openrouter`), `apiKey`, `model`, and `vision`
    (bool, nullable; null = unknown). Plus `createdAt`/`updatedAt` and
    `UNIQUE(householdId, slot)`.
  - The provider and slot lists live in a relative-imported `.ts` beside the schema. drizzle-kit
    and `seed.ts` cannot resolve `$lib`.
  - **The migration carries a hand-added data step**, between the generated `CREATE TABLE` and
    the column drop:
    - It runs `INSERT … SELECT` from a non-blank `households.gemini_api_key` into a `primary` row
      with `gemini` / `gemini-flash-latest`.
    - The SQL mints the `id` and the ms timestamps itself, because `id()` and `createdAt()` are
      JS-side defaults.
    - Then it drops `gemini_api_key`. **The drop must be a plain `ALTER TABLE … DROP COLUMN`.** A
      drizzle table rebuild (`__new_households` + `PRAGMA foreign_keys=OFF`) would cascade-delete
      every household inside the migrator's transaction, so hand-write the drop if it comes out
      that way.
  - Keys stay plaintext, for #112's reason.
- **`lib/server/ai/`**, the provider layer. It uses plain `fetch`, with no SDK. `@google/genai` is
  removed.
  - `types.ts`: `AiProvider`, `AiError` / `AiErrorCode`, `GenerateRequest`, `ModelInfo`. The error
    codes are `bad-key · rate-limited · quota · model-unavailable · model-unsupported ·
unavailable · timeout · bad-output · failed`.
  - `providers/gemini.ts`:
    - Generation: `models/{model}:generateContent` with `x-goog-api-key`, JSON mode with
      `responseJsonSchema`, and `temperature: 0`.
    - Models: `GET models`, filtered to `generateContent` and with the non-text families dropped.
      The `*-latest` aliases go first.
  - `providers/openai.ts`:
    - Generation: Chat Completions with `response_format: json_schema` (strict), images as data
      URLs, and **no temperature** (reasoning models reject it).
    - Models: `GET models`, filtered to chat models, newest first.
  - `providers/anthropic.ts`:
    - Generation: Messages with a **forced tool call** carrying the schema as `input_schema`. That
      works on every Claude model.
    - Models: `GET models`, newest first.
  - `providers/openrouter.ts`:
    - Generation: the OpenAI request against `openrouter.ai/api/v1`, with
      `provider.require_parameters`.
    - Models: the public `GET models`, filtered to structured-output capable ones, with `free`
      and `vision` read off the listing.
  - **The base URL can be overridden per provider** (`AI_<PROVIDER>_BASE_URL`), but **only under
    `e2eMode()`**. It is there for the fake provider in tests, and a stray production variable
    must not be able to send a household's key somewhere else. It is read lazily and passed into
    each adapter as a parameter.
  - **Error mapping by HTTP status**, the same for every provider. The raw error never reaches the
    page.
  - `run.ts` `generateWithFallback`:
    - It tries the primary connection, and on any `AiError` it tries the backup.
    - **One time budget covers the whole request**: about 120 s, with the primary cut at about
      60 s when a backup exists.
    - Photo requests skip a connection whose `vision === false`.
    - It reports which connection answered, and why it fell back.
- **`services/ai.ts`** replaces `getGeminiApiKey`, `getAiImportStatus` and `setGeminiApiKey`:
  - `getAiStatus`: provider, model and a masked hint. **Never the key.**
  - `getAiConnections` (server-only), `isAiEnabled`.
  - `saveAiConnection` / `removeAiConnection`: owner-only, with `requireOwner` in the transaction
    (→ #77). Removing the primary promotes the backup. A blank key on an unchanged provider keeps
    the stored key.
  - `listModels`: owner-only.
  - `testConnection`.
  - `utils/household.ts` `looksLikeGeminiKey` becomes `looksLikeApiKey`, with a maximum length.
- **Settings**: the row reads "AI features" and shows "Gemini · gemini-flash-latest", or "Not set
  up". Members see it read-only.
  - `AiFeaturesSheet`:
    - A free-tier note at the top.
    - A **Main** card and a **Backup (optional)** card, each with Edit and Remove.
  - `AiConnectionSheet`:
    - **Provider**: `SheetOption` rows, which gain a button variant, each with a hint ("Free
      tier" or "Free models" or "Paid") and a "Get a key" link.
    - **Key**: never prefilled. When editing, it reads "leave empty to keep".
    - **Model**: a `Select` filled by `?/aiModels` from the provider's live list. That doubles as
      the key check. A recommended model is preselected by a rule over the live list, and
      "Other model…" reveals a text field.
    - **Test** and **Save**.
  - Sheets swap from page state, as every Settings sheet does today.
- **Import screen**: the behaviour and the flat output shape are unchanged; it now calls
  `generateWithFallback`. A quiet note says when the backup answered.
- i18n:
  - `settings.aiImport.*` becomes `settings.ai.*`.
  - The `cooking.import.ai.error.*` messages name the provider.
  - New: `usedBackup`, `backupFailed`.
- `.env.example`, ARCHITECTURE: `GEMINI_MODEL` is retired, and the stack, layout and env lists are
  updated.
- Docs: SPEC §4.7 + §6, DATA-MODEL, DECISIONS (supersedes #112's single-provider and SDK lines,
  amends #113, #136), TESTING (the fake provider).

## Acceptance

- [x] An existing Gemini key migrates to a primary Gemini connection on `gemini-flash-latest`, and
      the old column is gone. Proved on a raw DB migrated up to the previous file.
- [x] The owner sets up each provider by pasting a key. The model list comes from the provider,
      with the recommended model preselected. "Other model…" accepts a typed id.
- [x] No response, load payload or client bundle carries a key. Status shows a masked hint only.
- [x] A member sees provider and model read-only. Every mutation is refused server-side.
- [x] Primary answers 429 → the backup's draft is used and the note names both. Both fail → the
      primary's error, naming the provider.
- [x] Text and photo import still work end to end through the new layer.
- [x] `npm run verify` and `npm run test:visual` clean. A live call per provider needs a real key,
      so if none is available that is said plainly.

Out of scope: on-device models; more than two connections; per-feature model choice; encrypting
keys (→ #112).

## What was verified, and how (session 2026-10-18)

- **`npm run verify` clean**: lint, `svelte-check` (0 errors), 284 Vitest tests and 23
  Playwright journeys on the production build. **`npm run test:visual`**: Settings and
  Settings-dark were refreshed for the renamed row, and three new baselines were made (the AI
  sheet in light and dark, and the set-up form with a loaded model list).
- **Adapters**: unit tests for each provider (`providers.test.ts`) against canned API answers
  with an injected `fetch`. They pin where the key goes (a header, never the URL), the JSON
  switch each provider names differently, the absence of `temperature`, the cut-off and refusal
  answers, and which models each listing keeps and recommends. `http.test.ts` pins the
  by-status error reading on each provider's documented error shapes.
- **Backup**: `run.test.ts` uses fake adapters. A full free tier, a wrong-shaped answer and a
  primary that runs out of its time share each fall back. "No recipe" doesn't. Both failing
  leads with the primary's reason. A text-only model is skipped for photos.
- **Service and migration**: `tests/integration/ai.test.ts` covers:
  - Owner-only save, remove and list; a housemate is refused before any provider is asked.
  - The status never carries a key.
  - The stored key is kept only for the same provider.
  - Removing the primary promotes the backup.
  - **Migration 0013 on a raw database migrated to 0012**: a padded key arrives trimmed as a
    `primary` Gemini row with a v4-shaped id and a ms timestamp, a blank key is left behind,
    the column is gone, and all three households survive.
- **End to end** (`tests/e2e/ai.spec.ts`, against `scripts/fake-ai.ts`):
  - Paste a Gemini key and the model list arrives by itself with `gemini-flash-latest`
    preselected.
  - Pick the busy model, add a Claude backup, and the key never appears on the page.
  - The row reads "Gemini · gemini-busy-flash".
  - A pasted-text import is answered by Claude, and the draft says so.
  - A `bad` OpenRouter key is refused before Save, naming OpenRouter.
  - Test connection passes.
  - Editing reloads the list with the stored key, also after looking at another provider and
    switching back. This last test caught a real bug in review: the reload fired before the
    hidden `provider` field had updated.

**Not exercised:** a call to a **real** provider. That needs a real key, which this session
doesn't have and must not take from the owner, so the live request shapes rest on the
providers' documentation (checked 2026-10-18) and the unit tests above. One live import per
provider with Lukas's own keys is the open check.
