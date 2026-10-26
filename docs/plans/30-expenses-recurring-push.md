# 30 · Expenses: recurring series and notifications

**Status: todo.** Depends on: 29, 05 (push), 06 (the reminder shape).
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

- [ ] Monthly rent on the 1st appears at 06:00 household-local, with the push "Rent was added ·
      your share …" in each recipient's language.
- [ ] Server down for two days → both occurrences once each.
- [ ] Edit one occurrence vs. edit series vs. stop: each does only what it says.
- [ ] Toggle off → no expense pushes, everything else unchanged.
- [ ] `npm run verify` + `npm run test:visual` clean, docs + DECISIONS updated.
