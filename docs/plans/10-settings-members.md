# 10 · Settings & members

**Goal:** account & app settings, notification preference toggles, away mode, household
management (rename, members, roles, invite/revoke), leave/remove flows.

Depends on: 01 (05 for notification prefs to do anything). Design: [6a] [6b] [6c] [6d].
SPEC: [§6](../SPEC.md#6-settings-6a), [§7](../SPEC.md#7-members-6b-6c), DECISIONS #10–#12.

## Build

- `/settings` [6a] (entry point: small gear/avatar affordance on Home header — add it):
  - Profile card (avatar, displayName, email, Edit → name/colour sheet; taken colours
    disabled — reuse onboarding picker).
  - Notifications section: `EnablePush` device state (05), toggles → member pref columns
    (task reminders / overdue nudges / shopping updates), "Send test notification".
  - Away mode row ("Going away?" toggle + return date — same service as 04's `setAway`).
  - Household section: name row (owner: editable), "Members · n" → `/settings/members`.
  - Sign out (Better Auth signOut → `/login`). **Leave household** danger row → confirm modal
    [6d] (copy per design; owner must transfer first — explain inline; last member → deletes
    household, stronger confirm copy).
- `/settings/members` [6b]: member rows (avatar, name+you, Owner badge / "Member · joined
  {date}"), owner-only ••• → `ManageMemberSheet` [6c]: **Make owner** (transfer confirm),
  **Remove from household** (confirm; tasks → Anyone per DECISIONS #12). Pending-invite row
  (active code + Revoke for owner). **Invite housemate** → `/onboarding/invite` (reused
  screen — ensure it renders fine for an existing household and backs to members).
- `lib/server/services/household.ts` — extend: rename, transferOwnership, removeMember,
  leaveHousehold (incl. last-member delete cascade), all with role checks in the service
  (never trust the client).
- Removed member UX: their next request hits `requireMember` → onboarding (verify no crash
  loop with a stale session).

## Acceptance

- [ ] Edit name/colour reflects everywhere (avatars, feeds keep old snapshots — expected).
- [ ] Pref toggles persist and are respected by 05/06 sends (spot-check one).
- [ ] Away toggle here ≡ the one in the snooze sheet (same state).
- [ ] Owner: rename household, revoke → old code dead, new invite works; transfer ownership
      swaps badges & permissions; remove member → their session lands in onboarding, their
      tasks show Anyone, history intact.
- [ ] Member (non-owner): no ••• / revoke / rename affordances; can invite; can leave [6d];
      owner leave blocked until transfer; last-member leave deletes household.
- [ ] `npm run check` && `npm run build` clean; frames match [6a]–[6d].
