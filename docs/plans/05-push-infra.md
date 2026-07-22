# 05 · Push infrastructure

**Goal:** working Web Push end to end on Android PWA + desktop: service worker, subscription
lifecycle, send module with pruning, per-member prefs respected, a test notification, and the
shopping-add event notification. After this plan, 06 and 08 only _call_ `push.ts`.

Depends on: 02 (03 for the shopping event call site). Design: toast in [4e], lock screen in
[7h·2]. SPEC: [§3.5](../SPEC.md#35-notifications), ARCHITECTURE.md → "Notifications".

## Build

- `src/service-worker.ts` — hand-written per ARCHITECTURE.md: `install/activate` minimal
  precache of `build`/`files` + old-cache cleanup; `fetch` network-first for navigations with
  offline fallback notice; `push` → parse `{title, body, tag, url, renotify, vibrate?}` →
  `showNotification` (icon/badge from static icons — add simple placeholder PNGs now, real
  icon set in 11); `notificationclick` → focus existing client + `client.navigate(url)`, else
  `openWindow(url)`.
- `lib/server/push.ts` — `webpush.setVapidDetails` from env;
  `sendToUser(userId, payload)` / `sendToMembers(householdId, payload, {except?, pref?})`
  querying subscriptions (+ member pref column when `pref` given); 404/410 → delete
  subscription row; all errors caught & logged (fire-and-forget contract).
  Implement `notifyShoppingAdd` (coalesce: skip if same member sent one <15 min ago —
  in-memory map is fine) with copy "🛒 {member} added {n} items to the list", pref
  `notifyShoppingUpdates`, `except` the actor.
- `api/push/subscribe/+server.ts` — POST upsert by endpoint (userId from session), DELETE
  removes; validates payload shape.
- `lib/components/EnablePush.svelte` + client helper (`lib/push-client.ts`):
  permission state machine (unsupported / denied / prompt / subscribed), subscribes via
  `registration.pushManager.subscribe({userVisibleOnly, applicationServerKey})` (urlBase64→
  Uint8Array helper), posts to the API. Surfaced: one-time gentle prompt card on Home after
  onboarding + the real home in **Settings → Notifications** (10 wires the toggles; render
  this component standalone on `/settings` now if 10 hasn't landed — keep it importable).
- "Send test notification" action (Settings/dev) — round-trips a push to yourself.
- `lib/server/cron.ts` — ensure the minute-tick registry from 00/03 is production-ready
  (started once in `init`, per-job try/catch + log): 06/08 add jobs here.

## Acceptance

- [~] Subscribe on desktop Chrome + Android Chrome (via `npm run dev -- --host` or deployed);
  rows appear per device; unsubscribe removes.
- [~] Test notification arrives with app closed (Android: lock screen like [7h·2]); tapping
  opens the app at the payload URL.
- [x] Shopping add by member A notifies member B (pref on), not A; pref off → nothing;
      second add within 15 min coalesced.
- [x] Stale subscription (force a bad endpoint in dev) is pruned on send.
- [x] `npm run check` && `npm run build` clean (SW builds without type errors).

Out of scope: task reminder & timer jobs (06/08), final icon art (11).

## What was verified, and how (2026-07-22)

The agent's browser (Electron/Chromium) answers `Notification.permission` with `denied` and
never prompts, so **no real device subscription could be created**. Everything on this side of
that line was exercised against a running dev server; the two `[~]` boxes need a human pass on
desktop Chrome and an Android phone.

Verified:

- **Subscription API** — POST without a session → 401; missing `keys` → 400; a non-https
  endpoint → 400; valid → row. Re-POSTing the same endpoint with rotated keys updates the one
  row (upsert on the unique index) rather than colliding. DELETE removes it, a second DELETE
  answers `removed: false`, and DELETE of another user's endpoint refuses.
- **Send path, end to end** — with fake devices (real P-256 keypairs) pointed at a stand-in
  push service, the decrypted request body is exactly `PushPayload`:
  `{"title":"🛒 Lukas added 1 item to the list","tag":"shopping-add-{memberId}","url":"/shopping"}`,
  `TTL: 43200`, aes128gcm, VAPID `Authorization` present. The test notification arrives as its
  own payload with `TTL: 60`.
- **Shopping semantics** — pref off: nothing sent. Pref on: one request to the housemate,
  none to the actor. Two further adds seconds later: nothing (coalesced).
- **Pruning** — a 410 deletes the row and logs it; so does a 404 from **real FCM** for a bogus
  registration id, which also proves Google accepts the VAPID JWT (a bad signature would be
  403, and nothing was pruned on that path).
- **Service worker** — registers and activates in dev, controls the page, precaches
  `build` + `static/` (the three icons + robots.txt in dev, where `build` is empty), deletes
  the previous version's cache when a new worker activates, and serves the offline notice for
  a navigation with the server stopped.
- **UI** — Settings' Notifications block renders the `denied` state with its explanation and
  the test action reports "Sent to this device"; Home's prompt card correctly renders nothing
  when permission is denied; `Banner`'s new acting/dismissable form works in `/dev/kit`.

Not verified (needs a browser that allows notifications): the permission prompt, a real
`pushManager.subscribe`, notification display, and `notificationclick` focus/navigate.
