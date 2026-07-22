# Architecture

Single SvelteKit app, single process, single deploy. No separate backend, no separate DB
server. Everything a feature needs — UI, server logic, DB, cron, push — lives in this repo.

## Stack (installed & pinned in package.json)

| Concern   | Choice                                    | Notes                                            |
| --------- | ----------------------------------------- | ------------------------------------------------ |
| Framework | SvelteKit 2 + Svelte 5 (**runes**)        | Runes mode is forced in `vite.config.ts`         |
| Adapter   | `@sveltejs/adapter-node`                  | Long-running Node server (cron, push)            |
| DB        | SQLite via `better-sqlite3`               | WAL, `busy_timeout`, FKs on — see `db/index.ts`  |
| ORM       | Drizzle (`drizzle-orm` + `drizzle-kit`)   | Schema-as-code, generated SQL migrations         |
| Auth      | Better Auth (`better-auth`)               | Google OAuth only in v1                          |
| Push      | `web-push` (VAPID)                        | Hand-written service worker handlers             |
| Scheduler | `node-cron`                               | In-process, 1-min tick, started in server `init` |
| Dates     | `date-fns` + `Intl`                       | Calendar math; `Intl` for timezone rendering     |
| Fonts     | `@fontsource-variable/{fraunces,figtree}` | Self-hosted (PWA/offline friendly)               |
| Icons     | `@lucide/svelte`                          | Matches design's stroke style; bespoke logo SVGs |
| Styling   | Vanilla CSS + custom properties           | **No Tailwind** — tokens in `src/app.css`        |

## Directory layout

```
src/
  app.css                      # design tokens (single source of styling truth)
  app.d.ts                     # App.Locals: { user, member }
  hooks.server.ts              # auth handler + locals + init (migrate, cron)  [plan 00]
  service-worker.ts            # push/notificationclick + minimal precache     [plan 05]
  lib/
    assets/                    # logo svgs, placeholder art
    refetch.ts                 # refetchOnFocus(): visibilitychange → invalidateAll [plan 02]
    scroll-lock.ts             # ref-counted body lock shared by the dialogs     [plan 02]
    push-client.ts             # permission/subscribe state for the browser      [plan 05]
    components/
      EnablePush.svelte        # "notifications on this device" (Settings + Home) [plan 05]
      ui/                      # dumb primitives: Button, Card, BottomSheet, Chip,
                               # Avatar, SegmentedControl, Toggle, EmptyState, FAB…
      shell/                   # Screen (onboarding), TabBar, PageHeader
      icons/                   # the 4 tab icons + crown, drawn in the design file
      shopping/ tasks/ cooking/ home/ …   # feature components (created per plan)
    server/
      db/                      # index.ts (client+migrate), schema.ts, migrations/
      auth.ts                  # Better Auth instance                          [plan 00]
      guards.ts                # requireUser / requireMember helpers           [plan 00]
      push.ts                  # sendToUser/sendToMembers, prune, payload types [plan 05]
      cron.ts                  # registerCronJobs(): reminders, timers, cleanup [plan 05+]
      services/                # domain logic: household.ts, home.ts, shopping.ts, tasks.ts,
                               # reminders.ts, recipes.ts, meals.ts, timers.ts
    utils/                     # dates.ts (household-local helpers), ingredients.ts,
                               # invite-code.ts, timer-parse.ts
  routes/                      # see routing map below
static/                        # icons/ (placeholders [05]), manifest.webmanifest [plan 11]
design/Hearth.dc.html          # the design mockups (open in a browser)
docs/                          # this documentation + plans/
```

## Routing map

```
/                               → redirect: no session → /login · no household → /onboarding · else /home
/login                          [5a]  public
/j/[code]                       [5e]  public invite landing (sets cookie, → login → join)
/onboarding                     [5b]  create-or-join chooser        (authed, no household)
/onboarding/create              [5c]  household + profile
/onboarding/join                [5e]  code entry + profile
/onboarding/invite              [5d]  invite screen after create
(app)/                          layout: session + membership guard, tab bar shell
  home                          [02/8b]
  shopping                      [03]   sheets: add/edit item [3a]
  shopping/stores               [7g]
  cooking                       [04]   sheet: plan meal [3d]
  cooking/recipes               (browse all)
  cooking/recipes/new           [3c]
  cooking/recipes/[id]          [7a]   sheet: ••• [7c]
  cooking/recipes/[id]/edit     [3c]
  cooking/recipes/[id]/cook     [7b/7h] cook mode (hides tab bar)
  tasks                         [05/4a] sheets: new/edit [3b], detail [4b], snooze [4c], done [4d]
  tasks/history                 [8a]
  settings                      [6a]
  settings/members              [6b]   sheet: manage member [6c]
dev/kit                         component gallery — 404 unless `dev`      [plan 02]
api/
  auth/[...all]                 Better Auth handler (GET/POST)
  push/subscribe                POST/DELETE subscription            [plan 05]
  timers                        POST create · DELETE cancel         [plan 08]
  uploads/[...path]             authed recipe images                [plan 07]
```

`[5a]`-style anchors reference `design/Hearth.dc.html`.

## Server patterns

- **Load + form actions, progressively enhanced.** Data via `+page.server.ts` `load`;
  mutations via named form actions + `use:enhance`. No client-side fetch layer, no remote
  functions (experimental). JSON `+server.ts` endpoints only where forms don't fit (push
  subscribe, timers, uploads).
- **Guards** (`lib/server/guards.ts`):
  `requireUser(event)` → session user or redirect `/login`;
  `requireMember(event)` → `{ user, member, householdId }` or redirect `/onboarding`.
  Every `(app)` load/action starts with `requireMember`; **every service function takes
  `householdId` as its first argument**. That convention is the multi-tenancy boundary.
- **Services own logic, actions stay thin.** Form actions parse/validate input, call one
  service function, return. Anything touching more than one table (complete task, join
  household, plan meal + shopping add) is a service function using a transaction.
- **hooks.server.ts** wires: Better Auth handler (`svelteKitHandler`), locals population
  (session → user → member, one query), and the `init` hook: `runMigrations()` +
  `registerCronJobs()` (guarded against dev-HMR double registration via a `globalThis` flag).
- **Freshness without SSE (v1):** actions naturally invalidate; plus a small shared
  `refetchOnFocus` helper (visibilitychange → `invalidateAll`) in the app layout. SSE upgrade
  is isolated in one place later.

## Notifications

Two delivery paths, one send module (`lib/server/push.ts`):

1. **Event-driven** (someone did something): called fire-and-forget from the action/service —
   `void sendToMembers(...)` — never awaited in the request path, errors logged, 404/410 prunes
   the subscription row.
2. **Time-driven** (reminders, timers, cleanup): `node-cron` minute tick scanning the DB with
   idempotency flags and an effective lookback (see DATA-MODEL.md → "Reminder time-sweep").
   Cook timers additionally get a precise in-process `setTimeout` at creation; the cron sweep
   is the restart-safe fallback.

Payload contract (`PushPayload` in `push.ts` ⟷ the SW `push` handler):
`{ title, body?, tag, url, renotify?, vibrate? }`. **`title` carries the message** — the
platform prints the app name itself (→ [DECISIONS #55](DECISIONS.md)). `url` is the deep link
`notificationclick` focuses/opens, `tag` dedupes (e.g. `task-due-{taskId}`, `timer-{timerId}`),
and the SW supplies a default vibration pattern and our icon/badge.

The API 06 and 08 build on (all of it never throws, all of it returns a delivered count):

```ts
sendToUser(userId, payload, { ttlSeconds? })                       // one person, every device
sendToMembers(householdId, payload, { except?, pref?, ttlSeconds? })  // the household
```

`pref` is a `members.notify*` column and `except` a member id (the actor). TTL defaults to 12 h
— a nudge that arrives two days late is worse than one that never arrives
(→ [#58](DECISIONS.md)). A 404/410 from the push service deletes the subscription row.

Service worker: hand-written `src/service-worker.ts` (SvelteKit builds/registers it):
`push` → `showNotification`; `notificationclick` → focus existing client & navigate, else
`openWindow(url)`; precache of build assets + `static/` with cache cleanup on activate;
navigations go to the network with a self-contained offline notice when it fails — pages are
never cached (→ [#56](DECISIONS.md)).

Browser side: `lib/push-client.ts` (permission → subscribe → POST `/api/push/subscribe`) and
`components/EnablePush.svelte` (the state machine: unsupported / unconfigured / denied /
prompt / subscribed).

## PWA

- `static/manifest.webmanifest`: name Choreganized, short_name, `display: standalone`,
  portrait, `background_color/theme_color #F5F3EE`, maskable icons (sage tile + white house
  mark from the design logo), start_url `/home`.
- Icons generated from the logo SVG (`design/Hearth.dc.html` → mark 13b) — plan 11.
- Wake lock in cook mode; `navigator.vibrate` on timer completion in-page.

## Deployment (Coolify)

- **One Dockerfile, one container** (see `Dockerfile`) — SQLite is embedded, so a separate DB
  image would only add failure modes. Answering the open question in the brief: no separate DB
  container.
- Persistent volume mounted at `/data` (DB + WAL files + uploads). Backups: nightly
  `sqlite3 .backup` into the volume, or Litestream to S3 — optional, plan 11.
- Migrations run automatically at boot (`init` hook) — safe with a single instance.
- Required env (see `.env.example`): `ORIGIN`, `DATABASE_PATH`, `UPLOADS_DIR`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`,
  `PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- HTTPS is mandatory for push + install (Coolify/Traefik handles certs).

### Running the production build (verified 2026-07-22)

```bash
# A) Local prod-mode, no Docker
npm run build
node --env-file=.env build/index.js     # → http://localhost:3000

# B) Docker — mirrors what Coolify does
docker build -t choreganized .
docker run --rm -p 3000:3000 -v choreganized-data:/data \
  -e ORIGIN=http://localhost:3000 -e BETTER_AUTH_URL=http://localhost:3000 \
  -e BETTER_AUTH_SECRET=… -e GOOGLE_CLIENT_ID=… -e GOOGLE_CLIENT_SECRET=… \
  choreganized
```

Two gotchas, both hit in practice:

1. **The built server does not read `.env`.** adapter-node ships no dotenv — only the Vite dev
   server loads it. Use `node --env-file=.env` (Node ≥20), or supply real env vars. In Coolify
   set them in the UI; no `.env` file is deployed (`.dockerignore` excludes it).
2. **Don't pass `--env-file .env` to `docker run` as-is.** `.env` sets `DATABASE_PATH=./data/…`
   and `UPLOADS_DIR=./data/uploads`, which override the image's `/data` defaults — the DB then
   lands _inside the container_ and dies with it. Pass env explicitly, or override both paths
   back to `/data/…`.

`ORIGIN` must equal the URL you actually browse or form actions fail; the built server listens
on `PORT` (default 3000) while dev runs on 5173, so a local prod test with Google sign-in also
needs `http://localhost:3000/api/auth/callback/google` added to the OAuth client.

### Secrets per environment

- `BETTER_AUTH_SECRET`: generate a **separate** one for production, straight into Coolify's env
  UI at deploy time (`openssl rand -base64 32`). Freely rotatable — rotating only signs
  everyone out.
- **VAPID keypair: generate once for production and never change it.** Push subscriptions are
  bound to the public key; replacing it invalidates every stored subscription and each device
  must re-subscribe. Dev may use its own throwaway pair.

## Conventions that keep the codebase coherent

- **Svelte 5 runes only**: `$props()`, `$state()`, `$derived()`, `$effect()`; snippets over
  slots; no legacy `$:` or stores unless a library demands it.
- **Tokens only**: never hardcode a hex/radius/shadow — use `var(--…)` from `app.css`
  (see DESIGN-SYSTEM.md). Scoped `<style>` in components; no global utility classes.
- **Mobile-first, one column, max-width 480px** centered shell; the app must look right at
  390px (the design's frame width).
- IDs `crypto.randomUUID()` via schema defaults; never client-generated.
- Keep sheets as components on their owning page (state-driven), not routes — except cook mode
  and recipe form which are real routes (deep-linkable).
- New dependency? Note it + why in DECISIONS.md first.
