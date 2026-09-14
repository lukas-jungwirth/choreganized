# 19 · Tap the version to copy it

**Goal:** the version row in Settings → About (plan 16) names the build a feedback report will
carry, but it was a plain fact — nothing to tap, nothing to copy. Reporting a bug somewhere else
(an email, a chat) meant retyping it by eye. Make the row do what the feedback row above it
already does: tap it, and it acts.

Depends on: 16. SPEC: §6. Design: reuses the existing row shape, no new frame — [issue
#7](https://github.com/lukas-jungwirth/choreganized/issues/7).

## Build

- `src/routes/(app)/settings/+page.svelte` — the version row becomes a `<button class="row">`
  (was a plain `<div>`). `copyVersion()` follows `copyLink()` in
  `onboarding/invite/+page.svelte:32-44`: `navigator.clipboard.writeText`, a `versionCopied` flag,
  `setTimeout` clearing it after 2s, try/catch around the clipboard call since it can be blocked
  in an insecure context or by permission. While `versionCopied` is true the row's **value** span
  swaps to "Copied" in place of the build string — the row already reads label-left,
  value-right, so the confirmation lands where the eye already is; no toast, no second line.
- `src/lib/i18n/messages/en.ts` + `de.ts` — `settings.version` becomes `{ row, copied }` instead
  of a bare string (only the one call site, so no other key needed a rename).
- `docs/SPEC.md` §6 — one clause noting the row is tappable and how the confirmation reads.

## Acceptance

- [x] Tapping the version row copies the build string to the clipboard.
- [x] The value reads "Copied" for ~2s, then reverts to the build string — in both languages.
- [x] `npm run verify` clean.

## What was verified (session 2026-09-14)

Playwright (`tests/e2e/settings.spec.ts`, granted `clipboard-read`/`clipboard-write` on the
context): tapping the row's button (accessible name starting "Version") shows "Copied", and
`navigator.clipboard.readText()` afterwards reads back the seeded `e2e` build string. The
existing "About row names the build" test still passes unchanged, since the value span still
shows the plain build string until tapped.
