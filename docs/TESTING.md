# Testing

How a change proves itself before it reaches the test environment (`dev`) or the household
(`main`). This is the reviewer that is always there: agent sessions build most of what ships,
and a test that fails with a `path:line` is a better memory than a paragraph in CLAUDE.md.

**One command runs everything CI runs, except the screenshots:**

```bash
npx playwright install chromium   # once per machine — the browser `verify` drives
npm run verify      # lint · types · unit/integration/conventions (incl. migration drift) · build · e2e
npm run test:visual # the screenshots, in Docker — only when a screen changed (see "Visual")
```

## The layers

| Layer           | Where                         | Runner                       | What it catches                                                                                                | Command                                    |
| --------------- | ----------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Static          | —                             | prettier · svelte-check      | formatting, types, a `de.ts` key missing against `en.ts`, `$props()` misuse                                    | `npm run lint` · `check`                   |
| Migration drift | `scripts/check-migrations.ts` | drizzle-kit, run by Vitest   | `schema.ts` edited without `npm run db:generate` — compiles, passes every test, fails in production            | `npm test` (or `npm run check:migrations`) |
| Unit            | `src/**/*.test.ts`            | Vitest                       | the pure functions beside the module they pin: parsers, calendar maths, amounts, the i18n negotiation          | `npm test`                                 |
| Unit (tooling)  | `scripts/**/*.test.ts`        | Vitest                       | the repo's own scripts: the agent run summary, the import probe's report                                       | `npm test`                                 |
| Integration     | `tests/integration/`          | Vitest + in-memory SQLite    | services against a migrated database: the household boundary, points and undo, invite codes, feedback receipts | `npm test`                                 |
| Conventions     | `tests/conventions/`          | Vitest + `fs`                | the house rules from CLAUDE.md as tests: tokens only, type scale, runes, guards, workflow drift                | `npm test`                                 |
| End-to-end      | `tests/e2e/`                  | Playwright, production build | user journeys on a 390px phone: sign-in doors, onboarding, shopping, chores, cook mode, language, feedback     | `npm run test:e2e`                         |
| Visual          | `tests/visual/`               | Playwright, Linux container  | a screen that changed when it shouldn't have — light and dark, every tab, the component kit                    | `npm run test:visual`                      |
| Smoke           | `scripts/smoke.ts`            | plain `fetch`                | the deploy that came up: right commit, sign-in page, guards, manifest, `E2E_MODE` off                          | `npm run smoke -- <url>`                   |

The first five are what `npm test` and the `static` / `unit` CI jobs run; they take seconds.
The two Playwright layers run against **the production build** — `node build/index.js`, the
server Coolify runs — on a throwaway database under `data/e2e/`, so adapter-node's body limit,
the baked env and the real migration path are all in the loop.

## The flow

```
branch ──PR──▶ dev ──Coolify──▶ test environment ──PR──▶ main ──Coolify──▶ the household
          │                          │                     │
         CI                        smoke                  CI + smoke

issue ──probe·Triage·apply──▶ dispatch / `agent:build` ──Build──▶ agent/issue-N ──PR + auto-merge──▶ dev ──merged.yml──▶ `fixed-on-dev`
```

1. Work on a branch off `dev`. Tests ship with the change (→ "Writing tests").
2. `npm run verify` locally; `npm run test:visual` if a screen changed.
3. Push, open a PR against `dev`. CI runs the three jobs; the `e2e` job uploads a Playwright
   report (and the visual diffs) as an artifact when something fails.
4. Merge when green — **branch protection requires all three checks** on `dev` and `main`, so a
   merge is a green run and a direct push is refused (admins excepted). Coolify deploys `dev` to
   the test environment; the **Smoke** workflow waits for `/api/health` to report the merged
   commit and checks the doors.
5. **The release PR** (DECISIONS #161). No agent opens a PR against `main`. Every push to `dev`
   runs `.github/workflows/release.yml`, which opens the one `Release: dev → main` PR when `dev`
   is ahead, or rewrites the open one's description (`scripts/release-pr.ts`): every PR merged
   since the last release, and one `Closes #N` line per `fixed-on-dev` issue — closing keywords
   only act on the default branch, so that line is what closes them. The code needs no updating:
   the PR's head _is_ `dev`, and its checks are the ones CI ran on the push. Lukas tries the
   test environment and merges it; the household's instance follows, and the issues close with
   it. Actions → Release PR → Run workflow rewrites it by hand.

**The agent lane** (→ [plan 18](plans/18-agent-build.md), DECISIONS #143,
[plan 26](plans/26-agent-reproduce-review.md), DECISIONS #164). Triage runs as three jobs, and
the agent decides while the workflow acts:

- **`probe`** has no Claude and no secrets. It runs `npm run import:probe` on every page the issue
  links to, and hands the report to triage as a file.
- **`triage`** reads the issue, the code and that report, posts its one comment, and returns a
  verdict through `--json-schema` (`scripts/triage-verdict.schema.json`). It has no
  `gh issue edit`.
- **`apply`** has no Claude. It sets the labels and the title from the verdict
  (`scripts/triage-apply.ts`). It dispatches `build.yml` itself only for a `bug` of `size:s`
  whose cause triage **found**, with no open questions and nothing on `dev` that fixes it
  already. That condition is the step's `if:`. Triage reports whether the probe
  **reproduced** it, but doesn't require it (DECISIONS #165): the build's first step is the
  reproduction. A `plausible` cause, an open question or `size:m` waits for a person.

A person adds `agent:build` to anything `size:s` / `size:m`; a label a bot adds starts nothing.
Build branches `agent/issue-N` off `dev` and commits a **`Reproduce #N`** test that fails on
`dev` for the reported reason ("Writing tests" below). It answers triage's open questions with
evidence, fixes the bug, and has the read-only `reviewer` subagent (`.claude/agents/reviewer.md`)
read the diff. It decides each finding itself, runs `npm run verify`, opens the PR (red output,
green output, a Review section) and enables auto-merge. With no reproduction it leaves a
`needs-info` question or a `WIP:` draft, never a fix on a guess. Green CI merges the PR. Then
**`.github/workflows/merged.yml`** labels each `Closes #N` issue `fixed-on-dev`, for agent and
desk PRs alike, and only when the PR has merged. The label stays until the release PR closes
the issue, and merging that PR is always a person. A PR that fell behind `dev` shows `BEHIND`
and needs `gh pr update-branch`; a `WIP:` draft is a build that stayed red and waits for a desk
session. `/inbox` lists both.

**Every agent run leaves a receipt** (→ [plan 25](plans/25-agent-evidence.md), DECISIONS #157).
Build runs in `--permission-mode auto` with a deny list for the hard nos, triage on an allow-list
with no web access at all (DECISIONS #163); both pin their model. After each action, `scripts/agent-run-summary.ts`
writes the run's summary page: model, turns, duration, cost, **every denied tool call**, every
Bash command, and every `npm run verify` with its exit code — no message text. So a PR's ticked
"verify clean" can be checked against the run that opened it (Actions → the run → Summary), and
a refusal is a line on that page, not a silent guess. For a report that links a recipe page,
`npm run import:probe -- <url>` is the app's own importer on the real page. It prints the reader
that matched, the steps and the ingredients, and `--save <name>` keeps the page as a fixture in
`src/lib/utils/fixtures/` for the test. Triage's `probe` job runs it for triage, since the agent
has no web; the build agent runs it itself.

**Branch protection makes the gate real.** It was applied on 2026-09-14 with the command below
(once, as the repository owner — re-run it to change the required checks). Both branches are
strict: a PR must be up to date with its base before it merges. `main`'s history is merge
commits of `dev`, so a `dev → main` promotion often opens as `BEHIND` — `gh pr update-branch <n>`
merges `main` back into `dev`, CI runs once more, and the PR merges.

```bash
for branch in dev main; do
  gh api -X PUT "repos/lukas-jungwirth/choreganized/branches/$branch/protection" \
    --input - <<'JSON'
{ "required_status_checks": { "strict": true,
    "contexts": ["Lint · types · migrations", "Unit · integration · conventions", "End-to-end · visual"] },
  "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null }
JSON
done
gh api -X PATCH repos/lukas-jungwirth/choreganized -F allow_auto_merge=true -F allow_update_branch=true
```

The smoke workflow needs the deploy URLs as repository **variables** (not secrets):
`TEST_ENV_URL` for `dev`, `PROD_URL` for `main`. Without them it says so and passes.

## Writing tests

**Where a test goes** follows what it needs. No database → a `*.test.ts` beside the module.
A service → `tests/integration/`. A rule about the source tree → `tests/conventions/`. Something
only a browser shows (a sheet, a redirect, a screen) → `tests/e2e/`. The look of a screen →
`tests/visual/`. Assertions are `node:assert/strict`, as they always were; `describe`/`it`
come from `vitest`.

**A bug is reproduced before it is fixed** (→ plan 26). The regression test is built from the
reporter's artefact: the page the probe saved, their own input, or seeded data driven by
Playwright for a screen. It asserts what they observed, in their terms ("Schritt 4 contains
'glattrühren'"), not the shape of the code you expect to change. Run it on the untouched branch
and read the failure: it must fail _for the reported reason_. Then commit it alone as
`Reproduce #N: …` before the fix. A test that encodes a guess at the cause also "fails without
the change", and issue #31's wrong fix passed every gate with one.

### Integration

`tests/helpers/db.ts` is the fixture. Every test **file** gets its own in-memory database
(Vitest isolates module graphs, and `vite.config.ts` forces `DATABASE_PATH=:memory:` under
`test` — a shell or `.env` cannot override it, and the fixture refuses anything else, so
`npm test` can never touch a real file or a real GitHub token), migrated from zero on first use. `makeHousehold({ housemates: ['Elisabeth'] })` builds a household through
the real `createHousehold` / `joinHousehold`, never through inserts, and stamps join times a
minute apart so "join order" is deterministic. Create a **fresh household per test**; the
household boundary is then exercised by every test that runs after another.

```ts
const { householdId, owner } = makeHousehold();
const item = addItem(householdId, owner.id, { name: 'Tomatoes' });
assert.equal(setChecked(otherHousehold.householdId, item.id, …), false);
```

Push and the GitHub mirror are off (`TEST_ENV` in `vite.config.ts` blanks the keys and the
token) and the tests for those paths assert exactly that.

### Conventions

`tests/helpers/source.ts` reads the tree the way `grep` does. A rule is a test that lists
offenders as `path:line  <the line>`; an exception is an allow-list entry **with a reason** in
the test file (see `PROPORTIONAL_TYPE` in `design-tokens.test.ts`, `PUBLIC_ENDPOINTS` in
`guards.test.ts`). A new house rule in CLAUDE.md gets a test here in the same commit.

### End-to-end

`playwright.config.ts` runs three projects: `setup` signs up two accounts through Better
Auth's own `/api/auth/sign-up/email` and seeds each with `scripts/seed.ts` (the same demo
household a developer looks at); `e2e` runs the journeys as the `owner` household and may
mutate it; `visual` screenshots the `visual` household, which nothing mutates. Tests are
serial (`workers: 1`) because they share a server and, within `e2e`, a household.

Find things the way a user does — `getByRole`, `getByLabel`, `getByPlaceholder` — with the
English copy from `en.ts`. A test that switches language switches it back in a `finally`. The
seeded names live in `tests/e2e/accounts.ts`.

Debug a failure with the report: `npx playwright show-report`, or the trace CI uploaded
(`npx playwright show-trace test-results/<test>/trace.zip`). Every failure also leaves an
`error-context.md` with the page's accessibility tree — usually enough to fix a selector without
opening a browser.

```bash
npm run test:e2e                              # builds, then runs the e2e project
npx playwright test --project=e2e -g shopping # one file, against the last build
npx playwright test --ui                      # step through with the inspector
```

### Fake AI

AI features (→ plan 20) are tested without a key and without a network: `scripts/fake-ai.ts`
answers all four providers' wire formats on one port, each under its own prefix (`/gemini`,
`/openai`, `/anthropic`, `/openrouter`). `scripts/e2e-server.ts` starts it on `FAKE_AI_PORT`
(4174) before the app and hands the app `AI_<PROVIDER>_BASE_URL` — which the app honours **only
under `E2E_MODE`** (→ `src/lib/server/ai/index.ts`), so no deploy can be redirected by a stray
variable. The behaviour is picked by what a test types, with no setup call:

- a key containing `bad` → that provider's "key refused";
- a model containing `busy` → `429` (a full free tier), `down` → `503`;
- anything else → a recipe named after the provider that answered ("Claude pancakes"), in the
  shape the request's schema asked for.

`GET /__requests` lists what each call asked for, so a test can check what reached the model. By
hand: start the `fake-ai` launch entry (port 5199) next to `verify`, which already points every
provider at it. Below the e2e layer, each adapter is unit-tested against canned answers with an
injected `fetch` (`src/lib/server/ai/providers/providers.test.ts`), and the backup logic against
fake adapters (`run.test.ts`).

**A live provider is never in the loop**, in CI or in a session's own checks. One live call per
provider needs a real key in the running app, and only Lukas has those. A handoff says plainly
whether that happened.

### E2E mode — and verifying by hand

The server has one door for tests: `E2E_MODE=true` enables password sign-in and `/dev/kit`
(→ `src/lib/server/e2e-mode.ts`, DECISIONS #139). It is refused outright on any `ORIGIN` that
is not localhost, so it cannot be left on a deploy by accident. `scripts/e2e-server.ts` sets it
for the production build the tests drive; the `verify` entry in `.claude/launch.json` (checked
in) sets it for a **dev server** on port 5180 with its own, initially empty database at
`data/verify.db` — which is how a session walks acceptance criteria without a Google account:

```bash
# 1. start the `verify` launch entry (dev server on 5180, empty data/verify.db, E2E_MODE on)
# 2. mint a session — the jar then holds the signed cookie Better Auth set:
curl -c jar -H 'Origin: http://localhost:5180' -H 'Content-Type: application/json' \
  -X POST http://localhost:5180/api/auth/sign-up/email \
  -d '{"name":"Verify","email":"verify@example.test","password":"verify-password"}'
# 3. seed it:  DATABASE_PATH=./data/verify.db npm run db:seed -- verify@example.test
# 4. in the preview browser, sign in from the page — the browser stores the httpOnly cookie:
#    fetch('/api/auth/sign-in/email', { method:'POST', headers:{'Content-Type':'application/json'},
#           body: JSON.stringify({ email:'verify@example.test', password:'verify-password' }) })
```

No more editing `auth.ts` with a `TEMP-VERIFY` marker. The server warns on its first line
whenever the flag is on, and `scripts/smoke.ts` asserts it is **off** on every deploy.

### Visual

`tests/visual/screens.spec.ts` is a table: one full-page screenshot per screen at 390px,
light and dark where the theme matters, with masks over what follows the calendar (the greeting
follows the hour, standings the month, due labels the day). A screen whose whole body is the
calendar — the week plan, history — is not in it. Add a screen by adding a row, with the
`route` it shows: **every page must be in the table or excused** —
`tests/conventions/visual-coverage.test.ts` fails `npm test` for a page in `src/routes` that is
neither, and an excuse there carries its reason (→ DECISIONS #156). The onboarding screens sign
up a fresh account per test, since both seeded accounts already own a household. **A mask must
cover a box that doesn't follow the text** — Home masks its whole `header`, not the `h1`, whose
width changed with the greeting — and a sample page fixes its own clock: `/dev/kit` renders
2026-09-11 for ever (→ DECISIONS #144). Something that **appears** with the calendar can't be
masked, because it moves everything below it: the shop-closure banner on Home and Shopping is
answered "Got it" for the `visual` account by the setup project instead (→ DECISIONS #153).

**Baselines are Linux-only** (→ DECISIONS #140): a macOS Chromium rasterises text differently
enough to fail every comparison, so `tests/visual/__screenshots__/*.png` are made in the
Playwright container at the version package-lock pins — the same image the CI job runs in.
The test skips itself anywhere else.

```bash
npm run test:visual                       # compare, in Docker (first run: ~3 min for npm ci)
npm run test:visual -- --update-snapshots # a screen changed on purpose: new baselines
git add tests/visual/__screenshots__      # commit them with the change that caused them
```

No Docker? Push, and run **Actions → Update visual baselines** on the branch (a PR branch —
the workflow pushes with its own token, which protected `dev`/`main` refuse); it commits the
PNGs. Its push does not restart CI (GitHub never triggers a workflow from the workflow token),
so `gh workflow run ci.yml --ref <branch>` afterwards. Either way: **look at the new PNGs in
the diff** — a baseline update is a claim that the new look is right, and the diff is where
that claim gets reviewed.

Tolerance is `maxDiffPixels: 30` — sub-pixel antialiasing, nothing more (a ratio would let a
changed word through). A diff that fails is a screen that changed; the report artifact shows
expected, actual and the diff.

### Smoke

`scripts/smoke.ts <url> --commit <sha>` polls `/api/health` (public, household-blind: `ok`,
`version`, `commit`) until the deploy reports the commit (a deploy that reports none at all is checked as it is
after two minutes, with a warning), then checks `/login`, the redirect and 401 guards, the
manifest, and that `E2E_MODE` is off: password sign-in answers `EMAIL_PASSWORD_DISABLED` and
`/dev/kit` is a 404. Run by
`.github/workflows/smoke.yml` after every green CI run on `dev` or `main`, or by hand:

```bash
npm run smoke -- https://test.example.com --commit $(git rev-parse HEAD)
```

## When CI is red

- **static** — `npm run lint` (run `npm run format`) or `npm run check`.
- **unit** — a convention test prints `path:line` (a schema edit without `npm run db:generate`
  fails the migrations test with drizzle-kit's diff); an integration test names the service.
  `npx vitest run tests/integration/tasks.test.ts` reruns one file; `npx vitest` watches.
- **e2e** — download the `playwright-report` artifact and open `index.html`; a visual failure
  shows expected / actual / diff side by side. If the screen change was intended, refresh the
  baselines (above) and push them.

## Definition of done, restated

`npm run verify` clean · `npm run test:visual` clean or baselines refreshed and committed when a
screen changed · a test that fails without the change, in the layer that fits it · the walk
through acceptance criteria in the running app that the plan asks for.
