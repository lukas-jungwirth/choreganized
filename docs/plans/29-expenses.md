# 29 · Expenses: log, split, settle up

**Status: todo.** Depends on: 10 (settings), 09 (history paging shape).
SPEC: [§11](../SPEC.md) "Expenses".
Design: **[`design/Expenses.dc.html`](../../design/Expenses.dc.html)**, frames [9a]–[9g] and
their state variants (SPEC §11 lists them). Open it in a browser and build to the pixels.

**Goal:** the fifth tab. A member logs what they (or a housemate) paid, splits it four ways,
and sees at a glance who owes whom, with the house's debts reduced to the fewest payments.
Recurring expenses and push are plan 30.

## From the design

Things the frames decided that the build must carry:

- **The tab bar changes for every tab** [9a-tabbar]: icons only, and the active tab gets a
  sage pill with its label. That is a change to `shell/TabBar`, so every screen's visual
  baseline moves with this plan. Refresh them on purpose, in the same PR.
- **Dark money colours** [9a-dark]: owed `#93C2A2`, owe `#E6AA78`, each on a 14% tint of
  itself. They become `light-dark()` tokens in `app.css` (e.g. `--owed`, `--owe`,
  `--owed-tint`, `--owe-tint`), not hexes in components.
- **Money uses tabular figures** everywhere. One utility class or token in `app.css`.
- The ••• menu [9a-owe] holds Recurring (count), All activity and Expense settings.

What the design pass was asked for, kept as the checklist the frames were drawn against:

- **[9a] tab**: balance card in its three states (owed · owe · settled), with one, two and
  three settle-up lines (2-person and 3-person households). The recent list with an expense
  row in each of its three "your part" states plus a payment row. FAB. Overflow menu (plan 30:
  "Recurring").
- **[9b] add/edit sheet**: the amount as the hero. Description with suggestions open.
  Category chips. Paid-by avatar chips. The split summary row. Edit mode with Delete.
- **[9c] split sheet**: all four modes, including "left to assign" (danger) and "adds up"
  (sage). Someone unchecked. The "make this the default" link.
- **[9d] settle up**: from → to as two avatar rows with an arrow, and the amount.
- **[9e] detail**: per-person shares, who paid, "added by · edited by", category, date,
  repeat badge (plan 30).
- **[9f] all activity**: search open, filter chips with one active, a month header with its
  total.
- **[9g] empty state**: in the family of [7d]/[7e]/[7f].
- Tab bar with **five** items at 390px, plus the Home "you're owed" line.
- Both themes (SPEC §10). Sage = owed and terracotta = owe must read in dark too. Member
  colours stay identical.
- Tokens only. If money needs a tabular-figures style, that is a new token or utility class
  in `app.css`, not a one-off.

## Data model

New tables, all household-scoped (DATA-MODEL principle 1). Money is **integer minor units**
(cents) everywhere. Floats never touch it (→ DECISIONS #168).

```ts
households.currency            text NOT NULL DEFAULT 'EUR'   // ISO 4217; locked once expenses exist
households.splitDefaultMode    text enum('equal','percent','shares') NOT NULL DEFAULT 'equal'

ledger_people                                     // the "person" seam (→ DECISIONS #167)
  id, householdId → households CASCADE
  memberId → members SET NULL, UNIQUE where not null   // null = former member (later: guest)
  kind      text enum('member','guest') NOT NULL DEFAULT 'member'   // 'guest' reserved, unused
  name      text NOT NULL                          // kept in sync with displayName; frozen on leave
  color     text NOT NULL                          // same
  defaultWeight integer                            // percent ×100 (3000 = 30%) or shares; null = not in default
  createdAt
  INDEX (householdId)

expenses
  id, householdId → households CASCADE
  kind        text enum('expense','payment') NOT NULL
  description text                                 // NULL for payments
  category    text enum(CATEGORY_KEYS)             // NULL for payments
  amountMinor integer NOT NULL CHECK > 0
  date        text NOT NULL                        // household-local YYYY-MM-DD
  paidById    → ledger_people RESTRICT NOT NULL
  splitMode   text enum('equal','amounts','percent','shares') NOT NULL
  recurrenceId                                     // plan 30
  createdByMemberId / updatedByMemberId → members SET NULL
  createdAt, updatedAt
  deletedAt   integer                              // soft delete: the undo bar, then purged nightly after 24 h
  INDEX (householdId, date), INDEX (householdId, paidById)

expense_shares
  expenseId → expenses CASCADE, personId → ledger_people RESTRICT
  shareMinor integer NOT NULL CHECK >= 0           // what this person owes of it
  input      integer                               // what was typed: cents · percent×100 · shares; NULL for equal
  PRIMARY KEY (expenseId, personId)
```

- **Invariant**: `Σ shareMinor = amountMinor` for every expense. It is enforced in the
  service, inside the transaction that writes the rows, and pinned by a test.
- **A payment** is `kind='payment'`, `paidById` = who paid, and one share row for the
  recipient holding the whole amount. That way one formula covers the balance.
- **`ledger_people` lifecycle**: one row is created in the same transaction as every
  membership (create household, join). Renaming or recolouring a member updates it. Leaving
  or removal sets `memberId` NULL (FK), and the row stays with its frozen name. The RESTRICT
  on shares and payer means a person with history can never be deleted. A former member with a
  zero balance is hidden from pickers.
- Migration: backfill one `ledger_people` row per existing member.

## Build

- `lib/utils/money.ts` (unit-tested, pure):
  - `parseAmount(text, locale)` → minor units | null (handles `12,50`, `12.50`, `1.234,50`).
  - `formatMoney(minor, currency, locale)` through `Intl.NumberFormat`, fraction digits from
    the currency.
  - `splitAmount(amountMinor, mode, rows)` → shares (largest remainder, ties by list order).
  - `netBalances(expenses)` and `settlePayments(balances)`: greedy, largest debtor against
    largest creditor, with a deterministic tie order.
- `lib/server/services/expenses.ts`: `listRecent`, `listHistory(filters, month)`, `getExpense`,
  `saveExpense` / `savePayment` (create or update, re-validates the split server-side, never
  trusts client shares), `deleteExpense` / `restoreExpense`, `balances`, `suggestions`
  (descriptions → last category), `setDefaultSplit`, `setCurrency` (owner, refused once rows
  exist). `householdId` first, in every function.
- `services/household.ts`: create/join/leave/remove/rename keep `ledger_people` in step,
  inside their existing transactions.
- Routes: `(app)/expenses` (tab + actions) and `(app)/expenses/history`. Sheets as
  components under `lib/components/expenses/`. The tab is added to `shell/TabBar`.
- Home: the balance line in `services/home.ts` + one component.
- Settings: Household → Expenses row (currency, default split).
- Cron: purge soft-deleted expenses older than 24 h in the existing 03:30 cleanup.
- i18n: `m.expenses.*` in `en.ts` + `de.ts`, category names, all money copy as functions.
- `/dev/kit`: add the new feature components.

## Tests

- **Unit** (`money.test.ts`): rounding for €10 / 3 → 334/333/333, with ties by order. Percent
  and shares summing exactly. Parse for both locales, plus rejections (0, negative, 3
  decimals, letters). Simplify: the A→B→C cycle → no payments. 4 people → at most 3 payments.
  Two people → one line. Σ balances = 0, as a property test over random expenses.
- **Integration** (`expenses` service, in-memory SQLite): household scoping (another
  household's expense id → not found). Server recomputes the shares. Edit keeps the
  invariant. Payment moves balances. Leave keeps the balance under the frozen name. Currency
  lock. Delete + restore.
- **Conventions**: the new routes call `requireMember`. Nothing else is needed, since the
  guards test already walks routes.
- **Playwright**: add an expense split equally → both members see the balance. Change it to
  30/70 → numbers move. Settle up → "All settled up". Search finds it.
- **Visual**: baselines for [9a] (owed state), [9b], [9c] (%, not adding up), [9f], [9g]. The
  visual-coverage convention will ask for them.

## Acceptance

- [ ] Logging "Groceries €42.10, paid by me, split equally" takes amount, description, Save:
      three interactions, no more.
- [ ] Logging a housemate's spend and a spend I'm not part of both work, and the "your part"
      wording is right for each.
- [ ] All four split modes, with the live remainder footer. Done is disabled until it adds up.
- [ ] Household default split 30/70 set from [9c] and from Settings, then used by the next new
      expense.
- [ ] A→B→C→A €10 cycle shows "All settled up" for all three (seed a third member).
- [ ] Settle up from a balance line is prefilled. A partial payment leaves the remainder.
- [ ] History search + each filter, month paging, filters survive back.
- [ ] A member leaves owing money: the warning shows, the balance stays as "Former member",
      and settling it removes them from pickers.
- [ ] Currency locked after the first expense. `24,50 €` in German, `€24.50` in English.
- [ ] Both themes, 390px, five-tab bar fits in both languages.
- [ ] Screens match `design/Expenses.dc.html`, including the new tab bar on all five tabs.
- [ ] `npm run verify` + `npm run test:visual` clean (baselines refreshed for the tab bar).
      DATA-MODEL, ARCHITECTURE routing map and DECISIONS updated.
