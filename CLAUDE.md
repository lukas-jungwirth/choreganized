# Choreganized — Agent Guide

Household PWA for two (shopping list, meal plan + cook mode, recurring chores with points).
SvelteKit + SQLite, single process, single container. Tagline: _Every chore, organized._

## Start here

1. **[docs/plans/README.md](docs/plans/README.md)** — the work queue. Pick the next `todo`
   plan whose dependencies are `done`, set it `in progress`, build it, set it `done`.
2. **[docs/SPEC.md](docs/SPEC.md)** — behavior ground truth, screen by screen.
3. **`design/Hearth.dc.html`** — visual ground truth. _Open it in a browser_ and build to the
   pixels. Anchors like [3a] in docs are element ids in this file.
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA-MODEL.md](docs/DATA-MODEL.md) ·
   [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) · [docs/DECISIONS.md](docs/DECISIONS.md).

The DB schema is **already written** (`src/lib/server/db/schema.ts`) with the initial
migration generated. Read DATA-MODEL.md before touching it; schema changes require
`npm run db:generate`.

## Commands

```bash
npm run dev            # dev server (http://localhost:5173)
npm run check          # svelte-check — must be clean before finishing
npm run build          # production build — must pass before finishing
npm run db:generate    # new migration after editing schema.ts
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
- **Household scoping** — `(app)` loads/actions start with `requireMember(event)`; every
  service function takes `householdId` first and filters by it. No exceptions, including
  uploads.
- **Load + form actions** with `use:enhance`; services (`lib/server/services/*`) own logic
  and transactions; actions stay thin. JSON endpoints only for push/timers/uploads.
- **Dates**: calendar dates are household-local `YYYY-MM-DD` strings (`lib/utils/dates.ts`
  helpers once plan 04 creates them) — never round-trip them through UTC.
- Mobile-first at 390px, max-width 480px shell, tab bar–aware padding.
- New dependency or judgment call → one line in DECISIONS.md.

## Definition of done (every plan)

`npm run check` and `npm run build` clean · acceptance criteria in the plan file walked
through in the running app (`npm run dev`, seeded data) · status table updated · deviations
logged in DECISIONS.md. If dev-server verification is impossible for the environment, say so
explicitly in the handoff — never claim untested things work.

## Repo map

`src/lib/server/` db + auth + services + push + cron · `src/lib/components/` ui / shell /
feature · `src/routes/` see ARCHITECTURE.md routing map · `design/` mockups · `docs/` specs
& plans · `static/` manifest + icons · `Dockerfile` single-container deploy (SQLite volume
at `/data`).
