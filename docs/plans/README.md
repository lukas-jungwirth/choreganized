# Implementation Plans

The v1 build was split into 12 plans (00–11); post-v1 features continue the same numbering.
Each is a self-contained work package for one agent session: it says what to build, which
design frames and SPEC sections apply, and how to know it's done.

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
| 06  | [Task reminders](06-task-reminders.md)                              | done (2026-07-22) | 04, 05                   |
| 07  | [Cooking: recipes & meal plan](07-cooking.md)                       | done (2026-07-22) | 02 (03 for shopping add) |
| 08  | [Cook mode & timers](08-cook-mode.md)                               | done (2026-07-22) | 07, 05                   |
| 09  | [History, leaderboard & Home completion](09-history-leaderboard.md) | done (2026-07-22) | 04                       |
| 10  | [Settings & members](10-settings-members.md)                        | done (2026-07-22) | 01 (05 for prefs)        |
| 11  | [PWA, polish & deploy](11-pwa-deploy.md)                            | done (2026-07-23) | all                      |
| 12  | [Recipe import from a link](12-recipe-import.md)                    | done (2026-07-25) | 07, 11                   |
| 13  | [AI import: fallback, text & photos](13-ai-import.md)               | done (2026-07-25) | 12, 10                   |
| 14  | ["Add a recipe" chooser & focused import modes](14-add-chooser.md)  | done (2026-07-25) | 12, 13                   |

Work done after the twelve plans, tracked here so the queue stays the whole story:

| Change                                                                                                  | Status            |
| ------------------------------------------------------------------------------------------------------- | ----------------- |
| **English + German** (`lib/i18n`, Settings → Language, SPEC §9)                                         | done (2026-07-24) |
| **Plan next week** (`/cooking?week=`, two-week switch, SPEC §4.1, DECISIONS #99)                        | done (2026-07-24) |
| **Structured ingredient amounts** (`cooking/IngredientSheet`, SPEC §4.4, DECISIONS #100–101)            | done (2026-07-24) |
| **Multiple cook timers + the running-timer dock** (`cook-timers.ts`, `cook-timer.svelte.ts`, SPEC §4.6) | done (2026-07-24) |
| **Shopping: "Recently bought" + add-field suggestions** (SPEC §3.1, DECISIONS #105–106)                 | done (2026-07-24) |
| **Shopping: undo bar after a tick** (`shopping/UndoBar`, SPEC §3.1, DECISIONS #107)                     | done (2026-07-24) |
| **Ingredient picker + merging amounts** (`cooking/IngredientPickSheet`, SPEC §4.8, DECISIONS #123)      | done (2026-07-31) |
| **Cooking for {n}: use-time ingredient scaling** (SPEC §4.5, §4.6, §4.8, DECISIONS #124)                | done (2026-07-31) |
| **One type scale token** (`--fs` in `app.css`, DESIGN-SYSTEM "Type scale", DECISIONS #125)              | done (2026-08-08) |
| **Several meals a day** (`meals.slot`, SPEC §2, §4.1–4.2, DATA-MODEL, DECISIONS #126)                   | done (2026-08-08) |
| **What a step uses** (`recipe_step_ingredients`, SPEC §4.4, §4.6, DATA-MODEL, DECISIONS #127)           | done (2026-08-10) |

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
(→ ARCHITECTURE.md "Notifications"). 06 did exactly that and nothing else —
`services/reminders.ts` (claim the idempotency flag, then send) plus one registry line is the
whole shape **08 copies for cook timers**, and its "What was verified, and how" section is the
recipe for driving a cron sweep without waiting for a real morning. 07 added `SearchField` and
`RowGroup surface="sunken"`, the `--cook-surface` token, `lib/server/uploads.ts` (sharp → WebP
plus the authed `/api/uploads` endpoint) and `lib/utils/ingredients.ts` — **08 gets
`/cooking/recipes/[id]/cook` already routed, guarded and dark, with a placeholder screen to
replace**, plus `formatAmount`/`formatIngredient` for its step highlighting. 09 added `Podium`
and `HistoryRow` (feature components, not `ui/`), `RowGroup list` (a `<ul>`, for groups whose
rows are `<li>`s — the members list [6b] uses it), `formatDayLabel` · `formatMonthName`, and the
URL-window paging shape any other "load more" should copy (→ DECISIONS #76 — the Cooking tab's
`?week=` follows it). 10 owns Settings and Members: it put the membership half into
`services/household.ts` with the **role checks
inside the service transaction** (`requireOwner`, → DECISIONS #77) — copy that shape for
anything owner-only — extracted the holiday pause into `components/AwayControl.svelte` (one
control, two surfaces), gave `BottomSheet` a `lead` snippet + `subtitle` and `StepHeader` an
optional `step`, and moved the two name limits into `lib/utils/household.ts`. 08 built cook mode
on that placeholder: a `dark` **tone on `BottomSheet` and `Stepper`** (extend, don't fork — the
peek and the manual-timer sheets), the state machine in the repo's first `.svelte.ts`
(`lib/cook-timer.svelte.ts`), `lib/utils/timer-parse.ts` + `step-highlight.ts` with the first
`node --test` suites (`npm test`), and the timer half of the notification stack — the same
`sendToUser` + one `cron.ts` registry line plan 05 laid out, plus three JSON endpoints under
`/api/timers` behind the new **`requireMemberApi`** guard (→ DECISIONS #89), which
`api/push/subscribe` now shares. Run `npm run dev` and open **`/dev/kit`** to see the components
on one screen before you build against them — and add your new ones to that page.

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
