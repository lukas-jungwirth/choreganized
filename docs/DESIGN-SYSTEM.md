# Design System

Source: [`design/Hearth.dc.html`](../design/Hearth.dc.html) — **open it in a browser and look
at it before building any screen.** Every token below was extracted from it and lives as a CSS
custom property in [`src/app.css`](../src/app.css). Components must use `var(--…)` — a raw hex
in a component is a bug.

Feel: soft paper background, white cards with hairline dividers, one sage green for actions,
terracotta for people & points, generous radii, Fraunces for anything display, quiet
uppercase micro-labels. Nothing shouts; even "overdue" is a calm tinted card.

## Tokens (names → see `src/app.css` for values)

| Group      | Tokens                                                                                                       | Used for                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Surfaces   | `--bg` `--card` `--sunken` `--sunken-2` `--field` `--tabbar-bg`                                              | screen bg / cards / inset chips & wells / segmented track / inputs in sheets / frosted tab bar  |
| Text       | `--ink` `--text-2…5` `--text-disabled`                                                                       | 6-step ramp; `--text-5` for uppercase labels; `--text-disabled` for placeholders & struck items |
| Sage       | `--sage` `--sage-strong` `--sage-hover` `--sage-tint` `--sage-tint-2` `--sage-row` `--sage-deep` `--on-sage` | primary buttons, active tab, checked circles, selected chips, highlight rows                    |
| Terracotta | `--terracotta` `--terracotta-tint(-2)` `--terracotta-deep`                                                   | points (`+10`), second member, "due today" meta                                                 |
| Danger     | `--danger` `--danger-tint` `--danger-border` `--danger-deep` `--danger-soft`                                 | overdue, destructive actions, badges; `-soft` = subtitle copy on a danger tint                  |
| Info       | `--info-tint` `--info-border` `--info-soft`                                                                  | the holiday banner [4a]; its title uses `--sage-deep`                                           |
| Accents    | `--gold` `--gold-tint`                                                                                       | crown / 1st place                                                                               |
| Members    | `--member-sage/-terracotta/-blue/-amber/-plum`                                                               | avatar palette (onboarding colour picker)                                                       |
| Lines      | `--border` `--border-soft` `--divider` `--divider-sheet` `--border-dashed` `--track`                         | input outlines / tab hairline / row dividers / dashed empties / progress track                  |
| Cook mode  | `--cook-bg` `--cook-text` `--cook-muted` `--cook-faint` `--cook-sheet` `--cook-amber` `--cook-surface`       | the one dark surface in the app; `-surface` = the 10% white its chips and buttons fill with     |
| Type       | `--font-display` (Fraunces) `--font-body` (Figtree)                                                          | see scale below                                                                                 |
| Radii      | `--r-input 14` `--r-button 16` `--r-block 16` `--r-card 20` `--r-card-lg 22` `--r-sheet 28` `--r-chip 999`   | `--r-block` = grouped block: quick-add [03], sheet menus [7c], add-a-store [7g]                 |
| Shadows    | `--shadow-card/-button/-fab/-sheet/-modal/-knob`                                                             | `-knob` is the toggle's white knob                                                              |
| Overlays   | `--scrim`                                                                                                    | behind sheets & modals                                                                          |
| Layout     | `--page-pad 22px` `--tabbar-h 84px`                                                                          |                                                                                                 |

One token is set by components rather than `:root`: **`--input-surface`**. TextField is white on
the paper background and `--field` inside a white sheet [3a], so BottomSheet and CenterModal set
it on their panel and every field inside adapts (→ [DECISIONS #37](DECISIONS.md)). Member-tinted
surfaces (feed check circles, selected member chips) are `color-mix`ed from the member's colour
because only sage and terracotta have tint tokens (→ [#35](DECISIONS.md)).

## Type scale (from the mockups)

| Style             | Font            | Size/weight                                      | Example                   |
| ----------------- | --------------- | ------------------------------------------------ | ------------------------- |
| Page title        | Fraunces 600    | 30px                                             | "Shopping", "Tasks"       |
| Greeting          | Fraunces 600    | 27px / 1.05                                      | "Good morning, Lukas"     |
| Sheet title       | Fraunces 600    | 22px                                             | "Add item", "New task"    |
| Card/recipe title | Fraunces 600    | 17–19px                                          | dinner card, recipe cards |
| Display numbers   | Fraunces 600    | 24px (stats) · 38px (invite code) · 52px (timer) |                           |
| Body              | Figtree 500–600 | 15px                                             | list rows                 |
| Meta              | Figtree 400–600 | 12–13px, `--text-4`                              | "Weekly · due today"      |
| Micro-label       | Figtree 700     | 11px, uppercase, ls .1–.12em, `--text-5`         | "GROCERY", "INVITE CODE"  |
| Cook step         | Fraunces 600    | 33px / 1.22                                      | step text                 |

## Recurring components (build once in `lib/components/ui`, reuse everywhere)

Built so far — plan 01: **Button · TextField · Avatar · ColorPicker** + `shell/Screen` (the
480px page shell for onboarding/login). Plan 02: **Card · AvatarStack · CheckCircle · Chip ·
SegmentedControl · Toggle · ProgressBar · Banner · EmptyState · FAB · BottomSheet ·
CenterModal**, plus `shell/TabBar` · `shell/PageHeader` and the bespoke icons in
`components/icons/`. Plan 03: **Select · Stepper** + `shell/SubHeader`. Plan 04: **DateField**.
Plan 05: **RowGroup**, `Banner` gained an acting/dismissable form, plus the feature component
**`components/EnablePush`** (the push permission state machine, in a Settings row or as Home's
one-time prompt card). Plan 07: **SearchField**, and `RowGroup` gained the `surface="sunken"`
variant the in-sheet menus [7c] are built from. Plan 09 added no primitives of its own — the
podium and the completed feed are the feature components **`components/tasks/Podium`** and
**`components/tasks/HistoryRow`**, composed from Card · Avatar · CrownIcon and RowGroup ·
CheckCircle — but `RowGroup` also gained `list`. Extend these rather than forking a variant;
look at them side by side at **`/dev/kit`** (dev-only gallery, → [DECISIONS #39](DECISIONS.md))
and add to it when you add a component.

- **Button** — primary (sage bg, white 700 16px, `--r-button`, `--shadow-button`), secondary
  (white, 1.5px `--border`), danger (only in confirm dialogs), dark (`--ink` bg — "Start cook
  mode"). Full-width by default; renders an `<a>` when given `href`.
- **TextField** — uppercase micro-label + white field, `--r-input`, sage border on focus,
  `error` prop for the message a failed form action sends back.
- **ColorPicker** — the member palette (`$lib/member-colors`) as a radio group; `taken`
  colours render disabled. Pair it with a 52px Avatar preview [5c].
- **RowGroup** — the white block a settings-style list sits in: `--r-card`, `--shadow-card`, a
  `--divider` hairline between every direct child, corners clipped. Settings' sections [6a] and
  the members list [6b] are that shape; `surface="sunken"` is the same block _inside_ a white
  sheet — `--field`, `--r-block`, no shadow — which is what the ••• menus [7c] and the day
  picker are. Padding stays on the row, as with Card; a row that is a component draws its own
  internal dividers. `list` renders a `<ul>` instead of the `<div>` — for the groups whose rows
  really are a list (the history feed [8a], plan 10's members [6b]); its rows must then be
  `<li>`s, since an `<li>` outside a list element is invalid markup and the browser exposes it
  as a listitem belonging to nothing.
- **SearchField** — the rounded field the recipe library [7e] and the plan sheet [3d] open
  with: magnifier, a real `type="search"`, and our own × (WebKit's is invisible on a tint and
  Firefox has none). Same surface rule as TextField — white on paper, sunken in a sheet.
- **Card** — white surface only: `--shadow-card` + `radius="lg"` (22, dashboard cards) or
  `"md"` (20, list & tile cards); renders an `<a>` with `href`, and sets `--input-surface` so
  fields inside it sink. Padding belongs to the caller, because it varies card by card;
  internal rows split by `--divider` (13–14px vertical, 15–16px horizontal).
- **BottomSheet** — `bind:open`, `title`, optional `eyebrow`; white, top radius `--r-sheet`,
  drag handle (38×5 pill `--border`), `--shadow-sheet`, `--scrim`. Native `<dialog>`: focus
  trap and Escape included, closes on scrim tap. Content is only mounted while open, so each
  opening starts from a clean form.
- **CenterModal** — completion celebration & confirms; same mechanics, `--r-sheet`,
  `--shadow-modal`, `dismissible={false}` for confirms.
- **Avatar** — circle, member colour bg, white initial, sizes 20/26/32/36/44/52; `ring` +
  `ringColor` for the cut-out ring (`--bg` on screen, `--card` on a card); "empty" variant
  dashed `--border-dashed`, optionally wrapping an icon (the + on "waiting to join" [5d]).
- **AvatarStack** — overlapping avatars; overlap and ring width derive from `size`
  (36 → −12px/2.5px, 26 → −9px/2px), so pass the size and nothing else. Decorative by default;
  pass `label` where the stack is the only place those people are named (the Home header, the
  standings strip) so screen readers still hear who's in the household.
- **Chip** — pill `--r-chip`, 1.5px border; selected = sage bg/white. Pass a member `color` and
  selection switches to that member's tint + hairline + darkened label. Stores, effort,
  assignees, snooze presets. Extra attributes are forwarded, and `class` is merged rather than
  replacing the base class.
- **SegmentedControl** — `--sunken-2` track r13, active segment white r10 + `--shadow-card`;
  `bind:value` over `{value,label}` options. Give the options an `href` and it becomes real
  navigation instead (`<nav>` + `<a aria-current="page">`) — that's the Tasks tab's To do /
  History switch (→ [DECISIONS #53](DECISIONS.md)).
- **Select** — TextField's shape around a real `<select>`: micro-label, `--input-surface`
  field, decorative chevron, optional `hint` line ("pcs · g · kg · ml · L …" [3a]).
- **DateField** — the same shape around a real `<input type="date">`: calendar icon, the value,
  and a `caption` reading it back in words ("Tomorrow · Jul 17" [3b]). The browser's picker
  button is stretched invisibly across the row, so tapping anywhere opens the picker — which is
  what the chevron in [3b] and [4c] promises.
- **Stepper** — − n + in a sunken well [3a]. The number is a real `<input type="number">`, so
  it posts with the form and takes a typed value; `clearable` makes the low end "nothing at
  all" (`null`, rendered as "—"), which is what an optional quantity needs.
- **CheckCircle** — 22–24px ring 2px `--border-dashed`; `checked` = accent fill + white ✓.
  `tinted` is the feed variant [8b]: member-coloured wash + coloured ✓, no ring. Purely
  visual — the row around it owns the button semantics.
- **Toggle** — 44×26, sage on / `--border-dashed` off, white knob. A visually hidden real
  checkbox, so it keyboards and submits inside a form action. The track is `pointer-events:
none` — the knob's `transform` otherwise paints it over the input and swallows the tap
  (→ [DECISIONS #51](DECISIONS.md)).
- **EmptyState** — 88px icon well (`--sunken`, r26), Fraunces 21px title, `--text-4` copy,
  free-form `action` snippet ([7f] pairs starters with a button).
- **FAB** — 54px sage circle, `--shadow-fab`, above the tab bar and pinned to the 480px
  column's right edge, not the viewport's.
- **TabBar** — fixed, 84px, `--tabbar-bg` + `backdrop-filter: blur(16px)`, top hairline
  `--border-soft`; icon 23px + 11px label; active sage/600, inactive `--text-5`/500;
  badge: `--danger` pill, white 10px 700, 1.5px white ring. Bottom-centred on the shell, so it
  lines up with the column on a desktop window.
- **PageHeader** — the title line a tab opens with: Fraunces 30px + a baseline-aligned `meta`
  caption ("2 of 9 done") and/or an `actions` snippet, grouped together on the right.
- **SubHeader** — one level down [7g] [6b]: back chevron, Fraunces 20px title, 12px subtitle,
  optional `actions`.
- **Banner** — tinted card: `danger` (overdue [4e]) or `info` (holiday [4a]); icon tile, title,
  detail, optional action pill. With `href` the whole card is the link; with `onclick` the pill
  is a real button (`disabled` greys it mid-flight) and with `ondismiss` a trailing × appears —
  either of those keeps the card itself inert, since a button inside a button is invalid
  (→ [DECISIONS #57](DECISIONS.md)).
- **ProgressBar** — 9px track `--track`, fill = member colour (points card).
- **ProgressRing** — cook timer, 220px, 10px stroke, sage on `rgba(255,255,255,.08)`.

## Icons

`@lucide/svelte`, defaults matched to the design: `size 23` in the tab bar (else 16–20),
`stroke-width 1.9`, round caps/joins.

Five shapes are drawn in the design file rather than by Lucide and live as components in
`src/lib/components/icons/` — **HomeIcon · BasketIcon · PotIcon · ChecklistIcon** (the tab bar,
reused by Home's stat tiles) and **CrownIcon** (1st place, filled). They take `size` and
`strokeWidth` and inherit `currentColor` (→ [DECISIONS #40](DECISIONS.md)).

Static art lives in `src/lib/assets/`: `logo-mark.svg` (white on a sage tile — see the login
screen for how it's composed) and `google-g.svg`, Google's own mark for the sign-in button.

## Motion & feel

- Sheets slide up 200–250ms ease-out; scrim fades. Svelte `transition:` is fine.
- Checking items/tasks: instant optimistic UI, subtle scale on the check circle.
- Completion modal pops (scale .95→1). No confetti — the design celebrates with words.
- Respect `prefers-reduced-motion`.

## Layout rules

- One column, `--page-pad` horizontal padding, max-width 480px centered (`.app-shell`).
- Scroll area leaves `--tabbar-h` bottom padding (+ safe-area-inset-bottom).
- Cook mode hides the tab bar entirely and uses the dark tokens.
- Touch targets ≥ 44px; the whole list row is tappable, the check circle is its own target.
