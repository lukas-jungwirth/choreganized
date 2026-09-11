# 17 · The test workflow: CI as the gate

**Goal:** make shipping safe enough that an agent can do it. Until now a change proved itself
by a session walking the dev server — thorough, unrepeatable, and impossible from CI, which is
why plan 16 stopped at triage. Coolify now deploys `dev` to a **test environment** and `main` to
the household; both need a gate in front of them that runs without a person. This plan builds
the test pyramid, the CI that runs it on every pull request, the smoke test that checks what
came up, and the one flag that lets a browser sign in without Google.

Depends on: 11 (the production build), 16 (triage). No design frame; no user-facing change
except `/api/health`.

## Build

- `vite.config.ts` — Vitest through the SvelteKit plugin; `.env.test` (checked in) with
  `DATABASE_PATH=:memory:`. The nine `node:test` suites became Vitest with one import line each.
  Vitest **4.1**, not 5: better-auth's optional peer (→ DECISIONS #138).
- `tests/helpers/db.ts` — `migrateOnce`, `insertUser`, `makeHousehold` through the real
  services, join times a minute apart. `tests/helpers/source.ts` — the tree as `grep` sees it.
- `scripts/seed.ts` + `scripts/seed-data.ts` — a per-household stub user for Elisabeth (one
  fixed id gave the second seeded household no housemate), timestamps spaced apart so lists
  don't reorder between runs, and the seeded names in one module the tests import.
- `tests/integration/` — household (13), shopping (7), tasks (11), meals (6), feedback (6):
  the household boundary in every file, points and undo, rotation, invite codes, receipts.
- `tests/conventions/` — design tokens + type scale, runes, guards, i18n, migrations journal,
  CI image drift (→ DECISIONS #142). `scripts/check-migrations.ts` — schema drift via
  drizzle-kit into a scratch copy of the migrations folder.
- `src/lib/server/e2e-mode.ts`, `auth.ts`, `routes/dev/kit`, `hooks.server.ts`, `.env.example`,
  `.claude/launch.json` — `E2E_MODE=true`: password sign-in and `/dev/kit` on a production
  build, a warning at boot (→ DECISIONS #139).
- `src/routes/api/health/+server.ts` — `{ ok, version, commit }`, public, `no-store`.
- `playwright.config.ts`, `scripts/e2e-server.ts`, `tests/e2e/{accounts,setup}.ts` — the
  production build on `data/e2e/`, env built from scratch (no inherited token), two accounts
  signed up through Better Auth and seeded with `scripts/seed.ts`.
- `tests/e2e/*.spec.ts` — auth doors, onboarding, shopping, tasks, cooking, settings (language
  and feedback), members: 16 journeys.
- `tests/visual/screens.spec.ts`, `tests/visual/__screenshots__/`, `scripts/visual.ts` —
  20 Linux baselines from the Playwright container, amd64 (→ DECISIONS #140).
- `scripts/smoke.ts`, `.github/workflows/{ci,smoke,update-snapshots}.yml` (→ DECISIONS #141).
- `package.json` — `test`, `test:watch`, `test:e2e`, `test:visual`, `check:migrations`,
  `verify`, `smoke`. `.gitignore` — `tests/.auth`, `test-results`, `playwright-report`.
- Docs: `docs/TESTING.md` (new), CLAUDE.md (workflow, commands, conventions, definition of
  done), ARCHITECTURE (routing map, server patterns, deployment), README, the triage prompt's
  acceptance template, DECISIONS #138–#142, this file and plan 18.

## Acceptance

- [x] `npm test` runs unit, integration and convention suites in seconds with no setup on a
      fresh clone; each integration file gets its own migrated in-memory database.
- [x] A service called with another household's id returns nothing / `false` / throws — and a
      test says so for shopping, tasks, meals, recipes, household and feedback.
- [x] A hardcoded colour, a bare `font-size`, an `(app)` server file without `requireMember`,
      a JSON endpoint without a guard, or a schema edit without a migration fails the gate with
      a `path:line`.
- [x] `npm run test:e2e` builds, starts the production build on a throwaway database, signs up
      without Google, seeds, and walks 16 journeys at 390px.
- [x] `npm run test:visual` produces identical pixels on two consecutive runs; the baselines are
      Linux-only and the spec skips itself on macOS with a sentence saying why.
- [x] CI runs all three jobs on a pull request; the e2e job runs in the same image as
      `test:visual`, and a convention test fails when the two versions drift.
- [x] `scripts/smoke.ts` waits for a commit on `/api/health`, then checks the public doors and
      that `E2E_MODE` is off.

### For the owner (repository settings, not code)

- [ ] Branch protection on `dev` and `main` requiring the three checks — the command is in
      TESTING.md "The flow".
- [ ] `TEST_ENV_URL` / `PROD_URL` repository variables, so the smoke workflow has a target.

## What was verified (session 2026-09-11)

- **Vitest**: 227 tests in 20 files, ~1.5 s. The nine converted suites unchanged in content.
  `$lib/server/db` resolves under Vitest; `:memory:` gives a fresh database per file (proved by
  the household tests, which create dozens of households and never see each other's).
- **Two findings the tests made on their first run.** `listMembers` orders by `joinedAt, id`;
  a household built in one millisecond ties and falls to the UUID, so "who is up next" was a
  coin flip — the fixture now stamps join times a minute apart (a fact about the fixture, not
  a bug in the app: real people never join in the same millisecond). And the seed script's
  Elisabeth sorts _before_ the owner for the same reason (`seed:…:member:elisabeth` <
  `seed:…:member:owner`), which the members journey now asserts around rather than against.
- **Playwright e2e**: 16 passed in 9.8 s against `node build/index.js` (setup: two sign-ups,
  two seeds). First run found four selector facts worth knowing — `/api/timers` has no GET
  (405, not 401), `<html lang>` is `de-AT` not `de`, two `theme-color` metas exist (light and
  dark media), and the language sheet's "System" option _contains_ the word "English" — and one
  cascade: a language test that fails mid-way leaves every later test German, hence the
  `finally`.
- **Visual**: 15 → 20 baselines made in `mcr.microsoft.com/playwright:v1.63.0-noble` under
  `--platform linux/amd64` on an M-series Mac (first run ~3 min for `npm ci`, then ~50 s).
  A second run compared 15/15 and 20/20 identical. The first set was full-page and painted the
  fixed tab bar mid-content; switched to viewport shots plus a scrolled-to-bottom second shot
  for the long screens.
- **Migration drift**: `npm run check:migrations` → "13 migrations, schema.ts in sync"; adding
  a column to `schema.ts` without generating makes it exit 1 with the sentence.
- **`npm run check`**: 0 errors over 1863 files, tests included (SvelteKit's tsconfig covers
  `tests/`).

### Review pass (same session)

`/code-review` at high effort: eight finder angles, ~40 candidates, four verifiers. Ten
findings reported, all fixed before shipping; the ones that changed behaviour:

- **`npm test` could have written a real database or filed a real issue.** Vite lets the
  shell and `.env` override `.env.test`, so an exported `DATABASE_PATH` or a `.env` with
  `GITHUB_FEEDBACK_TOKEN` reached the integration tests. `vite.config.ts` now forces the
  dangerous values under `test`, and the fixture refuses anything but `:memory:`.
- **The second seeded household had no housemate**, and seeded rows tied on their
  timestamps — which is what the two flaky visual screens were (recipes and same-day chores
  swapping places). Both fixed in the seed. A third source of flake turned up on the way:
  the server's own minute cron stamped the seeded fridge task's overdue nudge on the first
  tick after boot, so its footer grew a line between screenshots. Every seeded nudge that is
  already due is now stamped as sent — which is what the sweep would have done by now anyway.
- **`E2E_MODE` on a deploy was only a warning**; it is now a refusal to boot off localhost,
  and the smoke test probes it directly (`EMAIL_PASSWORD_DISABLED`) instead of via `/dev/kit`
  alone.
- **Better Auth rate-limits sign-up in production mode** (3 per 10 s); off under `E2E_MODE`
  so a retried journey can't 429.
- **`.claude/launch.json` was gitignored** while four docs pointed at it — un-ignored.
- Smaller: the design-tokens test printed style-block-relative line numbers for Svelte files;
  the cook-mode `theme-color` assertion was vacuous; `check-migrations` mis-reported a spawn
  failure; the settings language test's `finally` could not run after a timeout (now an
  `afterEach` that posts the form action); the CI container's Node 24 vs production's 22
  (pinned with `setup-node`); the visual runner built under emulation (host build now);
  stale `node --test` mentions in plans 08 and the README.

- **CI, live.** The first run on GitHub (`dev`, push) went static ✓ · unit ✓ · e2e ✗ — the
  container ran all 17 journeys and 29 of 31 screenshots green, and the two that failed were
  the Settings bottom shots by 235 pixels: the About row read `e2e+4d8f6ae` in CI because the
  e2e server baked `GITHUB_SHA` into the label. Made constant; the second run was green in
  all three jobs, ~1.5 min for the container job. The smoke workflow will run after the
  merge to `main` and pass with a notice until `PROD_URL` / `TEST_ENV_URL` exist. Docker's
  amd64 emulation was fine for the screens here; a much larger suite may want
  `VISUAL_PLATFORM=linux/arm64` for local iteration and CI for the committed baselines.
