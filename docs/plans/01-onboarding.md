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

- [ ] Create flow: new user → create → invite screen shows code; household, member (owner),
      3 stores exist; "Go to Choreganized" lands on `/home` (placeholder until 02 is fine).
- [ ] Join flow via `/j/{code}` in a second browser/profile: preview shows inviter + name;
      after Google auth the join screen is prefilled; joining creates member; taken colour is
      disabled.
- [ ] Join flow via manual code entry works; bad/revoked code shows inline error.
- [ ] A user with a household hitting any onboarding route is redirected to `/home`.
- [ ] `npm run check` && `npm run build` clean.

Out of scope: members management & revoke UI (10), tab shell (02).
