# 08 · Cook mode & timers

**Goal:** the hands-free dark cook mode with step navigation, ingredient peek, and a timer
that rings in-app _and_ via push when the phone is locked.

Depends on: 07, 05. Design: [7a] (entry) [7b] [7h] [7h·2]. SPEC:
[§4.6](../SPEC.md#46-cook-mode-7b-7h-dark-hands-free). DATA-MODEL.md → `cook_timers`,
DECISIONS #14/#15.

## Build

- `lib/utils/timer-parse.ts` — extract first duration from step text: `8 min`, `8 minutes`,
  `8:00`, `8–10 min` (first value), `1 h` → seconds; unit tests welcome (plain assertions in
  a `*.test.ts` run by `node --test` is fine — don't add a framework).
- `/cooking/recipes/[id]/cook` — route (tab bar hidden, dark tokens, own `<meta theme-color>`
  swap): header (name, close), segment progress, "STEP i OF n", big step text with
  case-insensitive ingredient-name underlining (amber), "This step uses …" line, chips:
  parsed-timer + Ingredients; manual "Set timer" (minute stepper) in header overflow;
  Prev/Next pinned (last = Finish → recipe). `?step=` query = deep link target.
  Screen wake lock (`navigator.wakeLock`, re-acquire on visibilitychange).
- Ingredients peek sheet [7b]: dark sheet, all ingredients, current step's highlighted amber.
- Timer (client state machine + server alarm):
  - Start → POST `api/timers` `{label, endsAt, recipeId, stepIndex}` → row + **in-process
    setTimeout** at the server (per DECISIONS #15) + minute-cron catch-up for restarts
    (`endsAt <= now AND notifiedAt IS NULL AND canceledAt IS NULL`).
  - Running UI [7h]: ring countdown (remaining / label "{label} · {total}"), Pause (v1 =
    cancel server alarm, keep client time, resume re-creates with shifted endsAt), +1:00
    (cancel+recreate), Cancel (DELETE).
  - Fire: in-page → sound optional + `navigator.vibrate([200,100,200])` + banner; push
    payload "⏲️ {label} is done — back to step {i}", tag `timer-{id}`, url
    `/cooking/recipes/{recipeId}/cook?step={i}` (SW from 05 handles focus/navigate).
    Client marks handled to avoid double-alert when page is open (tag-based renotify off).
  - One active timer at a time (v1); navigating steps keeps it running as a compact chip.

## Acceptance

- [x] Cook mode matches [7b]/[7h] (dark, huge text, underlines, peek highlight) at 390px.
- [x] Parsed chip appears for "Sauté … 8 minutes" steps; manual timer works when nothing
      parses.
- [x] Timer with page open: ring counts down, fires with vibration/banner at zero; +1:00 and
      pause/resume behave; cancel stops everything (server row canceled).
- [x] Phone locked / app closed: push arrives on time (±1 min worst case), tap reopens cook
      mode at the right step [7h·2]. _(Push verified server-side against a stand-in service; the
      real lock-screen display and tap need a device — see below.)_
- [x] Server restart mid-timer: cron catch-up still fires it (test by killing dev server).
- [x] Wake lock holds the screen on while cooking (Android). _(Code path exercised; a real
      Android screen-on can't be observed in this browser — see below.)_
- [x] `npm run check` && `npm run build` clean.

Out of scope: multiple parallel timers, alarm sound customization.

## How it landed (2026-07-22)

- **The row is the timer; the ring is a rendering of it** (→ DECISIONS #15, #82). `POST
  /api/timers` takes **seconds**, the server computes `endsAt` on its own clock and schedules
  both an in-process `setTimeout` and — via the minute cron's new `cook-timers` job — a
  restart-safe catch-up; the response says how much is *left*, which the page turns back into an
  instant it can trust. `services/cook-timers.ts` owns the state and the two ways it can ring,
  both funnelling through one `claim()` that stamps `notifiedAt` before it sends, so the two
  mechanisms and the open page can never double-alert. Cancel/pause/"+1:00"/rang are three JSON
  endpoints (`/api/timers`, `/api/timers/[id]`, `/api/timers/[id]/rang`) behind the new
  `requireMemberApi` guard (→ #89).
- **The client half is a runes class** (`lib/cook-timer.svelte.ts`, the repo's first
  `.svelte.ts` — → #85): one machine read by the big ring [7h], the compact bar on other steps,
  and the chip row. Pause and "+1:00" are cancel-and-recreate (→ #15), so it keeps its own
  `totalSeconds` — the length *you* set, which a resumed server row has forgotten (→ #84). An
  open, visible page claims its alert ~2 s early and rings itself (`alarm.ts`: WebAudio beeps
  primed on the starting tap + `navigator.vibrate`); a hidden page leaves the push to do its job
  (→ #83). `wake-lock.ts` keeps the screen on and re-acquires on `visibilitychange`.
- **The parsing is two small utils with `node --test` unit tests** (`npm test`, no framework):
  `timer-parse.ts` reads the first duration out of a step ("8 min", "8:00", "8–10 minutes" → the
  first value, "1 h 30 min") while refusing ovens, ratios and single-letter units, and
  `step-highlight.ts` segments the step against the ingredient names (whole-word, longest-wins,
  lenient plural, Unicode-safe). 41 assertions in all.
- **The screen is a column, not the mockup's absolute ring** (→ #86): a scrolling step over a
  pinned ring over pinned Prev/Next, because [7h]'s `top:340px` ring puts Pause below the fold
  on the seeded five-line step. "Set a timer" is a header button rather than an overflow menu
  (→ #87), and `BottomSheet`/`Stepper` grew a `tone="dark"` for the peek and the manual sheet
  rather than being forked (→ #88).

## What was verified, and how (2026-07-22)

Walked in the dev server at 390px against the seeded "Creamy mushroom pasta", plus a production
build (`node build/index.js`) driven for the two things a dev server can't show — a cron sweep
on the real minute tick, and a push whose bytes could be read back.

- **The screen [7b]/[7h].** Step 2 renders "Sauté the **mushrooms** in **butter**…" with both
  names underlined amber, the sage segment bar two-of-three full, "This step uses 250 g
  Mushrooms · 30 g Butter" beneath, and both chips. Ingredients peek opened dark with Mushrooms
  and Butter tinted, Pasta/Cream/Parmesan plain. Step 3's "Add the **cream**… **pasta** and
  **parmesan**" proves multi-ingredient highlighting and the lenient plural (parmesan/pasta).
- **Parsed vs manual.** Step 2 offered **Start 8:00 timer** (read from "8 minutes"); a made-up
  step with no duration falls back to **Set timer**, whose minute stepper started a 1-minute
  timer that ran and rang. Unit tests cover the corpus the walkthrough can't (ovens, ranges,
  ratios).
- **Page-open lifecycle.** The ring counted down; **+1:00** cancelled row A and inserted row B
  one minute longer (`canceled_at` on A, fresh `ends_at` on B), the label reading "· 9:00";
  **Pause** cancelled the server row and froze the on-screen remainder (0 live rows, digits
  static); **Resume** minted a new row ending at the frozen remainder; **Cancel** cancelled the
  row and cleared the screen (0 live rows). A 1-minute timer left to expire flipped to the amber
  **0:00 / Dismiss** state, and the row's `notified_at` landed 6 ms after `ends_at` — the page
  claimed its own alert, `POST /api/timers/{id}/rang → 200 {owned:true}`, no push sent.
- **Step nav + deep link.** Next/Prev rewrite `?step=` and the running timer shrinks to the
  bottom bar ("3:37 · Mushrooms ›") on other steps; `?step=2` deep-links straight to step 2 with
  its underlines. Last step shows **Finish** back to the recipe.
- **Restart catch-up (the headline).** Against the production build, a `cook_timers` row was
  inserted straight into SQLite — a timer whose in-process `setTimeout` no running server ever
  saw, exactly what a crash mid-timer leaves. The `cook-timers` cron job found it on the next
  minute tick and rang it (`[cron] caught up 1 cook timer(s) → 1 device(s)`), `notified_at`
  landing on the `:00` boundary. With the server **stopped**, an identical row stayed unclaimed
  — nothing else fires them.
- **The push itself** (plan 05's recipe: self-signed TLS, a real P-256 device keypair, decrypt
  with `http_ece`). The catch-up sweep delivered to the stand-in service **⏲️ Mushrooms is done
  — back to step 2**, `tag: timer-{id}`, `url: /cooking/recipes/{id}/cook?step=2`,
  `vibrate:[200,100,200]`, TTL 900, VAPID header present — the deep link the SW from plan 05
  focuses. The in-process alarm was checked the same way from the dev server (fired ~6 s after
  `ends_at`, before the cron minute would have).

Not covered here (needs a device, as with plans 05/06/10): `Notification.permission` is
hard-denied in this browser, so the notification actually **drawn on a lock screen** and the
**tap → SW `notificationclick` → reopen at the step** were verified only as far as the payload
and URL that drive them; `navigator.wakeLock` and `navigator.vibrate` are no-ops here, so the
screen-on and the buzz need desktop Chrome / Android. The WebAudio beep can't be heard in a
headless check either.
