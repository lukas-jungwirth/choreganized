# 02 · App shell & Home v1

**Goal:** the `(app)` route group: guard, mobile shell, bottom tab bar, and the Home dashboard
wired to real data (which is mostly empty until 03/04/07 land — every card must degrade
gracefully). This plan also establishes the shared UI kit the parallel plans build on.

Depends on: 01. Design: [02] main dashboard + [8b]. SPEC: [§2](../SPEC.md#2-home-tab),
[§8](../SPEC.md#8-cross-cutting-rules).

## Build

- `src/routes/(app)/+layout.server.ts` — `requireMember`; load household, members list, and
  tab-badge data (overdue count for me — returns 0 until 04). `+layout.svelte` — `.app-shell`
  (max-width 480px, `--bg`), scroll padding for the tab bar, `refetchOnFocus` helper
  (visibilitychange → `invalidateAll`).
- `lib/components/shell/TabBar.svelte` — 4 tabs, active state by pathname, overdue badge on
  Tasks, hidden on cook-mode routes (route id check).
- Complete the `ui/` kit needed broadly (per DESIGN-SYSTEM.md): Card, BottomSheet,
  CenterModal, SegmentedControl, Toggle, CheckCircle, EmptyState, FAB, Banner, ProgressBar,
  AvatarStack. (Primitives from 01: Button, Avatar, Chip, TextField.)
- `/home` (`(app)/home/+page.server.ts|.svelte`):
  - Header: household name caps, time-of-day greeting with member displayName, AvatarStack.
  - Tonight's dinner card (from `meals` for today; hidden→"Add tonight's dinner" link state).
  - Stat tiles: unchecked shopping count → `/shopping`; tasks due today+overdue → `/tasks`.
  - Slots for activity card / standings strip / overdue banner: implement now against their
    queries (empty ⇒ hidden) — 04/09 light them up; keep the queries in
    `lib/server/services/home.ts` so later plans extend one file.
- Redirect `/` (root) → `/home` for members (adjust 00's redirect if needed).

## Acceptance

- [x] Fresh household: Home renders greeting + avatars, stat tiles show 0s, no empty cards
      look broken; tab bar navigates to (stub) `/shopping`, `/cooking`, `/tasks` pages
      (create bare titled pages so navigation works).
- [x] Layout is correct at 390×844 (compare against the design frame) and fine on desktop
      (centered column).
- [x] Tab bar blur/hairline/active states match [02]; badge renders when the layout load
      returns a count (fake it once in dev to verify).
- [x] `npm run check` && `npm run build` clean.

Out of scope: real activity feed & standings (09), dinner data entry (07).

## Session notes (2026-07-22)

Walked at 390×844 and on desktop: fresh household first (greeting, single avatar, dashed
"Add tonight's dinner", two zeroes, tabs navigating), then `npm run db:seed` for the populated
state (activity feed, dinner, 8/2, "You're 1st this month · 50 pts · 20 ahead of Elisabeth").
The seeded overdue task belongs to Elisabeth, so the banner and badge correctly stayed hidden —
reassigning it in the DB brought both up, matching [4e]. Sign-in used the same temporary
email-password switch as plans 00/01; the flag is removed and `data/` wiped.

**Deviations**

- **`lib/utils/dates.ts` and `services/tasks.ts` start here**, not in plan 04 — Home needs
  household-local "today" and the month boundary, and the tab badge needs "overdue for me" on
  every page. Both hold only what plan 02 uses; plan 04 extends them (→ DECISIONS #31/#32). The
  badge is therefore real from day one rather than a stubbed 0.
- **Chip was built after all.** Plan 01 deferred it as belonging to "whichever plan lands
  first"; this plan's brief assumed it existed, and 03/04/07 all need it in parallel, so it
  ships with the rest of the kit. Same reasoning added `shell/PageHeader` (already in the
  ARCHITECTURE layout) — the stub pages use it.
- **`/dev/kit`**, a dev-only gallery (404 in production), because most of the kit has no screen
  until 03/04/07/10 land and "built to spec, never looked at" isn't good enough (→ #39).
- **`/tasks/history` gets a stub too**, so Home's "All →" and the standings strip lead
  somewhere real before plan 09.
- **The dinner card links to `/cooking` in both states** and draws a placeholder well instead of
  a photo. Plan 07 repoints the recipe case to `/cooking/recipes/{id}` and swaps the tile for
  the image; the load already returns `recipeId` and `imagePath`. Its "nothing planned" state
  has no design frame — dashed card, + tile, "Add tonight's dinner" per SPEC §2.2.
- **Standings copy beyond the 1st-place line is ours**: ties read "You're tied this month ·
  {n} pts each", trailing reads "{n} pts · {gap} behind {leader}", a household of one reads
  "{n} pts this month".
- Frame [02]'s alternative "This month's points" card (per-member ProgressBars) is **not**
  built — SPEC names [8b] canonical. `ProgressBar` exists for whoever wants it.
- Three shell-wide additions the plan didn't call for: a global `:focus-visible` ring
  (keyboard focus had none), `--input-surface` so fields adapt to the surface they sit on, and
  `env(safe-area-inset-top)` on the app shell for the installed PWA.

**Two things found by walking it**

1. **The `<dialog>` `close` event never fires in the Chromium shell used for verification** —
   confirmed against a bare `document.createElement('dialog')`, so it isn't a Svelte or wiring
   problem. It matters because a sheet that closed visually while `open` stayed `true` could
   never be reopened. Both sheet components now also handle Escape themselves (→ #36).
2. **TextField was white-on-white inside a sheet** — [3a] draws sheet fields on `--field`.
   Fixed with `--input-surface` on the sheet panel, so it's right everywhere by default.

## Review pass (2026-07-22)

A multi-angle review of the finished plan found fifteen defects; all are fixed and re-verified
in the browser. The ones worth knowing about when extending this code:

- **`zonedStartOfDay` was wrong wherever the clock springs forward at midnight** (Santiago,
  Havana, Asunción): the refine-once algorithm returned an instant on the _previous_ day, so
  the leaderboard counted the last hour of the previous month. Rewritten and checked against
  `Intl` for all 418 IANA zones × 2023–2027 (→ DECISIONS #31).
- **Three dialog defects, all from nesting a confirm inside a sheet** — the composition plan 04
  needs: a non-re-entrant scroll lock that could strand the page unscrollable, Escape closing
  the sheet underneath the confirm, and a drag out of a text field dismissing the sheet
  (→ DECISIONS #36). `/dev/kit` now renders that nesting so it stays covered.
- **Home computed `today` a second time**, so the tab badge and the overdue banner could
  disagree across household-local midnight. The layout now hands `today`, the roster and the
  overdue rows down; `getHomeSummary` takes a `HomeContext` instead of re-querying.
- **`Chip` spread `{...rest}` after its own `class`**, so `<Chip class="grow">` silently
  erased the pill. **`ProgressBar`** passed `NaN` through its clamp and painted a full bar for
  0/0. **`Avatar`** split surrogate pairs on emoji display names.
- **The overdue list had no tiebreaker**, so the banner's task name flipped between renders
  when two tasks shared the oldest due date.
- **A long display name overflowed the 390px shell** — verified again with
  "Elisabeth-Charlotte", which is the whole reason the acceptance criterion says 390px.
- **`<main>` was missing** from the app shell, which `Screen` gives every other page; the
  header avatar stack was `aria-hidden` with no way to name the housemates it hides.
- The orphaned-household fallback redirected to `/onboarding`, which redirects members back
  here — an infinite loop. It's a 500 now.

Reported but **not** fixed, because the fix belongs elsewhere: a meal whose recipe was deleted
without a title snapshot renders as "nothing planned" while still holding the day's unique
slot. Plan 07 owns the delete path and should snapshot `meals.title` there.
