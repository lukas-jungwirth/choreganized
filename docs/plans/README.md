# Implementation Plans

The build is split into 12 plans. Each is a self-contained work package for one agent session:
it says what to build, which design frames and SPEC sections apply, and how to know it's done.

## Status

Update this table when you start/finish a plan (statuses: `todo` · `in progress` · `done`,
plus your session date). Note deviations in the plan file and in DECISIONS.md.

| #   | Plan                                                                | Status            | Depends on               |
| --- | ------------------------------------------------------------------- | ----------------- | ------------------------ |
| 00  | [Foundation: auth, guards, hooks, login](00-foundation.md)          | done (2026-07-22) | —                        |
| 01  | [Onboarding & household](01-onboarding.md)                          | done (2026-07-22) | 00                       |
| 02  | [App shell & Home v1](02-shell-home.md)                             | done (2026-07-22) | 01                       |
| 03  | [Shopping](03-shopping.md)                                          | done (2026-07-22) | 02                       |
| 04  | [Tasks core](04-tasks.md)                                           | done (2026-07-22) | 02                       |
| 05  | [Push infrastructure](05-push-infra.md)                             | done (2026-07-22) | 02                       |
| 06  | [Task reminders](06-task-reminders.md)                              | todo              | 04, 05                   |
| 07  | [Cooking: recipes & meal plan](07-cooking.md)                       | todo              | 02 (03 for shopping add) |
| 08  | [Cook mode & timers](08-cook-mode.md)                               | todo              | 07, 05                   |
| 09  | [History, leaderboard & Home completion](09-history-leaderboard.md) | todo              | 04                       |
| 10  | [Settings & members](10-settings-members.md)                        | todo              | 01 (05 for prefs)        |
| 11  | [PWA, polish & deploy](11-pwa-deploy.md)                            | todo              | all                      |

## Dependency graph & parallelization

```
00 ─ 01 ─ 02 ─┬─ 03 (shopping) ──┐
              ├─ 04 (tasks) ─────┼─ 06 (reminders) ─┐
              ├─ 05 (push) ──────┤                  ├─ 09 ─ 11
              ├─ 07 (cooking) ───┴─ 08 (cook mode) ─┤
              └─ 10 (settings) ─────────────────────┘
```

After 02 lands, **03 / 04 / 05 / 07 / 10 can run in parallel** (separate worktrees if
concurrent — they touch disjoint routes; shared surface is `lib/components/ui` and
`lib/server/services`, so build primitives in 02 and extend, don't rewrite).

The kit 02 left you: Card · AvatarStack · CheckCircle · Chip · SegmentedControl · Toggle ·
ProgressBar · Banner · EmptyState · FAB · BottomSheet · CenterModal (plus 01's Button ·
TextField · Avatar · ColorPicker), `shell/TabBar` · `shell/PageHeader`, and
`lib/utils/dates.ts`. 03 added Select · Stepper · `shell/SubHeader` (the back-chevron header
[7g]/[6b] uses), and the first real cron job — copy its shape in `lib/server/cron.ts`. 04 added
DateField, a link mode on SegmentedControl, and the recurrence + due-date-copy half of
`lib/utils/dates.ts` (`addInterval` · `daysBetween` · `formatDueMeta` · `formatDateLabel`) —
09's feed builds on `services/tasks.ts`. 05 added `RowGroup`, an acting/dismissable `Banner`,
`components/EnablePush`, and the whole notification stack: **06 and 08 only call `sendToUser` /
`sendToMembers` from `lib/server/push.ts` and add one line to `cron.ts`'s job registry**
(→ ARCHITECTURE.md "Notifications") — so 06 is now unblocked on both sides. Run `npm run dev`
and open **`/dev/kit`** to see them all on one screen before you build against them — and add
your new ones to that page.

## How to work a plan

1. Read the plan file, the linked [SPEC](../SPEC.md) sections, and **open
   [`design/Hearth.dc.html`](../../design/Hearth.dc.html) in a browser** — build to the pixels,
   the anchors ([3a] etc.) are element ids in that file.
2. Skim [ARCHITECTURE](../ARCHITECTURE.md) (patterns, routing map) and
   [DATA-MODEL](../DATA-MODEL.md) for the tables you'll touch. The schema already exists —
   extending it means `npm run db:generate` for a new migration.
3. Build. Follow the conventions (runes, tokens, guards, services — see `CLAUDE.md`).
4. Verify: `npm run check` + `npm run build` clean, then walk the acceptance criteria in the
   dev server (`npm run dev`) with seeded data (`npm run db:seed`, created in plan 00).
5. Update the status table above; log judgment calls in [DECISIONS.md](../DECISIONS.md);
   tick the plan's acceptance boxes.
