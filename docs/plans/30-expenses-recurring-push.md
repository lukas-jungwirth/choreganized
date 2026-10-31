# 30 · Expenses: recurring series and notifications

**Status: done (2026-10-27).** Depends on: 29, 05 (push), 06 (the reminder shape).
SPEC: [§11.9 and §11.11](../SPEC.md) (recurring, notifications).
Design: [`design/Expenses.dc.html`](../../design/Expenses.dc.html): **[9h]**, `9h-stop`, the
"Repeats" row in [9b] and the repeat badge in [9e].

**Goal:** rent and subscriptions log themselves, and the people in an expense hear about it.

## Data model

```ts
expense_recurrences
  id, householdId → households CASCADE
  description, category, amountMinor, paidById → ledger_people RESTRICT, splitMode
  unit        text enum('week','month','year') NOT NULL
  anchorDay   integer                 // day of month (1–31) for monthly/yearly; clamps to month end
  nextDate    text NOT NULL           // household-local YYYY-MM-DD, the next occurrence
  stoppedAt   integer                 // NULL = running
  createdByMemberId → members SET NULL, createdAt, updatedAt

expense_recurrence_shares             // same shape as expense_shares
  recurrenceId → CASCADE, personId → ledger_people RESTRICT, input, PRIMARY KEY (recurrenceId, personId)

expenses.recurrenceId → expense_recurrences SET NULL
members.notifyExpenses integer boolean NOT NULL DEFAULT 1
```

Shares are recomputed from `input` on every occurrence, because the amount may have been
edited. The anchor day stops a monthly series that started on the 31st from drifting to the
28th forever. `addInterval` in `utils/dates.ts` gains a clamp-to-anchor variant if it lacks
one.

## Build

- `services/expense-recurrences.ts`: CRUD + `materializeDue(householdId, today)`. In one
  transaction per occurrence: insert the expense and its shares, then advance `nextDate`. Loop
  while `nextDate <= today`, which is the catch-up, and it is idempotent because the advance
  and the insert commit together.
- `cron.ts`: one registry line, gated at 06:00 household-local like the other time-of-day jobs.
- `services/expense-notify.ts`: `sendToMember` per person in the expense, minus the actor,
  respecting `notifyExpenses` and the recipient's language. Called after commit by save,
  edit (only when that person's share changed), payment (recipient only) and
  `materializeDue`.
- UI: the "Repeats" row in [9b], the repeat badge in rows and detail, [9h] from the tab's
  overflow, "Edit series" / "Stop repeating". Settings → Notifications → Expenses toggle.

## Tests

- Unit: anchor clamping, i.e. 31 Jan → 28 Feb → 31 Mar, and 29 Feb yearly.
- Integration: catch-up after 3 missed months creates 3, and running it twice creates 3.
  Editing the template doesn't touch past rows. Stop keeps history. Notify skips the actor,
  the opted-out and non-participants. An edit with an unchanged share sends nothing.
- Playwright: create a monthly expense dated last month, run the sweep in E2E mode, and see
  this month's copy appear.

## Acceptance

- [x] Monthly rent on the 1st appears at 06:00 household-local, with the push "Rent was added ·
      your share …" in each recipient's language.
- [x] Server down for two days → both occurrences once each.
- [x] Edit one occurrence vs. edit series vs. stop: each does only what it says.
- [x] Toggle off → no expense pushes, everything else unchanged.
- [x] `npm run verify` + `npm run test:visual` clean, docs + DECISIONS updated.

## As built

DECISIONS #175–#177. Where it differs from the sketch above:

- **`ledger_people` references cascade**, like plan 29's (`expenses.paidById`,
  `expense_shares.personId`), not RESTRICT: a person is only ever deleted with the household.
- **No `sendToMember`**: `services/expense-notify.ts` splits "who hears what"
  (`expenseNotices`, synchronous, what the tests read) from sending (`notifyExpense`, through
  `push.ts` `sendToUser`, which already resolves each device's language). The services call it
  after their transaction commits.
- **Recurring notices go to the payer too**, and every notice names the description rather than
  the category (→ #176).
- **The series starts from an expense** — `createExpense` / `updateExpense` take a `repeat` unit
  — and `addRepeat` is a new helper beside `addInterval` rather than a variant of it.
- **Rounding follows the roster.** A template's rows are split in `listPeople` order, so an
  occurrence's odd cent goes where the original expense's did; the integration suite caught the
  primary-key order giving it to someone else.
- **`POST /api/e2e/recurring-expenses`** runs the sweep for the Playwright journey (404 outside
  E2E mode).

## What was verified, and how

| Case                    | How                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anchor clamping         | `utils/dates.test.ts`: 31 Jan → 28 Feb → 31 Mar → 30 Apr; 29 Feb yearly → 28 Feb ×3 → 29 Feb 2032                                                                                                                        |
| Catch-up, idempotent    | Integration: three missed months → three expenses, a second run → none; same for the Playwright journey (two sweeps, one copy)                                                                                           |
| 06:00 gate, real cron   | Production build on a copy of the e2e DB, a series due today: household in `Pacific/Pago_Pago` (04:2x) → nothing over two ticks; switched to `Europe/Vienna` (16:2x) → one expense on the next tick, `nextDate` → 27 Nov |
| One vs. series vs. stop | Integration (past rows keep their amount; the next one takes the new amount and %; an occurrence edit leaves the template; stop keeps every row); e2e on [9h] edit + stop                                                |
| Notices                 | Integration on `expenseNotices`: actor, non-participant and opted-out skipped; unchanged share → none; payment to its recipient only; repeat to everyone with a share; exact English and German sentences                |
| Toggle                  | Settings → Benachrichtigungen → Ausgaben: on by default, off persisted across a reload (`verify` preview, German)                                                                                                        |
| Screens                 | [9h], [9h-stop], the Repeats row and the detail's pill as visual baselines; dark + German tab with the menu's "Wiederkehrend 1" and Strom's badge; "Serie bearbeiten" opens on the next date, min today, no "Nie"        |

**Not verified: a real push on a device.** The preview browser has notifications hard-denied, and
VAPID is off under the test runners, so the notice sentences are proven by the integration suite
and the delivery path is `push.ts`'s, unchanged. Worth one look on a phone on the test
environment: log an expense split with a housemate and check their lock screen.
