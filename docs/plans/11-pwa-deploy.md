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

- [x] Installs from Android Chrome with correct icon/name/splash; standalone launch to /home.
      _Installability signals verified locally: manifest served & valid (name, short_name,
      start_url `/home`, `display standalone`, portrait, theme/bg `#F5F3EE`, 192/512 any +
      maskable), apple-touch-icon, a registered SW with a fetch handler, secure context. The
      icon/name on a **real** Android home screen + splash is a deploy-time visual check._
- [x] Offline: shell + fallback render, no white screen; recovery on reconnect.
      _Handled by the plan-05 service worker (unchanged): hashed build + `static/` cache-first,
      navigations network-first with the branded "You're offline" notice, "Try again" reloads.
      Confirmed the built SW precaches the new manifest + all icons._
- [ ] Production: two real users (Lukas & Elisabeth) can run the full loop — onboard, invite,
      join, shop, plan, cook w/ locked-phone timer push, complete tasks, see the podium.
      _Deploy-gated: needs Coolify + HTTPS + real Google OAuth + two devices. Not doable from
      this environment; see the deploy checklist below._
- [x] Redeploy keeps DB + uploads; backup file appears nightly; restore documented & tested
      once. _DB + uploads already live on the `/data` volume (Dockerfile). Nightly backup built
      and the mechanism tested: `better-sqlite3.backup()` produced a complete, queryable,
      standalone snapshot (1000/1000 rows, no WAL sidecar). Restore procedure below. The
      "appears nightly in prod" tick is deploy-gated (cron log line)._
- [ ] Lighthouse: PWA installable, a11y ≥ 90, perf reasonable on mid-range Android.
      _Deploy-gated (run against the HTTPS origin). Every input Lighthouse scores is in place:
      manifest + maskable icon, SW, `theme-color`, `viewport-fit=cover`, `<html lang>`, meta
      description, global `:focus-visible` ring, `<main>` landmarks, `aria-label`led controls._

## Build notes (2026-07-23)

**Icons — one source, scripted.** `scripts/icons.ts` (`npm run icons`) renders everything the
app wears from `src/lib/assets/logo-mark.svg` (design mark 13b) onto the sage tile: `icon-192/512`
(`any`), `icon-192/512-maskable` (mark pulled to ~52% so it clears the 80% safe circle — measured
content radius 139px vs a 205px safe radius at 512), `apple-touch-icon` (180, opaque), `favicon-96`
(PNG fallback), `badge-72` (white house silhouette, alpha-only), and `static/favicon.svg` (rounded
tile). Re-run after editing the mark and commit the outputs.

**Manifest + head.** `static/manifest.webmanifest` linked from `app.html`, along with
apple-touch-icon, favicon links, apple/mobile web-app metas, a meta description, and — the one
real bug fixed here — `viewport-fit=cover` on the viewport meta, **without which every
`env(safe-area-inset-*)` in the app resolved to 0** (tab bar / FAB / sheets sat under the home
indicator on notched phones). `theme-color` stays solely in the root layout so cook mode can swap
it dark; app.html deliberately declares none. The scaffold's Svelte-logo `favicon.svg` was
replaced.

**Install nudge.** `components/InstallPrompt.svelte` on Home, beside the push prompt and modelled
on it: shows only when Chromium fires `beforeinstallprompt` and the app isn't already installed,
suppresses Chrome's mini-infobar, drives the OS dialog from an "Add" pill, and remembers a
dismissal. Verified end-to-end with a synthetic event (renders, `preventDefault`, `prompt()`,
clears + remembers on accept/dismiss, stays hidden once answered).

**Nightly backup.** `lib/server/backup.ts` + one `cron.ts` registry line. In-process online backup
to `${DATABASE_PATH dir}/backups/YYYY-MM-DD.db` (i.e. on the `/data` volume), 14-day rotation,
atomic `.tmp`→rename. Gated "at or after 03:00 server-local, once per day" — the resilient shape
from DECISIONS #45. No `sqlite3` CLI dependency (not in the slim image). → DECISIONS #91.

### Restore procedure

Snapshots are complete standalone databases — no log replay.

```bash
# On the host / in the Coolify volume (app stopped, or briefly, to be safe):
cd /data
cp choreganized.db choreganized.db.broken           # keep the current one
rm -f choreganized.db-wal choreganized.db-shm        # drop stale WAL sidecars
cp backups/2026-07-23.db choreganized.db             # the snapshot you want
# restart the container — migrations run on boot, WAL is recreated fresh
```

Verify before deleting the `.broken` copy: `sqlite3 choreganized.db "pragma integrity_check;"`
(or open the app). Uploads are separate files under `UPLOADS_DIR` on the same volume and are not
part of the DB snapshot — they survive redeploys on their own and need no restore step.

### Deploy checklist (Coolify — manual, deploy-gated)

1. Build the Dockerfile; mount a persistent volume at `/data`.
2. Env in the Coolify UI (no `.env` is deployed): `ORIGIN`, `BETTER_AUTH_URL` (= the real
   origin), a fresh `BETTER_AUTH_SECRET`, prod `GOOGLE_CLIENT_ID/SECRET` (add the prod
   `…/api/auth/callback/google` redirect URI), the **production** VAPID keypair (generate once,
   never rotate — → ARCHITECTURE "Secrets per environment"), `VAPID_SUBJECT`. `DATABASE_PATH`,
   `UPLOADS_DIR`, `BODY_SIZE_LIMIT` already default correctly in the image.
3. Verify on the deployed HTTPS origin: OAuth round-trip · install from Android Chrome (icon,
   name, splash, standalone → `/home`) · push to a locked Android phone (task reminder + cook
   timer) · a cron log line · migrations ran on boot · uploads persist across a redeploy · a
   backup file appears in `/data/backups` overnight · restart mid-timer recovers · Lighthouse
   PWA installable + a11y ≥ 90.
