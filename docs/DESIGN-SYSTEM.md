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
| Surfaces   | `--bg` `--card` `--sunken` `--sunken-2` `--field`                                                            | screen bg / cards / inset chips & wells / segmented track / inputs in sheets                    |
| Text       | `--ink` `--text-2…5` `--text-disabled`                                                                       | 6-step ramp; `--text-5` for uppercase labels; `--text-disabled` for placeholders & struck items |
| Sage       | `--sage` `--sage-strong` `--sage-hover` `--sage-tint` `--sage-tint-2` `--sage-row` `--sage-deep` `--on-sage` | primary buttons, active tab, checked circles, selected chips, highlight rows                    |
| Terracotta | `--terracotta` `--terracotta-tint(-2)` `--terracotta-deep`                                                   | points (`+10`), second member, "due today" meta                                                 |
| Danger     | `--danger` `--danger-tint` `--danger-border` `--danger-deep`                                                 | overdue, destructive actions, badges                                                            |
| Accents    | `--gold` `--gold-tint`                                                                                       | crown / 1st place                                                                               |
| Members    | `--member-sage/-terracotta/-blue/-amber/-plum`                                                               | avatar palette (onboarding colour picker)                                                       |
| Lines      | `--border` `--border-soft` `--divider` `--divider-sheet` `--border-dashed` `--track`                         | input outlines / tab hairline / row dividers / dashed empties / progress track                  |
| Cook mode  | `--cook-bg` `--cook-text` `--cook-muted` `--cook-faint` `--cook-sheet` `--cook-amber`                        | the one dark surface in the app                                                                 |
| Type       | `--font-display` (Fraunces) `--font-body` (Figtree)                                                          | see scale below                                                                                 |
| Radii      | `--r-input 14` `--r-button 16` `--r-card 20` `--r-card-lg 22` `--r-sheet 28` `--r-chip 999`                  |                                                                                                 |
| Shadows    | `--shadow-card/-button/-fab/-sheet/-modal`                                                                   |                                                                                                 |
| Layout     | `--page-pad 22px` `--tabbar-h 84px`                                                                          |                                                                                                 |

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

- **Button** — primary (sage bg, white 700 16px, `--r-button`, `--shadow-button`), secondary
  (white, 1.5px `--border`), danger (only in confirm dialogs), dark (`--ink` bg — "Start cook
  mode"). Full-width in sheets.
- **Card** — white, `--r-card(-lg)`, `--shadow-card`; internal rows split by `--divider`
  (13–14px vertical padding, 15–16px horizontal).
- **BottomSheet** — white, top radius `--r-sheet`, drag handle (38×5 pill `--border`),
  `--shadow-sheet`, scrim `rgba(34,32,28,.4)`; closes on scrim tap/Esc; content = form.
- **CenterModal** — completion celebration & confirms, `--r-sheet`, `--shadow-modal`.
- **Avatar** — circle, member colour bg, white initial, sizes 20/26/36/52; stack with -9 to
  -12px overlap + 2.5px `--bg` ring; "empty" variant dashed `--border-dashed`.
- **Chip** — pill `--r-chip`, 1.5px border; selected = sage bg/white (or tint bg + `--sage`
  border for member chips); used for stores, effort, assignees, snooze presets.
- **SegmentedControl** — `--sunken-2` track r13, active segment white r10 + tiny shadow.
- **CheckCircle** — 22–24px ring 2px `--border-dashed`-ish (#D8D3C9); checked = sage fill +
  white ✓; terracotta variant for the second member in feeds.
- **Toggle** — 44×26, sage on / `--border-dashed` off, white knob.
- **EmptyState** — 88px icon well (`--sunken`, r26), Fraunces 21px title, `--text-4` copy,
  primary button.
- **FAB** — 54px sage circle, `--shadow-fab`, above the tab bar (`bottom: var(--tabbar-h) + 16px`).
- **TabBar** — fixed, 84px, `rgba(255,255,255,.86)` + `backdrop-filter: blur(16px)`, top
  hairline `--border-soft`; icon 23px + 11px label; active sage/600, inactive `--text-5`/500;
  badge: `--danger` pill, white 10px 700, 1.5px white ring.
- **Banner** — tinted card variants: danger (overdue [4e]), sage/info (holiday [4a]).
- **ProgressBar** — 9px track `--track`, fill = member colour (points card).
- **ProgressRing** — cook timer, 220px, 10px stroke, sage on `rgba(255,255,255,.08)`.

## Icons

`@lucide/svelte`, defaults matched to the design: `size 23` in the tab bar (else 16–20),
`stroke-width 1.9`, round caps/joins. Bespoke SVGs (copy from the design file into
`lib/assets/`): logo mark (house + sparkles), wordmark, crown, any icon Lucide lacks.
The logo mark markup already exists in `src/routes/+page.svelte`.

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
