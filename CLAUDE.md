# Choreganized — Agent Guide

Household PWA for two (shopping list, meal plan + cook mode, recurring chores with points).
SvelteKit + SQLite, single process, single container. Tagline: _Every chore, organized._

## This is an agent-built repo, and you own the git history

**Every line here was written by an agent session**, working from the plans and specs in
`docs/`. Lukas describes what he wants; the session designs it, builds it, verifies it in the
running app, writes down why, and **ships it**. Nobody comes along behind you to tidy up, so the
docs are the only memory the next session has — a change that isn't in SPEC/DATA-MODEL/DECISIONS
did not happen.

You are also in charge of the repository. A piece of work is not finished when the code compiles:

1. **Build it** on a branch off `dev` — conventions below, docs updated in the same pass, and
   **a test that fails without the change**, in the layer [docs/TESTING.md](docs/TESTING.md)
   prescribes (unit beside the module · integration for a service · convention for a rule ·
   Playwright for a screen).
2. **Verify it**: `npm run verify` (lint, types, migration drift, every Vitest suite, the build,
   the Playwright journeys) and `npm run test:visual` when a screen changed — then walk the
   acceptance criteria in the running app (see "Definition of done"). If the environment truly
   can't verify something, say so in the handoff.
3. **Review it** — re-read your own diff as a reviewer would (`/code-review` is there for this),
   and fix what it turns up before shipping, not after.
4. **Ship it**: commit with a message that says what changed and why, push the branch, open a PR
   against `dev`, wait for CI, merge. Coolify deploys `dev` to the **test environment** and the
   smoke workflow checks it; promote with a PR `dev → main`. **A finished step ends as working
   code on `main`** — the household's deploy tracks it. (Until branch protection is on, CI is
   advisory — wait for green anyway; the commands to require it are in TESTING.md.)

Don't ship a step that fails its own acceptance criteria; leave it on its branch and say what's
left.

## Start here

1. **[docs/plans/README.md](docs/plans/README.md)** — the work queue. Pick the next `todo`
   plan whose dependencies are `done`, set it `in progress`, build it, set it `done`.
2. **[docs/SPEC.md](docs/SPEC.md)** — behavior ground truth, screen by screen.
3. **`design/Hearth.dc.html`** — visual ground truth. _Open it in a browser_ and build to the
   pixels. Anchors like [3a] in docs are element ids in this file.
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA-MODEL.md](docs/DATA-MODEL.md) ·
   [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) · [docs/DECISIONS.md](docs/DECISIONS.md) ·
   [docs/TESTING.md](docs/TESTING.md) — the layers, the fixtures, the flow to `main`.

The DB schema is **already written** (`src/lib/server/db/schema.ts`) with the initial
migration generated. Read DATA-MODEL.md before touching it; schema changes require
`npm run db:generate`.

## Commands

```bash
npm run dev            # dev server (http://localhost:5173)
npm run verify         # lint · check · check:migrations · test · build · test:e2e — the gate
npm test               # Vitest: unit · integration (in-memory SQLite) · conventions — seconds
npm run test:e2e       # Playwright journeys against the production build (builds first;
                       #   once per machine: npx playwright install chromium)
npm run test:visual    # screenshots vs the Linux baselines, in Docker; -- --update-snapshots
npm run check          # svelte-check — must be clean before finishing
npm run build          # production build — must pass before finishing
npm run check:migrations  # schema.ts edited without a migration? (also run by `npm test`)
npm run db:generate    # new migration after editing schema.ts
npm run db:seed -- you@example.com   # demo data for a signed-in user (idempotent)
npm run db:studio      # inspect the DB
npm run format         # prettier
```

Env: copy `.env.example` → `.env`. Google OAuth + VAPID keys are required for auth/push work
(generation commands are in `.env.example` comments); DB works with no env at all
(`./data/choreganized.db` auto-created, migrations run on boot via the init hook once plan 00
lands).

## Hard conventions (deviations = bugs)

- **Svelte 5 runes** — `$props()`, `$state()`, `$derived()`, `$effect()`, snippets. Never
  legacy `$:`, `export let`, or stores (unless a library demands one).
- **Design tokens only** — every color/radius/shadow is a `var(--…)` from `src/app.css`. A
  hardcoded hex outside `app.css` is wrong. Component inventory: DESIGN-SYSTEM.md — extend
  `lib/components/ui`, don't fork one-off variants.
- **Type goes through the scale** — every `font-size` is `calc(<the mockup's px> * var(--fs))`,
  never a bare px. The design's number stays visible, one token in `app.css` moves the whole app
  (→ DESIGN-SYSTEM "Type scale", DECISIONS #125). Audit:
  `grep -rn "font-size" src | grep -v "calc("`.
- **Both themes, one line** — a colour token that differs by theme is
  `light-dark(<light>, <dark>)`; splitting one across two `:root` blocks is how they drift.
  A bare value is correct **only** when the colour is deliberately theme-independent — the
  member palette, `--on-member`, `--member-shade`, cook mode's text ramp — and those say so in
  a comment. Don't "fix" them. Dark isn't an inversion: stay warm, depth reads as elevation,
  brand hues lift but member colours never do. → DESIGN-SYSTEM "Light & dark", SPEC §10,
  DECISIONS #119–#121.
- **No user-facing string in a component or a service.** Copy lives in
  `lib/i18n/messages/en.ts` (the schema) and `de.ts` (typed against it, so a missing key is a
  `check` failure). In a component: `const m = messages()` at init, then `m.tasks.title`. On
  the server: `catalog(event.locals.locale)`. Anything with a number, a name or a plural in it
  is a **function**, so each language writes its own agreement. `utils/` keeps values with a
  `key`; the catalog keeps their names. Household content (task names, recipes, stores) is
  never translated. → ARCHITECTURE "Language", SPEC §9, DECISIONS #93–#98.
- **Household scoping** — `(app)` loads/actions start with `requireMember(event)`; every
  service function takes `householdId` first and filters by it. No exceptions, including
  uploads.
- **Load + form actions** with `use:enhance`; services (`lib/server/services/*`) own logic
  and transactions; actions stay thin. JSON endpoints only where a form can't do it (push,
  timers, uploads, the live stream, `/api/health`); every one is guarded unless it is on the
  `PUBLIC_ENDPOINTS` list in `tests/conventions/guards.test.ts`, with a reason.
- **Dates**: calendar dates are household-local `YYYY-MM-DD` strings (`lib/utils/dates.ts`
  helpers once plan 04 creates them) — never round-trip them through UTC. Timezone and language
  are separate axes: render them through `m.date.*`, never `formatShortDate` directly.
- Mobile-first at 390px, max-width 480px shell, tab bar–aware padding.
- **Tests ship with the change**, and the house rules above are themselves tests
  (`tests/conventions/`): a hardcoded colour, a bare `font-size`, a route without
  `requireMember`, a schema edit without a migration, all fail `npm test` — the first three
  with a `path:line`, the last by running `scripts/check-migrations.ts`. An exception goes on
  the allow-list in that test **with its reason**, never around it.
- **Verifying by hand needs no Google account and no edit to `auth.ts`**: the `verify` entry in
  `.claude/launch.json` runs with `E2E_MODE=true`, which enables password sign-up
  (→ TESTING.md "E2E mode"). Never set that flag on a deployed instance.
- New dependency or judgment call → one line in DECISIONS.md.

## Definition of done (every plan)

`npm run verify` clean · `npm run test:visual` clean, or its baselines refreshed and committed
when a screen changed on purpose · a test that fails without the change · acceptance criteria in
the plan file walked through in the running app (`npm run dev`, seeded data) · status table
updated · deviations logged in DECISIONS.md. If dev-server verification is impossible for the
environment, say so explicitly in the handoff — never claim untested things work.

## Repo map

`src/lib/server/` db + auth + services + push + cron · `src/lib/components/` ui / shell /
feature · `src/routes/` see ARCHITECTURE.md routing map · `tests/` integration · conventions ·
e2e · visual (+ `helpers/`) · `scripts/` seed, e2e server, visual runner, smoke, migration check ·
`.github/workflows/` ci · smoke · update-snapshots · triage · `design/` mockups · `docs/` specs
& plans · `static/` manifest + icons · `Dockerfile` single-container deploy (SQLite volume
at `/data`).
