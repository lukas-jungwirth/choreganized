# 00 · Foundation: auth, guards, hooks, login

**Goal:** a signed-in Google user, a working DB with migrations at boot, the guard helpers
every later plan calls, and the login screen. After this plan the app runs end-to-end:
`/login` → Google → `/` → redirected to `/onboarding` (which 01 builds).

Depends on: — (scaffold, schema, tokens, Dockerfile already exist).
Design: [5a] login. SPEC: [§1.1](../SPEC.md#11-log-in-5a), [§8](../SPEC.md#8-cross-cutting-rules).

## Build

- `src/lib/server/auth.ts` — Better Auth instance: drizzle adapter (`provider: 'sqlite'`,
  pass the four auth tables from schema), `socialProviders.google`, `secret`/`baseURL` from
  env. Export `auth`.
- `src/routes/api/auth/[...all]/+server.ts` — mount Better Auth handler (GET/POST).
- `src/hooks.server.ts`:
  - `init`: `runMigrations()` (from `$lib/server/db`) + `registerCronJobs()` stub
    (`lib/server/cron.ts` — empty registry now, guarded against double-registration in dev via
    a `globalThis` symbol).
  - `handle`: Better Auth `svelteKitHandler`; then populate `event.locals.user` (session) and
    `event.locals.member` (one query joining members by userId) for non-`/api/auth` requests.
- `src/lib/server/guards.ts` — `requireUser(event)` (redirect `/login`),
  `requireMember(event)` (redirect `/onboarding`), both returning typed locals.
- `src/routes/login/+page.svelte` (+ server load: bounce signed-in users away) — logo block,
  wordmark, tagline, **Continue with Google** button (Better Auth svelte client
  `signIn.social({ provider: 'google', callbackURL: '/' })`), per [5a] minus email/Apple
  (DECISIONS #1).
- `src/routes/+page.server.ts` — root redirect logic (replace placeholder page): no session →
  `/login`; no member → `/onboarding`; else `/home`.
- `scripts/seed.ts` + `npm run db:seed` — dev-only: creates a demo household (two members
  bound to the dev's real user after first login — simplest: seed takes the signed-in user's
  email as arg), default stores, a few tasks/recipes/items so later plans have data. Document
  usage in the script header.
- Verify Better Auth tables match the installed version (`npx @better-auth/cli generate`
  diff — reconcile schema + migration if drift).

## Acceptance

- [x] `npm run dev` → `/` redirects to `/login`; Google sign-in completes; user row exists.
      _(`/` → `/login` verified; the button reaches Google's consent screen — "Weiter zu
      Choreganized" — so client id/secret/redirect are right. **Entering Google credentials is
      the owner's step**, see "Left for you" below. The session→user→member pipeline was verified
      end-to-end with a throwaway local account instead.)_
- [x] Signed-in without membership → `/` redirects to `/onboarding` (404 page is fine until 01).
- [x] Migrations run automatically on boot against a fresh `data/` dir.
- [x] `requireMember` used from a scratch route returns typed member or redirects.
- [x] `npm run check` && `npm run build` clean.

Out of scope: onboarding screens (01), tab shell (02), push (05).

## Session notes (2026-07-22)

**Schema drift found and fixed** (→ DECISIONS #23, migration `0001_keen_chimera`): the auth
tables were written with second-precision `timestamp`, the installed Better Auth (1.6.23)
generates `timestamp_ms`; `verification` was also missing NOT NULL on its timestamps and an
index on `identifier`. The CLI can't read `auth.ts` directly ($app/$env don't resolve outside
Vite) — the procedure that does work is written up in DATA-MODEL.md.

**How it was verified without a Google round-trip:** `emailAndPassword` was switched on
temporarily to mint a real Better Auth session with curl, which exercised the drizzle adapter's
writes (user/session/account), the cookie, `handle`'s session→member query and both guards;
then it was switched back off, the scratch route deleted and `data/` wiped. Sequence checked:
anonymous → `/login`; signed in, no member → `/onboarding`; after `db:seed` → `/home`;
`/login` while signed in → `/`.

**Deviations:** the Google button keeps Google's own styling and the footer copy changed
(→ DECISIONS #24) — both fall out of the Google-only decision. No UI primitives were added to
`lib/components/ui`; the login button is one-off and scoped, plan 02 still owns the primitives.

**Left for you:** sign in with Google once (`npm run dev` → `/login`) — that's the only step
that needs your credentials — then `npm run db:seed -- <your-google-address>` for demo data.
