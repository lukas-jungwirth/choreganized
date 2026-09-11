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
```

1. Work on a branch off `dev`. Tests ship with the change (→ "Writing tests").
2. `npm run verify` locally; `npm run test:visual` if a screen changed.
3. Push, open a PR against `dev`. CI runs the three jobs; the `e2e` job uploads a Playwright
   report (and the visual diffs) as an artifact when something fails.
4. Merge when green. Coolify deploys `dev` to the test environment; the **Smoke** workflow
   waits for `/api/health` to report the merged commit and checks the doors.
5. Try it on the test environment. Promote with a PR `dev → main`; the household's instance
   follows the same way.

**Branch protection makes the gate real.** Until it is on, CI is advisory — wait for green
anyway. To require it (once, as the repository owner):

```bash
for branch in dev main; do
  gh api -X PUT "repos/lukas-jungwirth/choreganized/branches/$branch/protection" \
    --input - <<'JSON'
{ "required_status_checks": { "strict": true,
    "contexts": ["Lint · types · migrations", "Unit · integration · conventions", "End-to-end · visual"] },
  "enforce_admins": false, "required_pull_request_reviews": null, "restrictions": null }
JSON
done
```

The smoke workflow needs the deploy URLs as repository **variables** (not secrets):
`TEST_ENV_URL` for `dev`, `PROD_URL` for `main`. Without them it says so and passes.

## Writing tests

**Where a test goes** follows what it needs. No database → a `*.test.ts` beside the module.
A service → `tests/integration/`. A rule about the source tree → `tests/conventions/`. Something
only a browser shows (a sheet, a redirect, a screen) → `tests/e2e/`. The look of a screen →
`tests/visual/`. Assertions are `node:assert/strict`, as they always were; `describe`/`it`
come from `vitest`.

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
calendar — the week plan, history — is not in it. Add a screen by adding a row.

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
