# 04 · Tasks core

**Goal:** the heart of the app: recurring chores with points — list with states, create/edit,
complete with celebration + undo, snooze/skip/reassign, rotation, holiday pause, empty state
with starters. (Reminders are plan 06; History tab is plan 09 — the segmented control exists
now, History segment can link to a stub.)

Depends on: 02. Design: [05 main] [3b] [4a] [4b] [4c] [4d] [7f]. SPEC:
[§5.1–5.5, 5.7](../SPEC.md#5-tasks-tab). Read DATA-MODEL.md → "tasks" carefully — the
lifecycle algorithms (completion, rotation, undo, next-due) are specified there.

## Build

- `lib/utils/dates.ts` — household-local helpers: `todayIn(tz)`, date-string compare/diff,
  `addInterval(dateStr, n, unit)` (date-fns on parsed calendar date), `formatDueMeta` →
  "due today"/"due tomorrow"/"in 2 days"/"3 days overdue"/"Sat"/"Jul 14".
- `lib/server/services/tasks.ts` — list (sectioned: overdue/today/upcoming/undated, away-aware),
  create/update/delete, `completeTask` (tx per DATA-MODEL; returns undo snapshot),
  `undoCompletion`, `skipTask`, `snoozeTask`, `reassignTask`, `setAway(memberId, until|null)`,
  member month-points helper (reused by 09).
- `/tasks` page: points tiles ×members, segmented To do/History, holiday banner [4a], sections
  with row design (red-border overdue card + reminder footer), FAB, "Recent history" preview
  block (last 3 completions + explainer copy), empty state [7f] with the three starters
  (DECISIONS #22) creating real tasks on tap.
- Sheets: `TaskFormSheet` [3b] (name, assignee chips + Anyone, rotate toggle w/ member-order
  caption, repeat select incl. custom interval, first-due picker, effort chips 5/10/20/40),
  `TaskDetailSheet` [4b], `SnoozeSheet` [4c] (presets + date + **Going away?** toggle w/
  return-date picker), `TaskDoneModal` [4d] (points chip, next-due line for recurring,
  standings line from month-points, Undo).
- Check-circle on rows completes directly (optimistic) and pops the done modal.
- Home integration: overdue banner + due-today tile now real (extend `services/home.ts`);
  Tasks tab badge count in `(app)/+layout.server.ts`.
- Reminder-footer copy ("reminded yesterday & this morning") derives from the two flag
  columns — render whatever is set, omit when none.

## Acceptance

- [x] Create each repeat type + one-off (dated & undated); sections and meta strings match
      SPEC examples; Anyone shows dashed avatar.
- [x] Complete recurring: history row, next due = today+interval, rotation advances, flags
      reset, modal shows correct next-turn + standings; **Undo restores everything** (verify
      due date, assignee, flags, deleted history row).
- [x] Complete one-off: task gone, history row remains.
- [x] Skip advances due + rotation, 0 points, no history-feed entry (check via DB).
- [x] Snooze presets & pick-a-date reset flags; away mode pauses overdue rendering + shows
      banner for the other member; away member's tasks never in "Overdue".
- [x] Overdue badge on tab + Home banner correct for the signed-in member (incl. Anyone tasks).
- [x] Empty state starters create the documented tasks.
- [x] `npm run check` && `npm run build` clean; frames match [05][4a][4b][4c][4d][7f].

Out of scope: pushes (06), History tab content (09).

## Session notes (2026-07-22)

Walked at 390×844 against [05]/[3b]/[4a]/[4b]/[4c]/[4d]/[7f] and on a 1280px window (centred
column, tab bar and FAB on the column), signed in as Lukas with `npm run db:seed` data, checking
the DB after every mutation.

The seeded list rendered every meta string SPEC §5.1 names, unchanged: "Monthly · 3 days
overdue" on a red-edged card, "Weekly · due today" in terracotta, "Every 2 weeks · in 2 days",
"One-off · Sun", "One-off · added by Elisabeth" under **No date**, and the Anyone task with the
dashed avatar. **Completed** the overdue monthly rotating one from its check circle: history row
written, `due_date` → today + 1 month (Aug 22), assignee rotated Elisabeth → Lukas, both reminder
flags NULL, and [4d] said "Next due Aug 22 · Rescheduled · Lukas's turn next" over "You're now
leading 60 – 30" with the tile agreeing. **Undo** put all four back — due date Jul 19, assignee
Elisabeth, both flag timestamps, completion row gone. **Completed a one-off**: task row deleted,
history row kept (its `task_id` nulled by the FK, as designed); Undo re-inserted the row under
its original id with every column intact. **Skipped** the rotating monthly: due advanced,
rotation advanced, `points 0 / action 'skipped'`, no points on the tile and no row in the
history preview. **Snoozed** by preset: `due_date` → today + 7, both flags cleared. **Edited**
the due date into the past: the flags reset (the card's footer dropped "reminded …" and kept
"It's your turn"), the tab badge went to 1 and Home's banner read "1 task overdue · Change the
bedsheets · your turn" with "2 tasks due today". **Away**: the info banner appeared, the two
tasks of Lukas's that had come due moved to **Paused** reading "paused until Jul 29", Overdue
emptied, the badge cleared; turning the toggle off submitted itself and everything came back.
**Created** a custom recurrence (Lukas, every 3 weeks, rotate, Large) and an undated one-off
(Anyone) — both stored exactly as entered. **Reassigned** an Anyone task to Elisabeth, and
**deleted** three tasks through the confirm raised inside the sheet.

**All three empty-state starters** were tapped and each created the task DECISIONS #22
documents: bins Weekly/5, bedsheets Monthly/10, bathroom Every-2-weeks/20 — Anyone, first due
today. The empty state needs an empty `tasks` table, so it was reached with a scratchpad
save/restore harness (dump every task row plus every `task_completions.task_id` link to JSON,
clear, walk, restore); the DB came back byte-for-byte, history links included.

**Not verified:** nothing in this plan's scope. The reminder-footer copy was exercised with the
seed's flags ("reminded Jul 19 & Jul 20") but not with flags set yesterday/this morning, which
is the exact wording [4a] draws — plan 06 sets those flags for real. `npm run check` and
`npm run build` are clean.

**Two bugs found by walking it**, both in plan 02's shared kit and both fixed here:

1. **A toggle could be switched on but never off.** The knob's `transform` paints it above the
   invisible checkbox, so a tap in the centre of the control hit the knob and did nothing
   (→ [#51](../DECISIONS.md)). Would have hit every notification preference in plan 10.
2. **Escape stopped working in a sheet that had posted.** A form action that re-renders its own
   submit button drops focus to `<body>`, and the handler lived on the dialog
   (→ [#52](../DECISIONS.md)).

**Deviations** (all logged in [DECISIONS.md](../DECISIONS.md) #47–#54)

- **A fifth section, "Paused"**, and `paused` means "away _and_ already due" → #47. An away
  member's future tasks stay in Upcoming, undated ones are never paused, and "Overdue · n" never
  counts something nobody is expected to do.
- **Undo posts its snapshot back** rather than the server remembering it → #48.
- **"Skip this time" is hidden on one-offs** → #49; delete is the row below it.
- **The due-meta scale** (count days → name the day → give the date) is inferred from [4a]
  drawing both "in 2 days" and "Sat" → #50.
- **New-task defaults** are Anyone · every week · today · Medium, not [3b]'s example values →
  #54.
- `SegmentedControl` gained a link mode and `DateField` is new → #53. The "Recent history"
  preview tints its check circles by member like Home's feed [8b] rather than the flat sage
  [05] draws — same event, same wash (→ #35).
- `home.ts`'s standings now read `monthPointsByMember` from `services/tasks.ts` instead of
  keeping their own `GROUP BY`, so the Tasks tiles and Home's strip can't disagree about what
  somebody scored this month.

## Review pass (2026-07-22)

Nine findings; the seven worth changing are fixed and re-walked in the browser:

- **`readNumber`'s fallback was dead for the case it existed for.** `Number(null)` and
  `Number('')` are both a perfectly finite **0**, so a POST without a `points` field created a
  task worth nothing instead of a Medium one. Absence is tested before coercion now.
- **Undoing a one-off reset its `createdAt`.** The row came back with today's stamp and jumped
  to the bottom of "No date" — an undo that quietly reorders the list. `TaskSnapshot` carries
  `createdAt` now; verified the restored row keeps its original millisecond.
- **A failed undo closed the celebration anyway**, so a rejected snapshot looked exactly like a
  successful revert while the points stayed awarded. The modal now keeps its place and says why.
- **`?/snooze` and `?/undo` returned error copy no screen could render** — neither sheet read
  `result.data.error`. Both surface their own failure now, the way `TaskFormSheet` already did.
- **Editing could silently switch rotation off.** The "Alternate each time" toggle was gated on
  having somebody to alternate _with_, so in a household that had shrunk to one member the
  control vanished — and an absent checkbox posts nothing, which reads as "off". It's gated on
  "a member is selected" now, which is what SPEC §5.2 actually says; only the caption depends on
  the roster size.
- **`/dev/kit` resolved `Intl`'s timezone at component top level**, i.e. the server's zone during
  SSR and the browser's on hydration. `today` comes from its load now.
- **`TaskList.overdueCount` was computed and exported with no consumer** — and dangerously
  named, since the tab badge's count is a _different_ number (this member's, not the
  household's). Removed, with a note on the type saying why there isn't one.

Reported, deliberately not changed: `memberStanding` re-derives the month ranking `home.ts`
already does, but the two answer genuinely different questions (head-to-head "leading 60 – 30"
vs competition rank "1st this month"), and collapsing them would flatten one of the two.
