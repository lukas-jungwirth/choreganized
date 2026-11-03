# 34 · Admin mode: stats and the raccoon picker

**Status: done (2026-11-03).** Depends on: 00 (auth), 10 (Settings).
SPEC: §12. Decisions: #227, #228.
Design: no frame (#228). Built from the settings subpage's parts.

**Goal:** Lukas, and only Lukas, can look deeper into the running app: how many households use
it and which, and every raccoon Home can show, on demand. Who is an admin is decided on the
server, from a verified email on `ADMIN_EMAILS`; nobody else can see or reach any of it.

## Build

- `lib/server/admin.ts`: `isAdmin` (verified email on the list; unverified only in E2E mode),
  `adminMode` (admin **and** the `admin_mode` cookie), enter/leave set and clear the cookie.
- `lib/server/guards.ts`: `requireAdmin`, a 404 outside admin mode.
- `lib/server/services/admin.ts`: `getAdminStats`, the one cross-household read: totals,
  households active in 7/30 days, new households and accounts per week (12), and per household
  its name, members, created and last active.
- `(app)/+layout.server.ts` returns `adminMode`, a boolean only.
- `(app)/settings`: seven taps on Version post `?/enterAdmin` (404 for non-admins, swallowed);
  an Admin row in About; "Leave admin mode" (`?/leaveAdmin`) at the bottom.
- `(app)/admin`: the stats page.
- `(app)/home`: `?raccoon=` overrides the pose in admin mode only; `RaccoonPoke` takes
  `onpick`, which opens `home/RaccoonPicker` (a dynamic import) instead of poking.
- Copy in `en.ts`/`de.ts` (`admin.*`, `home.raccoonPicker.*`); `ADMIN_EMAILS` in
  `.env.example`; the e2e server lists both seeded accounts.

## Acceptance

- [x] Unset `ADMIN_EMAILS`: nobody gets admin mode.
- [x] An admin taps Version seven times: "Admin mode on", and an Admin row appears.
- [x] `/admin` shows the counts, the weekly bars and the households, without content.
- [x] In admin mode a tap on Home's raccoon opens the picker; a pick shows that raccoon on
      Home, and "Back to today's raccoon" restores the day's.
- [x] "Leave admin mode" turns it off; `/admin` is a 404 again.
- [x] A non-admin: seven taps do nothing visible, `/admin` is a 404 even with a forged cookie,
      `?raccoon=` is ignored, and the raccoon still pokes.

## Tests

- Unit: `lib/server/admin.test.ts` (the list, case, blanks, verification, E2E).
- Integration: `tests/integration/admin-stats.test.ts` (active windows, last activity, weeks).
- Convention: `guards.test.ts` "every admin server file calls requireAdmin".
- E2E: `tests/e2e/admin.spec.ts` (an admin's round trip; a non-admin gets nothing).
- Visual: `admin`, `admin-dark`, `home-raccoon-picker` (counts and households masked).

## Deploy

Set `ADMIN_EMAILS` on the test and prod environments in Coolify (Lukas's Google address).
