# Choreganized

_Every chore, organized._ A warm, minimal household app for two — shared shopping list, weekly
meal plan with a hands-free cook mode, and recurring chores with effort points, a monthly
podium, and gentle reminders. Installable PWA (Android-first), self-hosted.

**Stack:** SvelteKit 2 (Svelte 5 runes) · SQLite (better-sqlite3 + Drizzle) · Better Auth
(Google) · Web Push + node-cron · adapter-node in a single Docker container (Coolify).

## Getting started

```bash
npm install
npx playwright install chromium   # once per machine, for `npm run test:e2e` / `verify`
cp .env.example .env    # Google OAuth + auth secret are required to sign in
npm run dev             # → http://localhost:5173, migrations run on boot
```

Sign in with Google once, then fill the app with demo data (safe to re-run):

```bash
npm run db:seed -- you@example.com   # the Google address you signed in with
```

## Tests

```bash
npm test               # unit · integration (in-memory SQLite) · conventions — seconds
npm run test:e2e       # Playwright journeys against the production build
npm run test:visual    # screenshot comparison, in Docker (Linux baselines)
npm run verify         # everything CI runs, except the screenshots
```

CI runs all of it on every pull request and push to `dev` / `main`; `dev` deploys to the test
environment, `main` to the household. → [docs/TESTING.md](docs/TESTING.md)

## Project state & docs

The project is **specified and scaffolded; features are built plan-by-plan** by agent
sessions:

- [docs/plans/README.md](docs/plans/README.md) — implementation plans & status
- [docs/SPEC.md](docs/SPEC.md) — product spec · [design/Hearth.dc.html](design/Hearth.dc.html)
  — the design (open in a browser)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA-MODEL.md](docs/DATA-MODEL.md) ·
  [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) · [docs/DECISIONS.md](docs/DECISIONS.md) ·
  [docs/TESTING.md](docs/TESTING.md)
- [CLAUDE.md](CLAUDE.md) — working conventions for agents

## Deploy

One container, no separate DB — see `Dockerfile` and
[docs/ARCHITECTURE.md → Deployment](docs/ARCHITECTURE.md#deployment-coolify). Mount a volume
at `/data`, set the env from `.env.example`, serve over HTTPS.
