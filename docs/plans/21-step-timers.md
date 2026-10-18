# 21 · Named step timers, and German durations

**Goal:** a timer on a step has always been whatever cook mode could read out of the text
(→ #14). It is called "Step 3", and it is English-only, so "10 Minuten" gives no chip at all. A step
can now **carry one named timer** ("Nudeln · 10:00"). The editor shows it and edits it, cook mode
starts it, and AI import (plan 22) fills it in. A step without one still reads its own text, which
now understands German too.

Depends on: 08. SPEC: §4.4, §4.6. Design: there is no frame. The timer chip sits beside [3c]'s
"uses" chips, and its sheet reuses the parts of the manual-timer sheet [7h].

## Build

- **Schema**: `recipe_steps.timer_seconds` (integer, null) and `recipe_steps.timer_label` (text,
  null). That is one per step, matching cook mode's one ring per step (`cookTimers.forStep`).
- **Form → service:**
  - `StepInput.timer: { seconds, label } | null`.
  - One hidden `stepTimer` per step, aligned by position like `stepUses`.
  - `readRecipeForm` accepts whole seconds within `MIN_TIMER_SECONDS..MAX_TIMER_SECONDS` and a
    trimmed label of at most `TIMER_LABEL_MAX`. Anything else means no timer.
  - Carried by `writeChildren`, `listSteps` / `RecipeStepRow`, `duplicateRecipe` and the seed.
- **Editor**: a chip under each step:
  - "Add timer". When the text has a duration, it offers that duration instead.
  - Once set, it reads "Name · 10:00".
  - It opens a `StepTimerSheet` built from parts extracted out of `SetTimerSheet`: the stepper,
    the name field and the suggestion chips, given a `tone` and **seconds precision**, so a 90 s
    timer doesn't round to 2 min. The sheet adds Remove.
  - The sheet sits outside the `<form>`, like `StepIngredientsSheet`.
- **Cook mode**:
  - The stored timer wins, otherwise `parseStepDuration`.
  - The label is the stored one, otherwise "Step N".
  - The chip reads "Start Nudeln · 10:00".
- **Recipe view**: a quiet timer line on each step that has one.
- **`timer-parse.ts`**:
  - German units: `Minuten · Min. · Stunde(n) · Std. · Sekunde(n) · Sek.`, longest first.
  - `bis` / `oder` ranges, and `ca.`.
  - "1 Stunde und 30 Minuten".
  - A new `stepDurations(text)` returns every stated duration, including both bounds of a range.
    Plan 22 checks AI timers against it.
- Docs: SPEC §4.4/§4.6, DATA-MODEL, DECISIONS (revises #14), and the comment at the top of
  `timer-parse.ts`.

## Acceptance

- [x] Set a timer in the editor → save → cook mode's chip reads its name and duration → starting
      it names the timer, and the push uses that name.
- [x] Remove it → cook mode falls back to the text's duration.
- [x] "10 Minuten", "1 Std.", "5–10 Min." and "1 Stunde und 30 Minuten" each give a chip.
- [x] A posted `stepTimer` that is garbage, out of range or oversized saves as no timer, with no error.
- [x] Duplicating a recipe keeps its timers.
- [x] `npm run verify` and `npm run test:visual` clean.

Out of scope: several timers per step; timers outside cook mode.

## What was verified, and how (session 2026-10-18)

- **`npm run verify` clean**: 300 Vitest tests and 24 Playwright journeys.
- **`npm run test:visual`**: every existing baseline is unchanged. Recipe view, cook mode and
  the Settings screens are pixel-identical, so the new step wrapper costs nothing on a recipe
  without timers. A new **recipe-edit** baseline (top and bottom) shows the timer chips under
  the steps: "2:00 auto" and "20:00 auto" read out of the seeded text, and "Add a timer".
- **Parser** (`timer-parse.test.ts`):
  - German spellings, ranges, decimals and hours-plus-minutes are read.
  - Words that only start like a unit aren't (Minze, Stangen, Stück, Sekt), and neither is an
    oven temperature.
  - `stepDurations` lists both ends of a range and doesn't double-count the minutes of "1 Std.
    30 Min.".
- **Form reader** (`recipes.test.ts`): garbage, out-of-range values, fractions, NaN, strings and
  oversized names in `stepTimer` read as "no timer" (or a capped name). None of them is an error.
- **Service** (`tests/integration/recipes.test.ts`): timers are stored on create, replaced and
  removed on update, and carried by duplicate. A timer that can't run is dropped and the step
  is kept, and 89.6 s rounds to 90 s.
- **End to end** (`cooking.spec.ts`), on a new recipe:
  - The German step "9 Minuten kochen" shows "9:00 auto". The sheet opens on 9 minutes; set 10
    and tap the "Nudeln" suggestion.
  - The chip reads "Nudeln · 10:00", the recipe view shows it, and cook mode offers "Start
    Nudeln · 10:00".
  - Removing the timer brings back "Start 9:00 timer".

**Not exercised:** the push a running named timer sends, on a real device. The label it uses is
the same `name || label` path as before, now fed the step's timer name. Push can't be received in
the preview browser (→ plan 08's notes).
