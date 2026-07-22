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

- [ ] Fresh household: Home renders greeting + avatars, stat tiles show 0s, no empty cards
      look broken; tab bar navigates to (stub) `/shopping`, `/cooking`, `/tasks` pages
      (create bare titled pages so navigation works).
- [ ] Layout is correct at 390×844 (compare against the design frame) and fine on desktop
      (centered column).
- [ ] Tab bar blur/hairline/active states match [02]; badge renders when the layout load
      returns a count (fake it once in dev to verify).
- [ ] `npm run check` && `npm run build` clean.

Out of scope: real activity feed & standings (09), dinner data entry (07).
