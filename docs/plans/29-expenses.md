# 29 · Expenses: log, split, settle up

**Status: done (2026-10-26).** Depends on: 10 (settings), 09 (history paging shape).
SPEC: [§11](../SPEC.md) "Expenses".
Design: **[`design/Expenses.dc.html`](../../design/Expenses.dc.html)**, frames [9a]–[9g] and
their state variants (SPEC §11 lists them). Open it in a browser and build to the pixels.

**Goal:** the fifth tab. A member logs what they (or a housemate) paid, splits it four ways,
and sees at a glance who owes whom, with the house's debts reduced to the fewest payments.
Recurring expenses and push are plan 30.

## From the design

Things the frames decided that the build must carry:

- **The tab bar** [9a-tabbar]: icons only, and the active tab gets a sage pill with its label.
  _Built: the bar already worked that way_ (→ DECISIONS #171, corrected); plan 29 only added
  the fifth tab and its `ReceiptIcon`. Every screen with a tab bar still gets a new baseline,
  because the icons are spaced for five.
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
(cents) everywhere. Floats never touch it (→ DECISIONS #169).

```ts
households.currency            text NOT NULL DEFAULT 'EUR'   // ISO 4217; locked once expenses exist
households.splitDefaultMode    text enum('equal','percent','shares') NOT NULL DEFAULT 'equal'

ledger_people                                     // the "person" seam (→ DECISIONS #168)
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

- [x] Logging "Groceries €42.10, paid by me, split equally" takes amount, description, Save:
      three interactions, no more.
- [x] Logging a housemate's spend and a spend I'm not part of both work, and the "your part"
      wording is right for each.
- [x] All four split modes, with the live remainder footer. Done is disabled until it adds up.
- [x] Household default split 30/70 set from [9c] and from Settings, then used by the next new
      expense.
- [x] A→B→C→A €10 cycle shows "All settled up" for all three (seed a third member).
- [x] Settle up from a balance line is prefilled. A partial payment leaves the remainder.
- [x] History search + each filter, month paging, filters survive back.
- [x] A member leaves owing money: the warning shows, the balance stays as "Former member",
      and settling it removes them from pickers.
- [x] Currency locked after the first expense. `€ 24,50` in Austrian German (`de-AT`'s own
      order), `€24.50` in English.
- [x] Both themes, 390px, five-tab bar fits in both languages.
- [x] Screens match `design/Expenses.dc.html`, including the tab bar on all five tabs.
- [x] `npm run verify` + `npm run test:visual` clean (baselines refreshed for the tab bar).
      DATA-MODEL, ARCHITECTURE routing map and DECISIONS updated.

## Deviations & notes

- **Recent is the 20 latest rows**, not this month's (→ DECISIONS #173): on the 1st, "this
  month" would be an empty list under a balance that isn't.
- **The default split is anyone's**, from [9c]'s link or Settings; the currency stays the
  owner's (→ #173). An equal split over a subset becomes a one-share-each default.
- **History filters in memory** over the one ledger read the balance already needs
  (→ #172), which is also what lets the search match inside words in any case.
- **`ui/UndoToast`** came out of shopping's `UndoBar`, which now wraps it. On the Expenses tab
  the FAB stands down while it is up: the e2e journey caught the FAB covering Undo.
- **The seed** (`scripts/seed.ts`) now writes ledger people for its hand-inserted members and a
  week of expenses with one settle-up, so the tab, the visual suite and `npm run db:seed` all
  open on a balance.
- **The Recurring menu entry, the repeat badge and the push** wait for plan 30.
- **Second review, fixed before merging** (→ DECISIONS #174): a rejoining member gets their old
  person back (`ledger_people.user_id`, migration 0018); the default split names current members
  only; a picked suggestion keeps its category through edits; a payment row shows its clock time
  only when logged that day; the undo bar's `?deleted=` is checked by the load; History's search
  field no longer loses typing to a slow reply; `DeleteExpenseForm` is shared by both edit sheets;
  `listLedger` takes the people its caller already read.
- **The 9a frame's "SATURDAY · 22 NOV" day heads** use the app's existing `m.date.dayLabel`
  ("Sat 22 Nov"), the same as the task history.

## What was verified, and how

Against the `verify` preview (E2E_MODE, `data/verify.db`, a fresh sign-up seeded with
`db:seed`), at 390×844:

| Case                 | How                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Three interactions   | Amount, then "What for?" (a past description picked inside the word "billa", which also picked Groceries), then Save                            |
| Split modes          | % with two people: typing 30 filled 70, "Adds up to 100%", money per row; Amounts and Shares by the unit and e2e suites                         |
| Default 30/70        | "Make this the household default" from [9c], then the next new expense opened on "By % · Lukas 30 · Elisabeth 70"; Settings → Expenses names it |
| Balance              | €31.30 → €48.52 after a 30/70 €24.60 (exactly Elisabeth's €17.22 share)                                                                         |
| Settle up            | Opened prefilled with €48.52; €40 left €8.52; the rest gave "All settled up" [9a-settled]                                                       |
| Detail, delete, undo | [9e] with "owes you €17.22 for this"; delete from the detail returned to the tab with the undo bar; restore in the e2e journey                  |
| History              | `?mine=1`, and `?q=STROM` finding "Strom · Wien Energie"                                                                                        |
| Home line            | "You owe Elisabeth €17.22" after the settled expense was deleted                                                                                |
| Remove warning       | Members → Elisabeth → Remove: "Elisabeth is still owed €17.22 — settle up first?" (cancelled, not removed)                                      |
| Dark + German        | [9a-dark] colours, "Du schuldest € 17,22", the five-tab bar with "Ausgaben"                                                                     |

The owner can't leave while a housemate exists, so the leave confirm's line was not seen on
screen; it is the same function as the removal note. The A→B→C→A cycle and a departed member's
frozen balance were not walked in a browser (the seed has two members); the integration suite
covers both through the real services.
