# Choreganized

_Every chore, organized._ A warm, minimal household app for two — shared shopping list, weekly
meal plan with a hands-free cook mode, and recurring chores with effort points, a monthly
podium, and gentle reminders. Installable PWA (Android-first), self-hosted.

**Stack:** SvelteKit 2 (Svelte 5 runes) · SQLite (better-sqlite3 + Drizzle) · Better Auth
(Google) · Web Push + node-cron · adapter-node in a single Docker container (Coolify).

## Getting started

```bash
npm install
cp .env.example .env    # fill in as needed (see comments; DB needs nothing)
npm run dev
```

## Project state & docs

The project is **specified and scaffolded; features are built plan-by-plan** by agent
sessions:

- [docs/plans/README.md](docs/plans/README.md) — implementation plans & status
- [docs/SPEC.md](docs/SPEC.md) — product spec · [design/Hearth.dc.html](design/Hearth.dc.html)
  — the design (open in a browser)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA-MODEL.md](docs/DATA-MODEL.md) ·
  [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) · [docs/DECISIONS.md](docs/DECISIONS.md)
- [CLAUDE.md](CLAUDE.md) — working conventions for agents

## Deploy

One container, no separate DB — see `Dockerfile` and
[docs/ARCHITECTURE.md → Deployment](docs/ARCHITECTURE.md#deployment-coolify). Mount a volume
at `/data`, set the env from `.env.example`, serve over HTTPS.
