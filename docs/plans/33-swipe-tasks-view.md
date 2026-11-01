# 33 · Swipe between To do and History on the Tasks tab

**Status: done (2026-10-31).** Depends on: 32, the swipe gesture (DECISIONS #206).
SPEC: [§5.1](../SPEC.md#51-list-05-main-4a), §5.8. Decisions: #207. Issue: #87.
Design: no new frame. The gesture adds nothing to see in [05] or [8a]; the switch stays.

**Goal:** on the Tasks tab, a sideways swipe switches between To do (`/tasks`) and History
(`/tasks/history`), the same way a swipe on Cooking switches this week and next, so the two
tabs behave alike. A shortcut only: the switch stays, and the view stays in the URL.

## Build

- `routes/(app)/tasks/+page.svelte`: the switch, banners, list and summary link sit in one
  `use:swipe` area; leftwards `goto`s History (only when the switch is shown).
- `routes/(app)/tasks/history/+page.svelte`: the switch and both cards sit in one swipe area;
  rightwards `goto`s To do.
- `tests/e2e/touch.ts`: the CDP finger, moved out of `cooking.spec.ts` to be shared.
- No copy: a gesture has no words.

## Acceptance

- [x] Swiping left over To do opens History; swiping right on History returns to To do.
- [x] Swiping right on To do, or left on History, does nothing.
- [x] A scroll that drifts sideways and a swipe from the screen's edge don't switch, and a
      swipe never opens a task's sheet.
- [x] The switch's links work as before.

## Tests

- E2E (real touch input over CDP): `tests/e2e/tasks.spec.ts` "swiping sideways switches the
  Tasks tab between To do and History (#87)".
