# 39 · Keep to the schedule: recurring tasks on a fixed day

**Status: todo.** Asked for by Lukas on 2026-11-22: "a checkbox 'always on the day' … for
once a month it could be helpful to have it always on the first Sunday". Depends on: 04, 10
(both done), and the away-return shift from PR #165 (DECISIONS #293).
SPEC: §5.2 (the task sheet), §5.3/§5.4 (done, skip, snooze), §5.8 (the done pop-up) and the
"Completion algorithm" in DATA-MODEL change as described below. Design:
**`design/sketches/task-schedule.html`**, frames **[S1]–[S3]**. Open it in a browser. The
phones work: the sheet drives the pop-up, and the controls under [S2] tick the task off early
or late. The example in it ("Deep clean the kitchen", first due Sun 6 Dec 2026, monthly) is
the seed for the tests.

**Goal:** today the next due date of a recurring task is `completion day + interval`
(`services/tasks.ts`, `addInterval(today, …)`), so it drifts each time someone is late. A task
can now **keep to the schedule** instead: the next date comes from the calendar ("monthly, on
the first Sunday", "monthly, on the 6th", "weekly, Sundays"), not from the day it was done.
Off by default, so every existing task behaves exactly as today.

## What it does

1. **A switch in the task sheet** [S1], under **First due** / **Next due**, in the same
   `--field` box style as "Alternate each time": **Keep to the schedule** (de: **Fester
   Termin**). Shown only when Repeat is weekly or longer (week or month units, any interval).
   One-off and daily have no switch: for them it makes no difference.
   - Sub line, off: "The next one counts from the day it's done."
   - Sub line, on, weekly: "Always on a Sunday, even if it's done late."
   - Sub line, on, monthly: "Done late? The next one stays on its date."
2. **For a monthly task, which day** [S1]: two radio rows under the switch, both read off the
   due date in the field:
   - **on the first Sunday** (`first` … `fourth`, or **last** when the date is in the month's
     last 7 days, so it never needs a fifth week and never skips a month);
   - **on the 6th** ("on the 31st (or the last day)" for the 29th–31st).
     Default: the weekday row. Changing the date in the field relabels both rows.
3. **Coming up** [S1]: a line at the foot of the box. On: the next three dates ("Sun 6 Dec ·
   Sun 3 Jan · Sun 7 Feb"). Off: "First on Sun 6 Dec, then a month after each time it's done."
4. **The meta line names the schedule** [S3]: "Sun 6 Dec · monthly, first Sunday",
   "Tomorrow · weekly, Mondays", "monthly, on the 6th". A task that counts from the last time
   reads as today ("monthly"). Everywhere `m.task.repeat(...)` is called today: `TaskRow`,
   `TaskDetailSheet`, `NextChoreCard` on Home, the custom-repeat hint in `TaskFormSheet`.
5. **The done pop-up** [S2]: "Next due Sun 3 Jan", sub line "On schedule · first Sunday"
   instead of "Rescheduled".

## The rules

**The next date.** With the switch on, done or skipped on `today`, the next due date is the
first date on the schedule that is strictly after **both** `today` and the task's current
`dueDate`:

- Done on the day or late: the next date after the one it was due. Late doesn't move the
  schedule. Due 6 Dec, done 8 Dec → **Sun 3 Jan** (switch off: Fri 8 Jan).
- Done very late, past the next date too: it skips to the next date still ahead. Missed ones
  don't pile up. Due 6 Dec, done 15 Jan → Sun 7 Feb.
- Done early: still the next date after the one it was due. Done Sat 5 Dec → Sun 3 Jan, not
  tomorrow.

**The schedule** is an anchor date plus the repeat:

- Weekly / every N weeks: anchor + k × 7N days.
- Monthly / every N months, by day: the anchor's day of the month, clamped to the end of a
  shorter month and never moved (`utils/dates.ts` `addRepeat` already does exactly this for
  recurring expenses, → SPEC §11.9). 31 Jan → 28 Feb → 31 Mar.
- Monthly / every N months, by weekday: the same nth weekday (or the last one) of every Nth
  month from the anchor's month.

**What is the anchor.** The due date saved with the switch on. Creating a task, or saving the
sheet with a new due date, sets it. Turning the switch off clears it. Changing Repeat keeps
the anchor at the due date in the field.

**Snooze / reschedule** moves only `dueDate`, never the anchor. The time after it is back on
the schedule, by the rule above (strictly after the snoozed date). Snoozing past the next
scheduled date means that one is skipped. Accepted; say so in SPEC.

**Holiday pause** (`settleReturns`) moves `dueDate` only, like snooze. Nothing changes there.

**Rotation, points, reminders, the chore split** are unchanged. The split weighs by unit and
interval as before.

**Undo** of a completion restores the anchor and the "by" with the rest of the snapshot
(`TaskSnapshot`, `parseSnapshot`).

## The model

Two nullable columns on `tasks` (`npm run db:generate`, then DATA-MODEL):

- `schedule_anchor` text, `YYYY-MM-DD`. NULL = counts from the last time (today's behaviour).
- `schedule_by` text enum `'day' | 'weekday'`. Only read for month units; NULL otherwise.

The service refuses an anchor on a one-off or daily task, and `schedule_by` without an
anchor (both NULL then). A task with an anchor whose unit later becomes day or none loses the
anchor in the same update.

The date logic is one pure function in `lib/utils/dates.ts`, beside `addRepeat`:
`nextOnSchedule(anchor, unit, interval, by, after: CalendarDate): CalendarDate`, the first
schedule date strictly after `after`. `completeTask` and `skipTask` call it with
`max(today, dueDate)` when the task has an anchor, and `addInterval` as today when it hasn't.
A small `weekOfMonth(date)` (0–3, or `'last'`) feeds both the function and the labels.

## Copy

New keys in `en.ts`, typed in `de.ts`. Weekday and ordinal are functions so German can decline
them ("am ersten Sonntag", "am 6.", "am letzten Sonntag"). The meta line is a function of
(unit, interval, schedule). Suggested German:

| en                                          | de                                                         |
| ------------------------------------------- | ---------------------------------------------------------- |
| Keep to the schedule                        | Fester Termin                                              |
| The next one counts from the day it's done. | Der nächste zählt ab dem Tag, an dem er erledigt wird.     |
| Always on a Sunday, even if it's done late. | Immer an einem Sonntag, auch wenn er später erledigt wird. |
| Done late? The next one stays on its date.  | Später erledigt? Der nächste bleibt an seinem Tag.         |
| on the first Sunday / on the last Sunday    | am ersten Sonntag / am letzten Sonntag                     |
| on the 6th / on the 31st (or the last day)  | am 6. / am 31. (oder am Monatsletzten)                     |
| Coming up: …                                | Als Nächstes: …                                            |
| monthly, first Sunday                       | monatlich, erster Sonntag                                  |
| On schedule                                 | Nach Plan                                                  |

No em dashes in copy (→ DECISIONS #205).

## Choices made in this plan (Lukas may change them)

- The name: "Keep to the schedule" / "Fester Termin".
- Off by default, also for new monthly tasks.
- Weekly tasks get the switch too (it keeps the weekday).

## Tests

- **Unit** (`dates.test.ts`): `nextOnSchedule` for every row of the rules above; by day on
  the 31st across February and a leap year; by weekday with a `last` anchor; every 2 weeks;
  every 3 months by weekday; `after` before, on and long after the anchor.
- **Integration** (`tasks` service): done late / very late / early with an anchor; skip; snooze
  then done; holiday return then done; undo restores anchor and by; switching the unit to day
  clears the anchor; no anchor = today's behaviour, unchanged.
- **Playwright**: create "Deep clean the kitchen" monthly on the first Sunday, see "Coming up",
  tick it off, see "Next due" in the pop-up and the meta line in the list.
- **Visual**: the sheet with the switch on (monthly, both rows), and a list row with the new
  meta line. Refresh baselines on purpose.

## Acceptance

- [ ] [S1] matches the sketch: the switch under the date, only for week and month repeats; the
      two rows for monthly, relabelled by the date; "Coming up" for both states.
- [ ] Due Sun 6 Dec 2026 monthly on the first Sunday: done 8 Dec → Sun 3 Jan; done 15 Jan →
      Sun 7 Feb; done 5 Dec → Sun 3 Jan.
- [ ] By day on the 31st: 31 Jan → 28 Feb → 31 Mar.
- [ ] Snoozed to 8 Dec, then done that day → Sun 3 Jan.
- [ ] Existing tasks unchanged (no anchor after the migration), and their meta line reads as
      before.
- [ ] [S2] says "On schedule · first Sunday"; [S3] and Home's next-chore card say "monthly,
      first Sunday".
- [ ] German walked through at 200% text size.
- [ ] SPEC §5.2–§5.4, §5.8, DATA-MODEL "Completion algorithm" updated; DECISIONS entries for
      the rule (strictly after both dates), "last" instead of a fifth week, off by default.
