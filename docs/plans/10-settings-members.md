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

Note from plan 01: "Invite housemate" links to the existing `/onboarding/invite` screen. Its CTA
is labelled **Move in** for the onboarding path — give it a "Done" label (back to Settings) when
it's reached from here (→ DECISIONS #28).

## Acceptance

- [x] Edit name/colour reflects everywhere (avatars, feeds keep old snapshots — expected).
- [x] Pref toggles persist and are respected by 05/06 sends (spot-check one).
- [x] Away toggle here ≡ the one in the snooze sheet (same state).
- [x] Owner: rename household, revoke → old code dead, new invite works; transfer ownership
      swaps badges & permissions; remove member → their session lands in onboarding, their
      tasks show Anyone, history intact.
- [x] Member (non-owner): no ••• / revoke / rename affordances; can invite; can leave [6d];
      owner leave blocked until transfer; last-member leave deletes household.
- [x] `npm run check` && `npm run build` clean; frames match [6a]–[6d].

## How it landed (2026-07-22)

- **`services/household.ts` grew the membership half** — `updateProfile`, `setNotificationPref`,
  `renameHousehold`, `transferOwnership`, `removeMember`, `leaveHousehold`,
  `listMemberProfiles`, and an owner check on `revokeInviteCode`/`regenerateInviteCode`, which
  had none. **The role rules live in the service**, next to the write: `requireOwner(tx, …)`
  runs inside the same transaction as the update, so an action that forgot to ask still can't
  make the write happen (→ DECISIONS #62). Four new `HouseholdError` codes carry the refusals
  out to the actions, which turn them into 403/404/409s.
- **The holiday pause is one component now** — `components/AwayControl.svelte`, lifted out of
  `SnoozeSheet` and given a `surface` prop: the sunken well under [4c]'s presets, or a plain
  row inside Settings' Away mode group [6a]. It posts to `?/away` wherever it sits, and both
  pages' actions call `setAway`, so "the same state" is structural rather than a promise
  (→ #63).
- **Leaving asks three different questions** [6d] — the design's copy for a member, a stronger
  "this deletes {household} for good" for the last one out, and, for an owner with housemates,
  no way out at all: a "Hand over the house first" card pointing at Members (→ #64).
- **Removal is `departMember`**, shared by "Remove from household" and leaving: their tasks go
  to **Anyone** and lose `rotate` (nothing to alternate with), the membership row goes, and
  every history row keeps its `memberName` snapshot with `memberId` nulled by the FK — the
  points stay with the house, exactly as DECISIONS #12 says.
- **Two shared components grew rather than being forked**: `BottomSheet` took a `lead` snippet
  and a `subtitle` for [6c]'s avatar-and-meta header, and `StepHeader`'s `step` became optional
  so the invite screen reached from Members shows a back chevron instead of "Step 2 of 2"
  (→ #65). The two name limits moved into `utils/household.ts`, where onboarding's three
  screens now read them from as well.
- **The entry point stayed the Home avatar stack**, which plan 05 put there: [8b] draws no gear
  beside the greeting, and the design's own door into [6a] is the household's faces (→ #66,
  amending #57).
- Notification preferences write the same `NotificationPref` column names `push.ts` filters
  sends on, so a switch here and a `pref` there cannot drift apart.

## What was verified, and how (2026-07-22)

Walked in the dev server at 390px against the seeded household (Lukas, owner + Elisabeth), with
the DB snapshotted first and restored afterwards; the destructive halves were driven through
the real UI and then re-read out of SQLite.

- **Preferences.** Tapping "Shopping list updates" flipped `members.notify_shopping_updates`
  0 → 1. Spot-checked end to end against a stand-in push service (plan 05's recipe: self-signed
  TLS, a real P-256 device keypair, `http_ece` to decrypt): with the switch **off**, an item
  added by Elisabeth produced **no delivery attempt at all**; with it **on** (flipped through
  the Settings action, dev server restarted in between so the 15-minute coalescing ledger
  couldn't mask it) the same add delivered exactly one push to Lukas's device —
  `🛒 Elisabeth added 1 item to the list`, TTL 43200, VAPID header present.
- **Away mode ≡ the snooze sheet.** Turning it on in Settings and picking Jul 29 wrote
  `away_until`, and the Tasks tab then showed the holiday banner, the **Paused** section and no
  overdue badge; opening [4c] showed the same control already on, dated Jul 29, its CTA reading
  "Update". Switching it **off** from inside the sheet cleared the column — one state, two
  doors.
- **Profile.** Name → "Lukas J" and colour → blue repainted the greeting, the avatar stack, the
  standings strip and the activity feed's check circle; the feed row kept its old "Lukas"
  snapshot, which is the documented behaviour. The picker greyed out Elisabeth's terracotta,
  and posting it anyway came back `409 A housemate already has that colour.`
- **Owner-only, enforced server-side.** As a non-owner, `?/makeOwner`, `?/remove`,
  `?/revokeInvite`, `?/newInvite` and `?/renameHousehold` all answered **403** with the roster
  and the household name unchanged; a bogus `pref` value answered 400 rather than writing an
  arbitrary column.
- **Roles.** "Make owner" swapped the badges both ways (the second transfer driven as
  Elisabeth); as a member the ••• buttons, Revoke and the household-name chevron were all gone
  and the helper copy switched to the member wording.
- **Invite lifecycle.** `/j/B8QWJV` resolved → Revoke → the same link read "isn't valid" and the
  row became "No invite is live"; "New code" minted `DPB3WK`, whose link resolved while the old
  one stayed dead. From Members, `/onboarding/invite?from=members` rendered with a back chevron
  and a **Done** CTA (→ DECISIONS #28).
- **Removal.** Removing Elisabeth left her task assigned to **Anyone** with `rotate` cleared,
  her three completions intact under the name snapshot, and her shopping/meal references nulled
  rather than deleted. Her still-valid session cookie then hit `/home`, `/settings`, `/tasks`
  and `/` and landed on the onboarding chooser after exactly **one** redirect — no loop.
- **Leaving.** As the owner with a housemate, the confirm offered no destructive action and
  posting `?/leave` directly answered **409**. Alone, the confirm read "Delete household &
  leave" and did: households, members, tasks, completions, stores, items, meals and recipes all
  dropped to zero rows while the `user`/`session` rows survived, and the browser landed on
  "Welcome, Lukas — Create or join". A leave posted **without** the confirm's `mode=last` while
  actually being the last member (the stale-page case) answered **409** and deleted nothing
  (→ DECISIONS #64).
- **Self-correcting switches** (added in review): with `away_until` cleared out of band — what
  another device would do — the next load flowed through and the Settings toggle turned itself
  off, instead of going on claiming a holiday the database had ended.

Not covered (unchanged since plan 05): `Notification.permission` is hard-denied in this
browser, so "Enable on this device" renders its **Unavailable** state and neither the real
permission prompt nor "Send test notification" against a real device could be exercised here —
that still needs a human on desktop Chrome or Android.
