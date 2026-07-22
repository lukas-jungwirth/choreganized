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

- [ ] Dev-clock test (temporarily set a task due today, force-run the job fn directly):
      due nudge arrives once; rerunning the tick sends nothing more.
- [ ] Overdue task (dueDate yesterday) gets exactly one overdue nudge the next tick ≥08:00.
- [ ] Away member gets neither; Anyone-task nudges every opted-in member; pref-off member
      skipped.
- [ ] Snoozing after a nudge re-arms both flags (next due date nudges again).
- [ ] Restart mid-morning: no duplicate sends (flags), no missed sends (first tick catches up).
- [ ] `npm run check` && `npm run build` clean.

Out of scope: any new UI (badges/banners shipped in 04).
