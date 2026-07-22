# 06 · Task reminders

**Goal:** the gentle nudge lifecycle from [4e]: one push the morning a task is due, one the
morning after it slips, then silence (badge/banner only). Idempotent across restarts.

Depends on: 04, 05. Design: [4e]. SPEC: [§5.6](../SPEC.md#56-reminders-4e-full-lifecycle--a-quiet-nudge-never-a-red-alert-storm),
DATA-MODEL.md → "Reminder time-sweep" (the exact algorithm — implement it as written).

## Build

- `lib/server/cron.ts` — add the reminder job to the minute tick:
  - Iterate households (they're few); compute `localNow`/`localToday` via `Intl` in
    `household.timezone`; gate on `>= 08:00` local.
  - **Due nudges:** tasks `dueDate == localToday AND dueReminderSentAt IS NULL` → send + set
    flag (same tx/statement batch to avoid double-send races — single process, so a plain
    update-after-send is acceptable; set the flag _before_ sending to be safe, log failures).
  - **Overdue nudges:** `dueDate < localToday AND overdueReminderSentAt IS NULL` → same.
  - Recipients: assignee only (skip if away — `awayUntil >= localToday`; skip if pref off);
    Anyone → all members (per-member pref/away checks). Copy per SPEC 5.6 with task-emoji
    heuristics optional — keep "☑️ {task} is due today — your turn" / "{task} is overdue —
    it's your turn". Payload tag `task-due-{id}` / `task-overdue-{id}`, url `/tasks`.
- Flags are already reset by 04's complete/skip/snooze/edit paths — verify each (add a
  regression note if a path misses it).
- Extend the seed script with backdated tasks to exercise both nudges.

## Acceptance

- [x] Dev-clock test (temporarily set a task due today, force-run the job fn directly):
      due nudge arrives once; rerunning the tick sends nothing more.
- [x] Overdue task (dueDate yesterday) gets exactly one overdue nudge the next tick ≥08:00.
- [x] Away member gets neither; Anyone-task nudges every opted-in member; pref-off member
      skipped.
- [x] Snoozing after a nudge re-arms both flags (next due date nudges again).
- [x] Restart mid-morning: no duplicate sends (flags), no missed sends (first tick catches up).
- [x] `npm run check` && `npm run build` clean.

Out of scope: any new UI (badges/banners shipped in 04).

## How it landed (2026-07-22)

- **`lib/server/services/reminders.ts`** is new: `sendTaskReminders(householdId, today, now)`,
  the household-scoped half — pending occurrences, audience, claim, copy. `cron.ts` keeps the
  loop, the household clock and the 08:00 gate, exactly the shape `shopping-cleanup` already
  had (`purgeCheckedItems(householdId, cutoff)`), and adds one registry line. It calls nothing
  but `sendToUser` from `push.ts`, as plan 05 promised.
- **Claim, then send** — `UPDATE … SET flag = now WHERE id = ? AND flag IS NULL`, and only
  send when it changed a row. The whole loop is synchronous (better-sqlite3), so every flag is
  written before the first byte leaves; `noOverlap` on the schedule plus the conditional
  update means two sweeps can never both nudge.
- **Deviations, both logged**: a holiday leaves the flag NULL so the nudge waits for the
  member's return, while a switched-off toggle claims it (→ DECISIONS #60); the overdue line
  carries a keyword-matched emoji as [4e] draws it, and an unassigned task reads "anyone can
  pick this up" rather than "your turn" (→ DECISIONS #61).
- **04's reset paths, all five re-read** (`services/tasks.ts`): `logTaskAction` clears both
  flags on the rescheduled occurrence (a completed one-off is deleted outright);
  `undoCompletion` restores the snapshot's flags, including the NULLs; `snoozeTask` clears
  both; `updateTask` clears both only when the edit moved the due date, which is right — a
  rename shouldn't re-nudge. `reassignTask` deliberately keeps them (plan 04's call, still the
  right one): the occurrence hasn't changed, so a task handed over after the morning nudge
  reaches its new owner in the next day's overdue nudge rather than in a second push. No path
  misses a reset.
- **Seed**: "Clean the fridge" (unassigned, due yesterday, due-nudge already spent) joins
  "Water the plants" (due today, unnudged) so both nudges are walkable straight after
  `npm run db:seed`, and "Change the bedsheets" (both flags set) proves the silence after them.
- **Two behaviours worth knowing, both straight out of the algorithm as written.** The gate is
  `>= 08:00` with no upper bound, so a task _created_ at 21:00 and due that day is nudged a
  minute later rather than the next morning — that open-ended window is exactly what lets a
  server that was down until 13:45 still deliver the morning's nudges. And nothing caps how
  many nudges one sweep sends: a member back from three weeks away can meet one push per
  overdue chore in the same minute. Neither is worth solving before the app has been lived in
  — if the second one bites, coalesce per member the way `notifyShoppingAdd` already does
  (→ DECISIONS #58), rather than by suppressing individual chores.

## What was verified, and how (2026-07-22)

Against a **production build** (`npm run build`, then `node --env-file build/index.js`) — the
cron only registers in a fresh process, since `init` runs once and `registerCronJobs`
self-guards, so a dev server that is already up never picks up a new job. **No clock was
faked**: every line below is a scenario set up in the database, one real minute tick waited
out, and the notification read off a stand-in push service (plan 05's recipe — self-signed
TLS, real P-256 device keypairs for both housemates, `http_ece` to decrypt), so every quoted
string is the payload as it left the machine.

The seeded household (Lukas + Elisabeth, Europe/Vienna, a device each) from 17:28 local:

- **First tick: three nudges, four devices** — `[cron] 3 task reminder(s) … → 4 device(s)`,
  longest-overdue first: `🛏️ Change the bedsheets is overdue — it's your turn` (Lukas, was due
  Jul 20), `🧊 Clean the fridge is overdue — anyone can pick this up` (unassigned → both), and
  `☑️ Water the plants is due today — your turn` (Lukas, due Jul 22). Every request carried the
  12 h TTL (43200), `aes128gcm`, a VAPID `Authorization` header, `url: /tasks` and the tag
  `task-due-{id}` / `task-overdue-{id}`. Tasks due Jul 23–29 and the undated one-off were
  untouched, and the bedsheets kept its NULL `dueReminderSentAt` — a due morning two days gone
  is not owed retroactively.
- **The next two ticks sent nothing.** The flags are the entire idempotency story.
- **Holiday pause.** With Lukas away until today and both overdue flags cleared: his bedsheets
  nudge was not sent **and its flag stayed NULL**, while the unassigned fridge nudge still went
  to Elisabeth alone and claimed its flag. Clearing `awayUntil` delivered the deferred nudge on
  the very next tick — one push, `🛏️ … it's your turn` (→ DECISIONS #60).
- **Preferences.** `notifyOverdueNudges` off for Elisabeth and `notifyTaskReminders` off for
  Lukas: the unassigned overdue nudge reached Lukas only, and the due nudge for a task assigned
  to Lukas sent **nothing at all yet claimed its flag** — so it doesn't come back a minute
  later.
- **Snooze re-arms.** POSTing the app's real `?/snooze` action as the signed-in member (session
  cookie, `HTTP 200`) cleared both flags on a task that had already been nudged; the next tick
  re-sent `☑️ Water the plants is due today — your turn` and re-claimed the flag.
- **The 08:00 gate is the household's clock, not the server's.** With the household moved to
  `Pacific/Honolulu` (05:37 there, same calendar date) and a due nudge pending, the tick sent
  nothing and left the flag NULL; moving it back to `Europe/Vienna` (17:38) sent it on the next
  tick.
- **Restart mid-morning.** Stopped the server, cleared one overdue flag while it was down
  (a nudge owed during the outage), started it again: the first tick sent exactly that one
  nudge and nothing else — no duplicates for the flags set before the restart.

Not covered here (unchanged from plan 05, and still needing a human on a real device): the
browser permission prompt, a real `pushManager.subscribe`, and how the notification actually
looks and behaves on an Android lock screen [4e].
