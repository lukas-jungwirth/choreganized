# 11 · PWA, polish & deploy

**Goal:** installable, branded, deployed. Manifest + real icons, offline shell, install
nudge, production container on Coolify, backups. Final quality pass across all screens.

Depends on: everything (icons/manifest can start anytime; the polish pass needs features).
SPEC: [§8](../SPEC.md#8-cross-cutting-rules), ARCHITECTURE.md → "PWA" + "Deployment".

## Build

- **Icons**: generate from the logo mark (sage rounded tile + white house + peach sparkles —
  SVG in `src/routes/+page.svelte` / design file): 192/512 standard + maskable (add safe-zone
  padding), Apple touch 180, favicon. Script it (`scripts/icons.ts` with sharp) so the mark
  stays the single source; commit outputs to `static/icons/`.
- `static/manifest.webmanifest`: name "Choreganized", short_name "Choreganized", description
  tagline, `start_url /home`, `display standalone`, `orientation portrait`,
  `background_color/theme_color #F5F3EE`, icons incl. maskable. Link in `app.html`.
- Service worker (from 05): confirm precache versioning invalidates on deploy; offline
  navigation shows a branded "You're offline" fallback; SW updates activate on next load
  (skipWaiting + reload prompt optional — keep simple, document behavior).
- Install nudge: small dismissible card on Home ("Add Choreganized to your home screen")
  shown when `beforeinstallprompt` fires (Android) and not standalone; remember dismissal.
- **Deploy to Coolify**: build the Dockerfile, mount `/data` volume, set env from
  `.env.example` (real `ORIGIN`, `BETTER_AUTH_URL`, Google creds incl. prod redirect URI,
  VAPID keys). Verify: OAuth round-trip, push on Android over HTTPS, cron firing (log line),
  migrations on boot, uploads persisted across redeploy, restart mid-timer recovery.
- **Backups**: nightly cron job `sqlite3 .backup` to `/data/backups/{date}.db` with 14-day
  rotation (in-process job — no extra infra), note restore procedure in this file. (Litestream
  optional upgrade — document, don't build.)
- **Polish pass** (with the design open, frame by frame): spacing/typography drift, tap
  targets, transitions, `prefers-reduced-motion`, safe-area insets (tab bar / FAB / sheets on
  notched phones), focus states, Lighthouse PWA + a11y ≥ 90, empty/loading states everywhere,
  dark cook-mode status-bar color swap.

## Acceptance

- [ ] Installs from Android Chrome with correct icon/name/splash; standalone launch to /home.
- [ ] Offline: shell + fallback render, no white screen; recovery on reconnect.
- [ ] Production: two real users (Lukas & Elisabeth) can run the full loop — onboard, invite,
      join, shop, plan, cook w/ locked-phone timer push, complete tasks, see the podium.
- [ ] Redeploy keeps DB + uploads; backup file appears nightly; restore documented & tested
      once.
- [ ] Lighthouse: PWA installable, a11y ≥ 90, perf reasonable on mid-range Android.
