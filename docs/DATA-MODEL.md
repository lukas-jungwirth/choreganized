# Data Model

Schema source of truth: [`src/lib/server/db/schema.ts`](../src/lib/server/db/schema.ts)
(Drizzle, SQLite). Migrations in `src/lib/server/db/migrations/` (`npm run db:generate` after
schema changes). This doc explains the _shape_ and the _lifecycle algorithms_ that operate on it.

```
user ─┬─ session / account / verification        (Better Auth)
      ├─ push_subscriptions                      (per device)
      └─ members ──→ households
                        ├─ stores ──→ shopping_items
                        ├─ recipes ──→ recipe_ingredients / recipe_steps
                        ├─ meals (→ recipes, one per date)
                        ├─ tasks ──→ task_completions (snapshots)
                        └─ cook_timers
```

## Core principles

1. **Everything is household-scoped.** All app tables carry `householdId`; every query filters
   by it (enforced via the `requireMember` guard — see ARCHITECTURE.md). SQLite has no RLS; the
   service layer is the boundary.
2. **Identity vs. profile.** `user` is the Better Auth identity (Google). `members` is the
   household profile (display name, colour, role, notification prefs, away state). UI always
   shows member data, never user data. v1 enforces one household per user
   (`members_user_unique` index) — drop that index to unlock multi-household later; nothing
   else assumes it.
3. **Calendar dates are TEXT `YYYY-MM-DD`** in the household's timezone (`households.timezone`,
   captured at creation). "Due Thursday" is a calendar concept: comparing/adding days happens on
   date strings (lexicographic compare works), _never_ through UTC Date conversions. Instants
   (completions, checks, timers, reminders) are integer ms timestamps.
4. **History survives deletion.** `task_completions` snapshots `taskName` + `memberName` and
   references tasks/members with `ON DELETE SET NULL`. Deleting a task, removing a member or a
   member leaving never rewrites history or the leaderboard ("points stay with the house").
   Same idea: `meals.title` snapshots the recipe name so deleting a recipe keeps the plan
   readable.

## Table notes

### `households`

- `inviteCode`: the single active invite (`NULL` = revoked). Generated from a non-ambiguous
  alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 6 chars, `crypto.getRandomValues`). Displayed
  with a dash (`7K4-P2`), stored/compared without, case-insensitive (store uppercase).
- `timezone`: IANA name; drives "today", reminder mornings, and the leaderboard month.

### `members`

- `role`: `'owner' | 'member'`. Exactly one owner per household (app-enforced; "Make owner"
  transfers).
- `awayUntil`: holiday pause end date (inclusive). Away = `today(household) <= awayUntil`.
  Affects: overdue rendering, due/overdue reminders (skipped entirely — flags stay unset so
  nudges fire only if it becomes due again after return; simpler: reminders check away at send
  time), Home banner.
- Notification prefs live here (not on `user`) because they're household-app concerns.

### `stores` / `shopping_items`

- Store order (`sortOrder`, contiguous ints) = walking order; list renders stores by it.
  `storeId NULL` → virtual "Other" group, rendered last. Deleting a store sets its items'
  `storeId` to NULL.
- `checkedAt NULL` = open; set = done (struck through, end of group). Cleanup cron deletes
  items with `checkedAt < now - 12h` (nightly at 03:30 household-local; exact age not
  critical).
- `quantity REAL` + `unit TEXT` both optional — "Tomatoes ×6", "Oat milk 2 L", or bare names.

### `recipes` / `recipe_ingredients` / `recipe_steps`

- Ingredients are structured (name, quantity?, unit?) but _entered_ freeform ("400 g pasta")
  and parsed leniently (`src/lib/utils/ingredients.ts`, plan 07): `/^([\d.,½¼¾\/]+)?\s*([a-zA-Z]+)?\s+(.+)$/`-ish
  with a known-units whitelist; on no match, everything is the name.
- Steps are plain text, ordered by `sortOrder`. Cook-mode timers and ingredient highlighting
  are **derived at render time** (duration regex; case-insensitive ingredient-name matching) —
  no extra columns, no authoring burden. (→ DECISIONS #14)
- `imagePath` is relative to `UPLOADS_DIR`; files served through an authed endpoint that
  checks household membership.

### `meals`

- `UNIQUE(householdId, date)` — one dinner slot per day (design shows a single evening meal).
  Planning onto an occupied day replaces (upsert).
- Either `recipeId` (library meal) or `title` ("cook something not saved"); when both exist,
  `title` is the display fallback after recipe deletion. App ensures at least one is set.

### `tasks` — the task row IS the current occurrence

There is no occurrences table. `dueDate` is the _current_ due date; per-occurrence state
(`dueReminderSentAt`, `overdueReminderSentAt`) lives on the row and is reset whenever the
occurrence changes (done, skip, snooze, edit of due date).

- `recurUnit 'none'` = one-off (optionally undated). Otherwise every `recurInterval` ×
  `recurUnit` (Weekly = 1×week, Every 2 weeks = 2×week, Monthly = 1×month).
- `assigneeMemberId NULL` = **Anyone**. `rotate` only meaningful with an assignee.
- Overdue = `dueDate < today(household)` and assignee not away. Days overdue = date diff.

**Completion algorithm** (single transaction; service `completeTask`):

1. Insert `task_completions` (snapshot name, points, action `'done'`, member = completer).
2. If recurring: `dueDate = addInterval(today, recurInterval, recurUnit)` (date-fns `addWeeks`/
   `addMonths`/`addDays` on the calendar date — _today-based_, not dueDate-based, so an overdue
   weekly task completed today is next due in a week, matching [4d] "Next due Aug 14").
   If `rotate`: assignee ← next member by `joinedAt` order (wrapping, skipping departed).
   Reset both reminder flags to NULL.
3. If one-off: delete the task row (history row remains).
4. Return prior state `{dueDate, assigneeMemberId, flags}` + `completionId` for **Undo**, which
   reverts exactly that (delete completion; for one-offs re-insert the task row from the
   returned snapshot).

**Skip** = same as done with `action 'skipped'`, `points 0`, not shown in the history feed.

### `task_completions`

- Leaderboard month: `completedAt` within the current household-local calendar month and
  `action = 'done'`; `SUM(points) GROUP BY memberId`. Month boundaries computed from
  `households.timezone` — no reset job, always derived.

### `push_subscriptions`

- One row per browser/device (`endpoint` unique, upsert on re-subscribe). Send failures with
  status 404/410 delete the row (pruning). A user may have several (phone + laptop).

### `cook_timers`

- Server-side alarm for locked-phone delivery: `endsAt` (+`label`, `recipeId`, `stepIndex` for
  the notification deep link `/cooking/recipes/{id}/cook?step={i}`). `notifiedAt` =
  idempotency; `canceledAt` set on cancel (pause v1 = cancel + recreate on resume with shifted
  `endsAt`). Precision: in-process `setTimeout` scheduled at creation + the minute cron as
  catch-up after restarts (→ ARCHITECTURE.md).

### Better Auth tables (`user`, `session`, `account`, `verification`)

Hand-written to Better Auth 1.6 core schema (drizzle adapter maps on property names) and
verified field-by-field against 1.6.23's generated reference in plan 00 — all timestamps are
`timestamp_ms`, `verification.created_at/updated_at` are NOT NULL and `identifier` is indexed
(migration 0001). `verification` also holds the OAuth state during the Google round-trip, so
it's live from the first sign-in. After a Better Auth upgrade, re-run the diff:
`npx @better-auth/cli generate` cannot read `auth.ts` (SvelteKit's `$app`/`$env` modules don't
resolve outside Vite) — point it at a throwaway config with the same options minus those
imports, and compare its output to `schema.ts`.

## Reminder time-sweep (cron, every minute)

For each household (timezone-aware, ~6 h lookback so restarts/redeploys can't lose a send —
idempotent via the flags):

```
localNow, localToday = now in household.timezone
if localNow >= today 08:00:
  due today:   tasks where dueDate == localToday and dueReminderSentAt IS NULL  → push, set flag
  overdue:     tasks where dueDate <  localToday and overdueReminderSentAt IS NULL → push, set flag
(skip away assignees; Anyone → all members; respect per-member toggles)
timers: cook_timers where endsAt <= now and notifiedAt/canceledAt IS NULL → push, set notifiedAt
cleanup (03:30 local): checked shopping items older than 12h
```

The "lookback" is implicit in the `IS NULL` flags + the `>= 08:00` condition: whether the tick
runs at 08:00 or 13:45 (after downtime), the nudge fires exactly once. The overdue nudge query
naturally fires the morning _after_ the due date (first tick past 08:00 with `dueDate <
today`).

The flag is claimed (conditionally, `WHERE … IS NULL`) _before_ the send, and only when at
least one person the nudge is for is home: an away member leaves it NULL, so their nudge is
still waiting the morning they're back, while a member who switched the toggle off spends it
(→ [DECISIONS #60](DECISIONS.md), `lib/server/services/reminders.ts`).
