# 32 · Swipe between the two weeks on the Cooking tab

**Status: done (2026-10-31).** Depends on: 07, the two-week switch (DECISIONS #99).
SPEC: [§4.1](../SPEC.md#41-this-week-04-main). Decisions: #206. Issue: #84.
Design: no new frame. The gesture adds nothing to see in [04]; the switch stays.

**Goal:** on the Cooking tab, a sideways swipe switches between this week and next, as well
as the segmented control. It is a shortcut only: the buttons stay, and the week stays in the
URL.

## Build

- `src/lib/swipe.ts`: `swipeDirection(dx, dy)` (60px sideways, at least twice the vertical
  travel), `fromEdge(x, width)` (24px edges belong to the system), and the `use:swipe` action:
  touch and pen pointers only, `touch-action: pan-y pinch-zoom`, the click after a swipe
  swallowed.
- `routes/(app)/cooking/+page.svelte`: the switch, the strip and the meal card sit in one
  swipe area; a swipe `goto`s the other week's link with `noScroll`, as the switch does.
- No copy: a gesture has no words.

## Acceptance

- [x] Swiping left over the week on `/cooking` shows next week (`?week=<Monday>`); swiping
      right comes back to `/cooking`.
- [x] Swiping left on next week, or right on this week, does nothing.
- [x] A scroll that drifts sideways and a swipe from the screen's edge don't page, and a swipe
      never opens a meal's sheet.
- [x] The switch's links work as before.

## Tests

- Unit: `src/lib/swipe.test.ts` (direction, threshold, ratio, edges).
- E2E: `tests/e2e/cooking.spec.ts` "swiping the week sideways switches between this week and
  next (#84)".
