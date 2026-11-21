# 38 · Guests in Expenses: share a cost with someone outside the household

**Status: done (2026-11-21, v0.6.0).** Step 1, guests in the ledger (DECISIONS #282–#287), and step 2, the link and the page (#288–#291). Asked for by Lukas on 2026-11-21:
"it is possible to add external persons to share the spendings. For example we are doing a
trip with a friend that is not in the household so we can also track his share." Depends on:
29, 30 (both done).
SPEC: §11 gains a new §11.15 "Guests"; §11.1, §11.3, §11.4, §11.5, §11.8, §11.10 and §11.14
change as described below. Design: **`design/sketches/expense-guests.html`**, frames
**[G1]–[G8]**. Open it in a browser. The example in it (a weekend with Jonas) is the seed for
the tests.

**Goal:** a guest is a name in the tally and nothing more: no account, no membership, no
chores, lists or points. The household adds one at the moment a cost is split with them, and
can send them a link to a read-only page with their share. The model was prepared for this in
plan 29: `ledger_people.kind = 'guest'`, `memberId` and `userId` NULL (→ DECISIONS #168).

## What it does

1. **Add a guest where you need one** [G1] [G2]: the last row of the split sheet's people list
   and the last entry of the "who paid" picker ("Someone else…"). Both open one small sheet
   with a name field.
2. **A guest is a person in the ledger**: can share, can pay, stands in the balance card, the
   settle-up pickers, the detail, All activity and its search, exactly like a member [G3].
3. **Manage guests in Expense settings** [G4] [G5]: rename, "Include in new expenses", the
   link, remove.
4. **A private read-only page per guest** [G6] [G7] [G8], opened from a link the household
   sends itself.

## The rules

**Who may.** Any member may add, rename, share and remove a guest, as with expenses (§11.3).

**Adding.**

- Name: required, trimmed, the member name limit (`lib/utils/household.ts`). Refused when an
  active person in the household (member or guest) already has that name, compared without
  case: two rows called "Jonas" cannot be told apart in a picker.
- Colour: the first member-palette colour no active person uses, else the least used. Not
  choosable.
- At most 10 active guests per household.
- From the split sheet the new guest is ticked in. From the payer picker the new guest is the
  payer. `<select>` cannot hold a button, so the picker ends with an option "Someone else…"
  that opens [G2] and puts the previous payer back if the sheet is closed without adding.

**How a guest looks.** An outlined avatar (tinted disc, the letter and a ring in the guest's
colour) and a "Guest" tag ("Gast") in pickers and lists [G1]. `Avatar` gets a `guest` variant;
don't fork it.

**Default split.** A guest is never part of it: no `defaultWeight`, and "Equally between
everyone" means the members. With a guest ticked in, [9c] does not offer "Make this the
household default".

**Include in new expenses** [G5]. One switch per guest, off when added. On: a new expense
starts with the default people plus that guest, split equally. Only offered while the
household default is _Equally_. With a _%_ or _Shares_ default the switch is disabled and says
"Only with an equal default split", and guests who had it on are simply not added. Recurring
series are not touched by the switch: a series keeps the people it was made with.

**Balances and who pays whom.** Unchanged (§11.6): one ledger, simplified over everyone. This
means the card can say "Jonas owes Elisabeth" although Jonas only shared costs with Lukas.
Accepted; say so in SPEC.

**Reminders.** A guest has no phone in the app. `Remind` never targets a guest and "Remind
everyone" skips them. The balance card has no share button of its own: **tapping a guest's name or avatar on the
card opens their sheet [G5]**, where the link is (step 1, since the sheet exists from then
on). In a row the name carries a small chevron [G3]. On the single-person card, Remind's place
holds a quiet button with the same target, "Jonas's page" ("Seite von Jonas").

**Notifications.** Nothing is sent to a guest. Members hear about an expense with a guest in
it the same way as today.

**Removing** [G5]. Only when the guest's balance is zero. The button is there but disabled
until then, with "Possible once Jonas is settled up." Removing: the guest leaves the pickers,
their link stops working, their name stays on every old expense. Any recurring series they pay
or share in stops, and the confirm names them, as when a member leaves (→ DECISIONS #180). A
removed guest cannot be brought back; adding the same name again makes a new person.

## The guest's page (step 2)

- **The link**: `/g/<token>`. The token is 32 random bytes, base64url, made the first time
  someone taps Share link or Copy, and stored on the guest's row. "Make a new link" replaces
  it after one confirm ("The old link stops working."). **Share link** uses the system share
  sheet where the browser has one (`navigator.share`, text "Here is what we shared:" plus the
  link), else it copies and says "Link copied".
- **What it shows** [G6]: "Hi {name}", the members' avatars with "Shared with Lukas and
  Elisabeth", then the balance as the app's own sentence from the guest's point of view ("You
  owe Lukas **€132.20**", one row per payment when there are several, "All settled up" [G7]).
  Under it, newest first, every expense the guest has a share in or paid, and every payment
  from or to them: description, date, category icon, who paid how much, and "your share". A
  totals line: what they paid, what their share comes to. A "Get the app" card the guest can close for good (added 2026-11-21 after Lukas tried it, → DECISIONS #292). A footer: "Read only. Lukas and
  Elisabeth keep this tally with Haushaltsheld.", plus the Impressum and Datenschutz links
  when they are configured (§13).
- **What it never shows**: any expense the guest is not part of, anyone else's share,
  balances between other people, the household's name, anything outside Expenses.
- **Nothing to do on it**: no forms, no actions, no sign-in, no install prompt, no live
  stream. A reload shows the current state.
- **A dead link** [G8] (unknown, replaced, or the guest was removed): one page for all three,
  status 404, naming nobody.
- **Language and theme**: the request's language as the app already detects it for a signed-out
  visitor, and the system's light or dark setting.
- **Headers**: `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`,
  `Cache-Control: private, no-store`.
- **Privacy**: the page shows first names and what was bought to whoever holds the link. That
  is the point of it, and why the link can be replaced. Lukas should add a line to
  `LEGAL_PRIVACY`; say so in the handoff.

## Build notes

- **Schema** (`ledger_people`, one migration, `npm run db:generate`): `shareToken` (text,
  unique, NULL), `includeInNew` (boolean, default false), `removedAt` (timestamp, NULL). Read
  DATA-MODEL first and update it.
- **Services**: guest functions live with the expenses service, `householdId` first, the
  checks inside the transaction. The page's read is the one function that starts from a token
  instead of a household: it resolves the token to a guest and their household, then reads
  through the same balance and simplification code the tab uses, so the page and the app can
  never disagree. Compare tokens in constant time or look them up by the unique index only.
- **Route**: `src/routes/g/[token]/`, outside `(app)`, beside `/j` and `/legal`. Add it to
  `PUBLIC_PAGES` in `tests/conventions/guards.test.ts` with its reason.
- **Members-only code paths**: everything that today filters `memberId !== null` to mean
  "people of this household" (the default split, Remind, the settings sheet) needs a look.
  Former members and guests are both non-members, and they are not the same thing.
- **Copy**: every string in `en.ts` and `de.ts`, German "Gast", "Gast hinzufügen", "Jemand
  anderes…", "Link teilen". No em dashes in copy.
- **Version**: a feature, so the next minor, measured against the last `v*` tag.
- Log the judgment calls in DECISIONS (next free number at build time), at least: guests
  outside the default split, simplification across guests, the token stored readable so the
  link can be shown again, the dead-link page naming nobody.

## Two steps, each ships on its own

**Step 1 · Guests in the ledger.** Schema, services, [G1] [G2] [G4], [G5] without the link
box, the guest avatar, [G3], the "Someone else…" payer entry, SPEC
and DATA-MODEL.

**Step 2 · The link and the page.** [G5]'s link box, `/g/<token>`
with [G6] [G7] [G8].

## Tests (→ TESTING.md)

- **Unit**: balances and simplified payments with a guest who shares and one who pays (the
  sketch's four expenses give Elisabeth → Lukas €167.60 and Jonas → Lukas €132.20); the new
  expense's starting people with the switch on and off, and with a _%_ default.
- **Integration**: adding (name clash, the cap of 10, another household's guest is
  unreachable); removing is refused while a balance is open and stops the guest's series;
  a replaced token no longer resolves; the page's data for Jonas does not contain an expense
  he is not part of, nor anyone else's share.
- **Convention**: `/g/[token]` on the public list with a reason.
- **Playwright**: add a guest from the split sheet, save the expense, see the guest on the
  balance card; copy the link, open it in a context with no session, read the balance and the
  share; replace the link and see the old one answer with [G8].
- **Visual**: baselines for [G1], [G3], [G5] and [G6], and the 200% text size run for [G6].

## Acceptance

- [x] A guest can be added from the split sheet and from the payer picker, and is then ticked
      in or set as payer.
- [x] A guest never appears under Members, in task or list pickers, or in the default split.
- [x] An expense paid by a guest and shared by the household reads right on the tab, in the
      detail and in All activity.
- [x] Settle up can record a payment from and to a guest.
- [x] "Include in new expenses" adds the guest to the next new expense and to nothing else.
- [x] A guest with an open balance cannot be removed; a settled one can, and stays readable in
      history.
- [x] The link opens without a session and shows only that guest's balance and expenses, in
      English and German, light and dark, at 390px and at 200% text size.
- [x] A replaced link and a removed guest's link both show [G8].
- [x] `npm run verify` and `npm run test:visual` clean; SPEC, DATA-MODEL, DECISIONS and the
      status table updated.

## Not in this plan

Linking two Haushaltsheld households · trips or groups inside the ledger · guests adding or
changing anything · a guest becoming a member with their history · several currencies ·
e-mailing the link from the app.

## Open with Lukas

1. The sketch as a whole.
2. "Include in new expenses": worth its switch, or is ticking the guest in each time fine?
3. Simplifying payments across guests ("Jonas pays Elisabeth"), or keep a guest's debts with
   the people they actually shared with? The plan assumes the first, because it is the rule
   the app already has.
