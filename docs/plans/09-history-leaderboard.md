# 09 · History, leaderboard & Home completion

**Goal:** the History segment of Tasks (monthly podium + completed feed) and the last two Home
cards (recent activity, standings strip). Points become _visible_ everywhere they should be.

Depends on: 04. Design: [8a] podium+feed, [8b] home cards, [02] points card. SPEC:
[§5.8](../SPEC.md#58-history--leaderboard-8a), [§2](../SPEC.md#2-home-tab) items 1/4.

## Build

- `lib/server/services/history.ts` — month standings (SUM points per member, `action='done'`,
  household-local month per DATA-MODEL; include members with 0), completed feed paged by day
  groups (Today/Yesterday/weekday+date labels), recent-activity (last 2) for Home.
- `/tasks/history` (or the History segment target — match how 04 wired the segmented
  control): **Podium card** "This month · resets {Mon 1}": adaptive columns (2–5 members)
  sorted by points — 1st center/tallest with crown + gold ring per [8a]; 2 members → two
  columns, winner taller. **Completed feed** grouped by day, member-coloured check circles,
  `+pts` tinted chips, "load more" per month boundary.
- Home: **Recent activity card** (top 2, "All →" to history, hidden when empty) and
  **standings strip** ("You're 1st this month" / "240 pts · 30 ahead of {name}" / tied copy,
  avatar stack) — fill the slots 02 left in `services/home.ts`.
- Points tiles on `/tasks` (04) should reuse the standings query — refactor if 04 duplicated.
- Month label edge: first day of month shows an empty-but-valid podium (0s) — verify copy
  "resets {next month 1st}".

## Acceptance

- [x] Podium ranks & heights correct for 2 members incl. tie (equal heights, no crown? —
      crown to earlier `joinedAt`, note in DECISIONS); Marco-style 3rd member renders when a
      third joins (seed one to check).
- [x] Feed groups by day with correct labels/times; skips absent; paging loads older months.
- [x] Home activity card + standings strip live and linking; hidden pre-first-completion.
- [x] Month rollover derived correctly (fake tz/system date in dev to verify boundary).
- [x] `npm run check` && `npm run build` clean; frames match [8a]/[8b].

## Deviations & notes

- **Home was already done.** Plan 02 shipped `ActivityCard`, `StandingsStrip` and the
  `activity` / `standings` halves of `services/home.ts` rather than leaving slots, so 09
  verified them against [8b] instead of rebuilding them (that file's own header asks 04/07/09
  not to touch it). Both cards were checked live with seeded data, including the tie copy.
  Likewise the points tiles: `/tasks`, Home and the podium all read `monthPointsByMember`
  already, so there was nothing to de-duplicate.
- **`services/history.ts` owns the podium and the feed only.** Home's recent-activity stayed in
  `home.ts` — it is not month-scoped and composes with the rest of the dashboard in one call.
- **Paging is a month window in the URL** (`?from=YYYY-MM-01`), and the button names the next
  month that actually holds something (→ DECISIONS #63). No infinite scroll.
- **New in `lib/utils/dates.ts`**: `formatDayLabel` (the feed's day heads, year included once
  you've paged past New Year) and `formatMonthName` ("Show June"); `formatDayStamp` gained an
  optional year. `tasks.ts`'s `formatCompletedAt` was refactored onto `formatDayLabel` so the
  preview [05] and the feed can't drift, and gained `countTasks` for the segmented control.
- **Empty states** [7d]-style: never-completed shows "Nothing done yet" under a leaderless
  podium; a paged-into month that turns out empty says so above its "load more".
- **`RowGroup` gained a `list` prop** (renders `<ul>`): the feed's rows are `<li>`s, and an
  `<li>` inside the default `<div>` is invalid markup that the browser exposes as a listitem
  belonging to no list. Plan 10's members [6b] should use it too.
- **Known limit, accepted:** the feed's query is bounded by "one month per tap", not by a
  `LIMIT` — a hand-edited `?from=1900-01-01` would render the household's whole history in one
  response. It is the requester's own data, and every cap considered either truncates a day
  group or blocks legitimate deep paging. Revisit if a household ever gets large.

## What was verified, and how

Against a worktree copy of the demo DB (`npm run dev`, real screens, seeded household):

| Case                      | How                                                              |
| ------------------------- | ---------------------------------------------------------------- |
| 2-member podium           | seeded household, Lukas 50 / Elisabeth 30 — crown, ring, 104/78  |
| 3-member podium           | third housemate inserted → 2 · 1 · 3 exactly as [8a] draws       |
| Tie                       | levelled the top two → both rank 1, equal columns, one crown     |
| Leaderless (1st of month) | household whose completions all sit in an earlier month          |
| Feed grouping             | Today / Yesterday / "Mon 20 Jul"; both skips absent              |
| Paging                    | June inserted, May left empty, April inserted → "Show June" then |
|                           | "Show April" (May skipped), then no button                       |
| **Month boundary**        | a completion at `2026-06-30T22:30Z` = 1 Jul 00:30 Vienna counts  |
|                           | toward July; switch the household to `Pacific/Honolulu` and the  |
|                           | same instant reads 30 Jun 12:30 — it leaves the podium and the   |
|                           | window, and "Show June" comes back. UTC month starts would fail  |
|                           | this; `zonedStartOfDay(startOfMonth(today), tz)` passes.         |

Verified as an existing signed-in session (Google sign-in is never driven by an agent); the
temporary `emailAndPassword` switch used to mint a second household was removed afterwards.
