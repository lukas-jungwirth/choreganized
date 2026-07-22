# 01 · Onboarding & household

**Goal:** from a fresh Google sign-in to a working household: create (name, profile, colour),
invite (code + link), and join (link or code entry). Both founder and joiner land in the app.

Depends on: 00. Design: [5b] [5c] [5d] [5e]. SPEC: [§1](../SPEC.md#1-onboarding--household).

## Build

- `src/lib/server/services/household.ts`:
  - `createHousehold(userId, { householdName, displayName, color, timezone })` — one tx
    creating: household, owner member, default stores (Grocery/Drugstore/Hardware store,
    sortOrder 0/1/2), and an invite code (`lib/utils/invite-code.ts`: 6 chars of
    `ABCDEFGHJKMNPQRSTUVWXYZ23456789`).
  - `joinHousehold(userId, code, { displayName, color })` — validates code (uppercase,
    dash-stripped), unique-user check, creates member.
  - `getInvitePreview(code)` — household name + inviter (owner) for the public landing.
  - `regenerateInviteCode` / `revokeInviteCode` (owner) — used here and in plan 10.
- Routes (authed, membership-free — redirect members to `/home`):
  - `/onboarding` [5b] — welcome + two option cards + Continue.
  - `/onboarding/create` [5c] — household name, display name (prefilled from user.name),
    colour swatches (`--member-*` palette, avatar preview). STEP 1 OF 2 header.
  - `/onboarding/invite` [5d] — STEP 2 OF 2: code display (`7K4-P2` formatting), copy link
    (`{ORIGIN}/j/{code}`), Web Share button, members list w/ "Waiting…" row, **Go to
    Choreganized** / "I'll invite them later".
  - `/onboarding/join` [5e] — 6-box code input (paste-friendly, auto-advance), then display
    name + colour (colours already taken shown disabled); shows invite preview card when the
    code resolves.
- `/j/[code]` — **public** landing: preview card ("Lukas invited you to Sonnengasse 12"), CTA
  → sets `invite_code` cookie → `/login`; after auth, `/` redirect sends code-cookie holders
  to `/onboarding/join` prefilled (extend the root redirect from 00).
- Timezone: hidden field on create form filled client-side from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- UI primitives created here (in `lib/components/ui`): Button, Avatar, Chip, TextField —
  match DESIGN-SYSTEM.md.

## Acceptance

- [x] Create flow: new user → create → invite screen shows code; household, member (owner),
      3 stores exist; "Go to Choreganized" lands on `/home` (placeholder until 02 is fine).
- [x] Join flow via `/j/{code}` in a second browser/profile: preview shows inviter + name;
      after Google auth the join screen is prefilled; joining creates member; taken colour is
      disabled.
- [x] Join flow via manual code entry works; bad/revoked code shows inline error.
- [x] A user with a household hitting any onboarding route is redirected to `/home`.
- [x] `npm run check` && `npm run build` clean.

Out of scope: members management & revoke UI (10), tab shell (02).

## Session notes (2026-07-22)

Walked in the browser at 390px with three throwaway accounts: create → invite → sign out →
`/j/{code}` landing → sign in → prefilled join, then a third account joining by typing the code.
Sign-in used the same temporary email-password switch as plan 00 (see its notes) — the Google
round-trip itself still needs the owner's credentials.

**Deviations**

- `/onboarding/invite` is the one onboarding route a member _may_ see: it's step 2 of creating a
  household, and plan 10's "Invite housemate" links to it. The other three bounce members to
  `/home`.
- **Chip wasn't built.** Nothing in onboarding is a chip, and building it blind would pre-judge
  the store/effort/assignee chips in plans 03/04 — it belongs to whichever lands first. Built
  instead: `Button`, `TextField`, `Avatar`, `ColorPicker` in `ui/`, `Screen` in `shell/` (the
  480px page shell, now also used by `/login`), and `StepHeader` · `CodeInput` ·
  `InvitePreviewCard` under `components/onboarding/`.
- The join screen's second step is titled "Set up your profile" (no design frame exists for it);
  [5e]'s sage tile carries the logo mark rather than a Fraunces "H", which was the old app name.

**Two bugs found by walking it** (both fixed, worth knowing when extending):

1. `maxlength` on the invite-code input counted the dash in a pasted `7K4-P2X` and swallowed the
   last character. Length is capped by `normalizeInviteCode` instead.
2. Both join steps share one route, so the component isn't remounted when the code resolves — the
   default colour still came from the "no household known yet" state and could land on a colour
   that's already taken. The default is a `$derived` of the preview now, overridden only once the
   user picks — and the override is dropped again if that colour turns out to be taken (the other
   housemate joining while you fill the form).

**Follow-up from the code review:** the seed hardcoded the demo housemate's member id and name
everywhere, so seeding a household a _real_ housemate had joined died on a foreign-key violation —
exactly the path the script's own docstring advertises. It now resolves both members from the
household after the stub insert, and meal rows are keyed by date so a re-run on a later day plans
that day's dinners instead of silently skipping every insert.
