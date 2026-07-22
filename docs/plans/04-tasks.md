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

- [ ] Create each repeat type + one-off (dated & undated); sections and meta strings match
      SPEC examples; Anyone shows dashed avatar.
- [ ] Complete recurring: history row, next due = today+interval, rotation advances, flags
      reset, modal shows correct next-turn + standings; **Undo restores everything** (verify
      due date, assignee, flags, deleted history row).
- [ ] Complete one-off: task gone, history row remains.
- [ ] Skip advances due + rotation, 0 points, no history-feed entry (check via DB).
- [ ] Snooze presets & pick-a-date reset flags; away mode pauses overdue rendering + shows
      banner for the other member; away member's tasks never in "Overdue".
- [ ] Overdue badge on tab + Home banner correct for the signed-in member (incl. Anyone tasks).
- [ ] Empty state starters create the documented tasks.
- [ ] `npm run check` && `npm run build` clean; frames match [05][4a][4b][4c][4d][7f].

Out of scope: pushes (06), History tab content (09).
