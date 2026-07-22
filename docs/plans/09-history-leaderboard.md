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

- [ ] Podium ranks & heights correct for 2 members incl. tie (equal heights, no crown? —
      crown to earlier `joinedAt`, note in DECISIONS); Marco-style 3rd member renders when a
      third joins (seed one to check).
- [ ] Feed groups by day with correct labels/times; skips absent; paging loads older months.
- [ ] Home activity card + standings strip live and linking; hidden pre-first-completion.
- [ ] Month rollover derived correctly (fake tz/system date in dev to verify boundary).
- [ ] `npm run check` && `npm run build` clean; frames match [8a]/[8b].
