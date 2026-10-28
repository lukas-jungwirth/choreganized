# Data Model

Schema source of truth: [`src/lib/server/db/schema.ts`](../src/lib/server/db/schema.ts)
(Drizzle, SQLite). Migrations in `src/lib/server/db/migrations/` (`npm run db:generate` after
schema changes). This doc explains the _shape_ and the _lifecycle algorithms_ that operate on it.

```
user ─┬─ session / account / verification        (Better Auth)
      ├─ push_subscriptions                      (per device)
      └─ members ─┬─→ households
                  │      ├─ stores ──→ shopping_items
                  │      ├─ recipes ──→ recipe_ingredients / recipe_steps
                  │      │                     └─ recipe_step_ingredients ─┘
                  │      ├─ meals (→ recipes, one per date × slot)
                  │      ├─ tasks ──→ task_completions (snapshots)
                  │      ├─ cook_timers
                  │      ├─ ai_connections          (primary + backup provider keys)
                  │      ├─ feedback                (mirrored to a GitHub issue)
                  │      └─ ledger_people ─→ expenses ──→ expense_shares
                  │           │  (one per membership,  └─→ expense_recurrences (series it came from)
                  │           │   outlives it)                └─ expense_recurrence_shares
                  │           └─ (payer and people of a series)
                  └─ holiday_notices             (per member × shop closure)
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
- `aiInstructions` (migration 0015, → plan 22): the household's standing instructions for every
  AI import, ≤ 300 chars, whitespace collapsed and control/bidi characters stripped on write
  (`$lib/ai.ts` `cleanInstructions`); `NULL` = none. Owner-only, like the connections.
- `recipeWording` (migration 0016, → plan 24): `'austrian'` or `NULL` (as written) — how
  imported German recipes are worded, from the fixed list in `utils/wording.ts`. Applied at
  import only; nothing saved is ever rewritten. Owner-only.

### `ai_connections` (→ plan 20, SPEC §6)

- At most two rows per household, `UNIQUE(householdId, slot)`: `slot = 'primary'` is what every
  AI feature calls; `'backup'` gets the same request when the primary fails
  (→ `server/ai/run.ts`). No row means AI features are off. Removing the primary promotes the
  backup; saving a "backup" with no primary stores it as the primary.
- `provider`: `'gemini' | 'openai' | 'anthropic' | 'openrouter'` (→ `$lib/ai.ts`). `model` is the
  provider's own id, picked from its live list or typed — never a value the app ships.
- `apiKey`: **plaintext**, for #112's reason (a key that could decrypt it would live in the same
  single-tenant container). Server-only: Settings loads provider, model and a masked hint.
- `vision`: whether the model reads images, as its listing said when it was picked; `NULL` =
  unknown (a typed id), which photo import still tries. `false` is skipped for photos.
- Replaced plan 13's `households.gemini_api_key` in migration `0013`, which copies a non-blank
  key into a `primary` Gemini row on `gemini-flash-latest` before dropping the column — with a
  plain `DROP COLUMN`, never drizzle's table rebuild, whose `DROP TABLE households` would cascade
  inside the migrator's transaction.

### `members`

- `role`: `'owner' | 'member'`. Exactly one owner per household (app-enforced; "Make owner"
  transfers).
- `awayUntil`: holiday pause end date (inclusive). Away = `today(household) <= awayUntil`.
  Affects: overdue rendering, due/overdue reminders (skipped entirely — flags stay unset so
  nudges fire only if it becomes due again after return; simpler: reminders check away at send
  time), Home banner.
- Notification prefs live here (not on `user`) because they're household-app concerns.
  `notifyShopClosures` (→ `holiday_notices`, SPEC §3.6) defaults **on**, unlike
  `notifyShoppingUpdates` beside it: it fires around a dozen times a year rather than a dozen
  times a week.
- `locale`: `'en' | 'de' | NULL`. **NULL is a setting, not an absence** — it is Settings'
  "System" option, meaning "follow whatever device I'm on", which is what lets
  `hooks.server.ts` fall through to the `locale` cookie and then `Accept-Language`. On the
  membership rather than in the cookie alone so a phone and a laptop agree, and so the cron
  sweep can address a notification in its recipient's language
  (→ [DECISIONS #94](DECISIONS.md), [SPEC §9](SPEC.md)).

### `stores` / `shopping_items` / `shopping_suggestions` / `pantry_staples`

- Store order (`sortOrder`, contiguous ints) = walking order; list renders stores by it.
  `storeId NULL` → virtual "Other" group, rendered last. Deleting a store sets its items'
  `storeId` to NULL.
- `checkedAt NULL` = open; set = bought (struck through, out of its store group and into
  "Recently bought" — → [DECISIONS #105](DECISIONS.md)). Cleanup cron deletes items with
  `checkedAt < now - 12h` (nightly at 03:30 household-local; exact age not critical).
- `shopping_suggestions` is the household's **vocabulary**, one row per distinct name, and the
  reason it is a table rather than a `SELECT DISTINCT` over `shopping_items` is that line above:
  the items are swept up, the words shouldn't be. `nameKey` (trimmed + lowercased,
  `utils/shopping.ts` `suggestionKey`) is unique per household and the upsert's conflict target;
  `name` keeps the spelling last used, which is what gets offered back. Written on every add,
  rename and recipe pour-in; read most-recent-first, capped, and filtered in the browser
  (→ [DECISIONS #106](DECISIONS.md)).
- `pantry_staples` is the same shape as `shopping_suggestions` doing the opposite job: the names
  this household **doesn't** need to buy. Nobody fills in a pantry inventory, so it is learned
  from the ingredient picker (§4.8) — `skipCount` goes up each time a name is offered and left
  off, and from the second time on it opens unticked; ticking it deletes the row. Same
  `nameKey` (trimmed + lowercased), same unique index per household
  (→ [DECISIONS #123](DECISIONS.md)).
- `quantity REAL` + `unit TEXT` both optional — "Tomatoes ×6", "Oat milk 2 L", or bare names.
  The unit is stored **canonically** (`pcs`, `tbsp`) and labelled per language on the way out
  ("Stk.", "EL"), so switching language re-labels the list rather than rewriting it
  (→ [DECISIONS #97](DECISIONS.md)). A unit somebody typed that isn't in the table is kept and
  shown exactly as typed.

### `recipes` / `recipe_ingredients` / `recipe_steps` / `recipe_step_ingredients`

- Ingredients are structured (name, quantity?, unit?) but _entered_ freeform ("400 g pasta")
  and parsed leniently (`src/lib/utils/ingredients.ts`, plan 07): `/^([\d.,½¼¾\/]+)?\s*([a-zA-Z]+)?\s+(.+)$/`-ish
  with a known-units whitelist; on no match, everything is the name.
- Steps are plain text, ordered by `sortOrder`. A step **may carry its own timer**
  (`timer_seconds` + an optional `timer_label`, migration 0014, → plan 21, DECISIONS #147) —
  one per step, set in the form or by an import. `NULL` (every step written before it, and the
  default) means cook mode **derives the timer at render time** from a duration regex over the
  text, English or German (→ DECISIONS #14). Writes clamp to what a cook-mode timer can run
  (5 s – 12 h, whole seconds) and drop anything else rather than refuse the step.
- **What a step uses is derived _until somebody says otherwise_** (→ DECISIONS #127).
  `recipe_steps.ingredients_set` (migration 0010, `DEFAULT false` — every row written before it
  existed keeps reading its own text) flips a step from the matcher
  (`src/lib/utils/step-highlight.ts`) to the rows in `recipe_step_ingredients`. The flag is what
  makes "this step uses nothing" sayable: an empty list on its own is indistinguishable from a
  step nobody has looked at.
- `recipe_step_ingredients` is `(stepId, ingredientId, quantity?, sortOrder)` with
  `UNIQUE(step_id, ingredient_id)` — a step names an ingredient once. `quantity` is a **share of
  the ingredient row**, in that row's own unit (1 of the 3 tbsp of olive oil here, 2 at the end);
  NULL means all of it, which is what a plain tick stores. Written in recipe-as-written terms, so
  `?serves=` scales a share with exactly the same arithmetic as the ingredient above it
  (→ DECISIONS #124).
- **The children are replaced, not diffed**, on every save (`writeChildren`), so the pins are
  rewritten in the same transaction and their ids are minted in that function rather than left
  to the column default — a pin has to name the row it was saved beside. The form therefore
  posts a step's pins as **indices into the posted ingredient lines**, not ids: the ids it was
  opened on no longer exist by the time the save writes. Blank lines drop out and shift those
  indices, which is why `writeChildren` keeps a posted-index → new-id map.
- `imagePath` is relative to `UPLOADS_DIR` and is a UUID filename, not a derivable one:
  replacing a photo writes a new file and deletes the old, so a stored URL never changes
  content and can be cached immutably (→ DECISIONS #63). Files are served through
  `/api/uploads/[...path]`, which only answers when the path is a recipe's `imagePath` **in
  the caller's household** — the lookup is the authorisation (→ #64).

### `meals`

- `UNIQUE(householdId, date, slot)` — a day holds **one meal per slot**, `slot` being
  `breakfast | lunch | dinner | snack` (`$lib/utils/meals`, → DECISIONS #126). Planning onto an
  occupied slot replaces (upsert). The column was added in migration 0009 with
  `DEFAULT 'dinner'`, which is what every row written while the day held one meal was — no
  backfill script, and no row that means something different afterwards than it did before.
- Moving a meal to another slot is an upsert on the new `(date, slot)` plus a delete of the row
  it came from, in one transaction (`planMeal`, which takes the edited `mealId` for exactly
  this). Removing is by meal id, not by day.
- Either `recipeId` (library meal) or `title` ("cook something not saved"); when both exist,
  `title` is the display fallback after recipe deletion. App ensures at least one is set:
  planning a recipe writes its name into `title` as the snapshot, and `deleteRecipe` refreshes
  that snapshot inside the same transaction as the delete, so a recipe renamed since it was
  planned still leaves the plan reading right. A row that somehow has neither is skipped by
  `listMeals` rather than rendered blank.

### `tasks` — the task row IS the current occurrence

There is no occurrences table. `dueDate` is the _current_ due date; per-occurrence state
(`dueReminderSentAt`, `overdueReminderSentAt`) lives on the row and is reset whenever the
occurrence changes (done, skip, snooze, edit of due date).

- `recurUnit 'none'` = one-off (optionally undated). Otherwise every `recurInterval` ×
  `recurUnit` (Weekly = 1×week, Every 2 weeks = 2×week, Monthly = 1×month).
- `assigneeMemberId NULL` = **Anyone**. `rotate` only meaningful with an assignee.
- Overdue = `dueDate < today(household)` and assignee not away. Days overdue = date diff.

**Completion algorithm** (single transaction; service `completeTask`):

1. Insert `task_completions` (snapshot name, points, action `'done'`, member = the credited
   **doer** — the tapper, or the assignee when the task was someone else's and marked done on
   their behalf via the "who did it?" choice → SPEC §5.4, DECISIONS #116).
2. If recurring: `dueDate = addInterval(today, recurInterval, recurUnit)` (date-fns `addWeeks`/
   `addMonths`/`addDays` on the calendar date — _today-based_, not dueDate-based, so an overdue
   weekly task completed today is next due in a week, matching [4d] "Next due Aug 14").
   If `rotate`: assignee ← the member after **the doer** in `joinedAt` order (wrapping, skipping
   departed) — so doing a housemate's turn hands the next one back to them. Reset both reminder
   flags to NULL.
3. If one-off: delete the task row (history row remains).
4. Return prior state `{dueDate, assigneeMemberId, flags}` + `completionId` for **Undo**, which
   reverts exactly that (delete completion; for one-offs re-insert the task row from the
   returned snapshot).

**Skip** = same as done with `action 'skipped'`, `points 0`, credited to the tapper, not shown
in the history feed. Its rotation advances from the **assignee** (a skip is nobody's doing), not
from whoever tapped.

### `task_completions`

- Leaderboard month: `completedAt` within the current household-local calendar month and
  `action = 'done'`; `SUM(points) GROUP BY memberId`. Month boundaries computed from
  `households.timezone` — no reset job, always derived.

### `holiday_notices`

The two things the calendar can't know about a shop closure (→ [SPEC §3.6](SPEC.md)). The
closure itself has **no row and never will**: which days Austrian shops shut is computed from
the year (`lib/utils/holidays.ts`), identical in every household, so storing it would be a copy
that can go stale. What is stored is one row per **member × closure**, created only once
somebody has been notified or has answered:

- `closureDate` — the run's first shut day, the notice's identity. Answers name it, so a tab
  left open over a weekend can't dismiss whatever notice is current now.
- `pushedAt` — the idempotency flag, playing exactly the role `tasks.dueReminderSentAt` plays
  for a task: claimed before the send, so a restart mid-morning or two overlapping ticks cost a
  notification rather than repeat one. Claimed **conditionally** (`pushedAt IS NULL AND
hiddenUntil IS NULL`) in the same statement that inserts it, which is what makes a dismissal
  at seven in the morning cancel that morning's push.
- `hiddenUntil` — a household-local date, and **both** of the banner's answers: "remind me
  tomorrow" writes tomorrow, "Got it" writes `closureDate` itself, which no day in the window
  can reach because the window ends the day before the shops shut. One column, because "for
  good" and "for now" differ only in how long (→ [DECISIONS #131](DECISIONS.md)).

Per member, not per household: one person tapping dismiss must not silence the housemate who is
actually doing the shopping. Rows for closures already under way are unreadable by definition
and are deleted by the morning sweep, so the table stays at a couple of dozen rows a year.

### `push_subscriptions`

- One row per browser/device (`endpoint` unique, upsert on re-subscribe). Send failures with
  status 404/410 delete the row (pruning). A user may have several (phone + laptop).
- `locale`: the language _this device_ was reading in when it subscribed. A push goes to a
  device, so this is what makes "follow the system language" true for notifications and not
  just for pages; an explicit `members.locale` outranks it, and `deliver` encodes one payload
  per language actually in play (→ [DECISIONS #98](DECISIONS.md)).

### `cook_timers`

- Server-side alarm for locked-phone delivery: `endsAt` (+`label`, `recipeId`, `stepIndex` for
  the notification deep link `/cooking/recipes/{id}/cook?step={i}`). `notifiedAt` =
  idempotency; `canceledAt` set on cancel (pause v1 = cancel + recreate on resume with shifted
  `endsAt`). Precision: in-process `setTimeout` scheduled at creation + the minute cron as
  catch-up after restarts (→ ARCHITECTURE.md).
- Up to `TIMERS_MAX` (3) live rows per `(household_id, user_id)`, counted inside `startTimer`'s
  transaction; a start may name **one** row it replaces, cancelled in the same transaction
  (that is what "+1:00" and resume are). Nothing at the SQL level enforces the cap, because a
  count is not a key (→ [DECISIONS #102](DECISIONS.md)).
- `cook_timers_person_idx (household_id, user_id, ends_at)` — `cook_timers_ends_idx` is sized
  for the sweep's range scan; this is the different access pattern the app-wide dock added,
  "what is this person watching?", asked once per document load.

### `feedback`

- **The row is the receipt; the issue is a copy of it** (→ [DECISIONS #136](DECISIONS.md)). One
  synchronous insert is all the member's tap depends on; `issueNumber` is the flag that says the
  copy exists, and a NULL one _is_ the sweep's queue. So GitHub being down, or a token nobody has
  configured yet, costs a sync and never a report.
- `body` is household content — stored exactly as typed, never translated (→ SPEC §9). Beside it
  is the diagnostic envelope captured at submit time, because "which version was that on?" is
  unanswerable an hour later: `locale`, `theme` (NULL = follow the device), `appVersion`,
  `userAgent`. `memberName` is a snapshot for the same reason `task_completions.memberName` is —
  the member reference is ON DELETE SET NULL and a report outlives the membership.
- **Retry is a column, not arithmetic.** `nextAttemptAt` is an instant (like a timer's `endsAt`),
  so the queue is one indexed range scan; `attempts` drives a 5 min → 6 h doubling backoff, and a
  row parks at 8. `claim` books the next slot _before_ the API call, so the fire-and-forget send
  and a cron tick landing together cost one attempt rather than two issues.
- **A permanent refusal parks immediately** — a bad token, an invisible repository, a label that
  doesn't exist. All three are fixed by changing configuration and redeploying, so the first
  sweep of a new process un-parks everything and tries once more. `lastError` stores the error
  _code_ only: a response body can quote the request that produced it, token and all.
- The issue body carries `<!-- choreganized:{id} -->`, which a retry searches for before writing
  a second issue. Best effort — GitHub's search index lags — so a duplicate is still possible,
  and the marker is what makes two of them recognisable as one report.
- `feedback_pending_idx (issue_number, next_attempt_at)` is the sweep's range scan; a row that
  succeeds drops out of it. `feedback_household_idx (household_id, created_at)` is the read.

### `ledger_people` / `expenses` / `expense_shares` (→ plan 29, SPEC §11)

- **Money is an integer of the currency's minor unit** (`amountMinor`, `shareMinor`), never a
  float (→ [DECISIONS #169](DECISIONS.md)). The household has one currency
  (`households.currency`, default `EUR`), which the owner can change only while the household
  has no expense rows at all — deleted ones included (→ #170).
- **`ledger_people` is "anyone who can pay or share"** (→ #168). One row is written in the same
  transaction as every membership (`services/household.ts` `insertMember`; migration `0017`
  backfilled the existing ones), and **outlives it**: leaving or removal writes the member's
  name and colour into the row and sets `memberId` NULL, so a balance a former member still owes
  stays readable. While the membership lasts, the `members` row is the truth for name and colour
  (`listPeople` joins it). `userId` (plain text, not a foreign key) remembers the user behind the
  membership, so someone who leaves and joins again gets the same person back, debts included
  (→ #174). `kind = 'guest'` is reserved for people outside the household; nothing
  writes it yet. A person is never deleted except with the household, so the references to it
  cascade rather than restrict (a RESTRICT would make deleting a household fail).
- **An expense and a payment are the same row** (→ #167): `kind = 'payment'` is paid by the
  sender, has no description or category, and one share — the recipient's, the whole amount.
  So the balance is one formula over every row: `Σ amountMinor where paidById = p − Σ shareMinor
where personId = p`. Always derived on read, never stored; there is no reset.
- **`Σ shareMinor = amountMinor` for every expense.** The service splits on the server from what
  was typed (`expense_shares.input`: cents for `amounts`, a percentage ×100 for `percent`, a count
  for `shares`, NULL for `equal`) with `utils/money` `splitAmount` — largest remainder, ties to
  the earlier person — and writes the shares in the transaction that writes the expense.
- **Delete is soft.** `deletedAt` is set by Delete and cleared by its undo bar; every read
  filters it out; the 03:30 cleanup (`cron.ts`) removes rows deleted more than a day ago.
- **The default split** is `households.splitDefaultMode` (`equal` = everyone) plus each person's
  `ledger_people.defaultWeight` for `percent` / `shares`. A member who joins later has none, so a
  percentage default never silently includes them (→ SPEC §11.5).
- `expenses_household_date_idx (household_id, date)` serves the ledger read, which loads a
  household's rows whole (→ #172); `expense_shares_person_idx` serves the person lookups.

### `expense_recurrences` / `expense_recurrence_shares` (→ plan 30, SPEC §11.9)

- **A series is a template and a date.** `expense_recurrences` holds what each occurrence copies
  (description, category, `amountMinor`, payer, `splitMode`) plus `unit` (`week` · `month` ·
  `year`) and `interval` (every N units, 1–99, default 1 — quarterly is 3 months; → #189),
  `anchorDay` (1–31 for months and years, NULL for weeks) and `nextDate`, the
  household-local date the next occurrence is due. `expense_recurrence_shares` keeps only what was
  typed per person (`input`, as in `expense_shares`); the shares are split again from it, at the
  template's amount, for every occurrence, in roster order (→ #169, #175).
- **`nextDate` is the sweep's only memory** (→ #175). From 06:00 household-local, every minute,
  `materializeDue` logs each due occurrence as an ordinary expense dated `nextDate`, with
  `expenses.recurrenceId` pointing back, and moves `nextDate` on with `utils/dates` `addRepeat`
  in the same transaction — guarded by `nextDate` still reading what was read. Catch-up after
  downtime is the loop; running twice logs nothing twice. `expense_recurrences_due_idx
(household_id, next_date)` makes the every-minute "anything due?" one index probe.
- **The anchor stops drift**: a month clamps to its last day without forgetting the 31st.
  Editing the series keeps the anchor unless the next date, the unit or the interval changes.
  `addRepeat(date, unit, anchorDay, interval)` steps N months as one jump from the anchor, so
  every-N-months clamps exactly as monthly does.
- **Stopping sets `stoppedAt`**; the row stays and so do its occurrences. Leaving or removal
  stops every running series the member's ledger person pays or shares in, in the departure's
  own transaction (`services/household.ts` `departMember`, → #180).
  `expenses.recurrenceId` is `ON DELETE SET NULL` (added by hand to migration 0019, → #175), so
  even deleting a series would leave the expenses it logged.
- `members.notifyExpenses` (default on) silences the expense notices for one member (→ #176).

(`user`, `session`, `account`, `verification`)

Hand-written to Better Auth 1.6 core schema (drizzle adapter maps on property names) and
verified field-by-field against 1.6.23's generated reference in plan 00 — all timestamps are
`timestamp_ms`, `verification.created_at/updated_at` are NOT NULL and `identifier` is indexed
(migration 0001). `verification` also holds the OAuth state during the Google round-trip, so
it's live from the first sign-in. Since plan 31 it also holds the email sign-in codes
(identifier `sign-in-otp-<email>`, value the **hashed** code plus its attempt count, 10-minute
expiry → DECISIONS #178). No table of its own. After a Better Auth upgrade, re-run the diff:
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
  shop closure: a run of shut days starting within 3 days (→ utils/holidays.ts) → one push per
                member, claimed in holiday_notices (skip away members, unclaimed; skip anyone
                who has hidden it, and anyone with notifyShopClosures off — claimed)
timers: cook_timers where endsAt <= now and notifiedAt/canceledAt IS NULL → push, set notifiedAt
feedback: rows with issue_number IS NULL and next_attempt_at <= now → create the issue, store
          the number (household-blind: "GitHub was down" is not a time of day)
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
