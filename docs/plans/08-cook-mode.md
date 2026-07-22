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

- [ ] Cook mode matches [7b]/[7h] (dark, huge text, underlines, peek highlight) at 390px.
- [ ] Parsed chip appears for "Sauté … 8 minutes" steps; manual timer works when nothing
      parses.
- [ ] Timer with page open: ring counts down, fires with vibration/banner at zero; +1:00 and
      pause/resume behave; cancel stops everything (server row canceled).
- [ ] Phone locked / app closed: push arrives on time (±1 min worst case), tap reopens cook
      mode at the right step [7h·2].
- [ ] Server restart mid-timer: cron catch-up still fires it (test by killing dev server).
- [ ] Wake lock holds the screen on while cooking (Android).
- [ ] `npm run check` && `npm run build` clean.

Out of scope: multiple parallel timers, alarm sound customization.
