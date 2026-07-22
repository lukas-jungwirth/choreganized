# Decisions

Running log of product/tech decisions, including deliberate deviations from the design file.
Agents: when you make a judgment call that isn't in SPEC/ARCHITECTURE, **append it here**
(next number, one short block). When you deviate from a plan, note it in the plan file too.

## Resolved

1. **Auth is Google-only in v1** — design [5a] shows email+password and an Apple button; the
   stack decision (Better Auth, Google OAuth only, email later) wins. Login renders a single
   Google button; Settings has no Password row. Revisit when adding email or passkeys.
2. **Effort presets are the canonical points**: 5 / 10 / 20 / 40 (Small/Medium/Large/Very
   large) per [3b] and the brief. The stray +15/+25 values in some mockups are design
   artifacts. `points` is stored as an int, so custom values are possible later without
   migration.
3. **No Tailwind.** Vanilla CSS + design tokens + scoped styles (the design is bespoke; tokens
   map 1:1). Prevents two styling systems drifting.
4. **Drizzle ORM over raw SQL/Prisma** — TS schema, real migrations, negligible runtime,
   first-class better-sqlite3 support. Answers the brief's "some ORM if valuable?" → yes.
5. **The task row is the occurrence** (no occurrences table): recurring tasks keep one row;
   completing advances `dueDate` and logs an immutable `task_completions` snapshot. Simplest
   model that supports the whole design (incl. undo, rotation, reminders). Trade-off: no
   future-occurrence preview — not in the design anyway.
6. **Next due is computed from completion day**, not the missed due date ([4d] shows "Next due
   Aug 14" for a monthly task completed Jul 14 → today-based). Overdue tasks don't pile up
   phantom occurrences.
7. **One household per user (v1)** — enforced by a unique index on `members.userId` only;
   schema otherwise supports multi-household. Leaving/removal → back to onboarding.
8. **Timezone lives on the household** (captured from the creator's browser, default
   Europe/Vienna). All calendar dates are household-local TEXT `YYYY-MM-DD`; reminders fire at
   08:00 household-local. Weeks start Monday. UI English (i18n later).
9. **Leaderboard month is derived** from completion timestamps in the household timezone — no
   monthly reset job, history keeps all months.
10. **Any member can invite** (view/share the active code); only the **owner** can revoke/
    regenerate the code, change roles, remove members, rename the household. (Design labels the
    members screen "owner view" but only scopes roles/removal to owner in copy; for a
    two-person household, member-invite is friendlier.)
11. **Single owner, "Make owner" transfers** the role (the design offers no multi-owner UI
    like demote). Owner must transfer before leaving; the last member leaving deletes the
    household (confirm dialog).
12. **Removed/left members**: membership row deleted; their completions keep name snapshots
    ("points stay with the house"); their assigned tasks become **Anyone**.
13. **Checked shopping items auto-clear** ~12 h after checking (nightly cleanup cron). Keeps
    the "2 of 9 done" trip context without a manual clear chore.
14. **Cook-mode timers & ingredient highlights are parsed, not authored** — durations via regex
    from step text ("8 min", "8:00", "8–10 minutes" → first value), ingredient underlines via
    case-insensitive name matching. Recipe form stays plain text ([3c] has no timer fields).
    Manual "Set timer" stepper covers unparsed steps.
15. **Timer push precision**: in-process `setTimeout` at creation (second-precision) + minute
    cron as restart-safe catch-up; the row in `cook_timers` is the source of truth.
16. **One meal slot per day** (dinner) — `UNIQUE(householdId, date)` per the design's week
    list. Lunch/breakfast would be a schema extension (add a `slot` column) later.
17. **Sheets are components, not routes** (except recipe form + cook mode, which are
    deep-linkable routes). Keeps URLs clean and the tab shell stable.
18. **Recipe images**: uploaded to `UPLOADS_DIR` volume, resized to ≤1200px WebP via `sharp`
    (added in plan 07), served through an authed endpoint that checks household membership.
    Not `static/` — uploads must not be world-readable or lost on redeploy.
19. **adapter-node + one container + SQLite volume** — no separate DB image (answers the
    brief's Dockerfile question). Backups via nightly `.backup`/Litestream, plan 11.
20. **Load + form actions only** (no experimental remote functions, no client fetch layer);
    JSON endpoints only for push subscribe, timers, uploads. Progressive enhancement via
    `use:enhance`.
21. **"Anyone" tasks nudge everyone** (due/overdue reminders go to all members with the
    relevant toggle on; assigned tasks nudge only the assignee).
22. **Popular starters** ([7f]) prefill: bins Weekly Small·5, bedsheets Monthly Medium·10,
    bathroom Every-2-weeks Large·20 — assignee Anyone, first due today, editable after.
23. **Auth tables follow Better Auth's generated schema exactly** (plan 00): all timestamps are
    `timestamp_ms` like the rest of the schema — not seconds as originally written — plus
    NOT NULL `verification.created_at/updated_at` and an index on `identifier` (migration 0001).
    Drizzle's timestamp _mode_ is invisible to migrations, so a mismatch there would have been
    silent; the diff procedure is in [DATA-MODEL.md](DATA-MODEL.md).
24. **The login button keeps Google's own styling** (white, 1.5px border, colour mark) rather
    than the sage primary — that's what Google's branding requires and it's exactly the social
    button in [5a], scaled to the primary button's size since it's now the only action. The
    design's "New here? Create an account" footer becomes "New here? Signing in with Google
    creates your account", because Google-only sign-in has no separate sign-up (→ #1).
25. **The dev seed is idempotent, never destructive**: every seeded row carries a deterministic
    `seed:{householdId}:{kind}:{name}` id and is inserted `ON CONFLICT DO NOTHING`, so
    `npm run db:seed` can run any number of times, adds demo data to a household you already
    created, and never overwrites something you changed in the app. Extend it the same way.
26. **Joining is two steps on one route, not a live lookup.** `/onboarding/join` posts the code
    to a form action and, on success, redirects to `?code=XXXXXX` — the resolved code lives in
    the URL, so a refresh keeps its place and the invite preview arrives with the page. The
    alternative (validating as you type) would need a public JSON endpoint, which the
    load-and-form-actions rule reserves for push/timers/uploads (→ #20).
27. **Invite links hand off through a short-lived `invite_code` cookie.** `/j/{code}` is public
    and only shows the preview; accepting parks the code in an httpOnly, SameSite=Lax, one-hour
    cookie and sends you to sign-in, because Google's redirect can't carry our state. After
    auth, `/` reads the cookie and resumes at the join screen; joining (or creating a household
    instead) clears it.
28. **One CTA on the invite screen, labelled "Move in"** — [5d] offers "Go to Choreganized" and
    "I'll invite them later", but both navigate to Home, so the second is a decoy; the invite
    screen also stays reachable from Settings → Members, so nothing is lost by skipping it.
    "Move in" continues the "Set up your home" metaphor. When plan 10 links here from Settings
    the label should read "Done" — you already live there.
29. **"Share invite" only renders where Web Share exists.** `navigator.share` opens the OS share
    sheet (WhatsApp, Signal, AirDrop) on phones — genuinely different from copying a link. Most
    desktop browsers don't implement it, and the old clipboard fallback made the button a second
    Copy. It's now feature-detected after mount and hidden when unavailable.
30. **The member palette exists twice on purpose** — as `--member-*` tokens in `app.css` and as
    hex values in `src/lib/member-colors.ts`. Colours are written to `members.color` and read
    back to paint avatars, so they're data as well as styling; the JS module is the one place
    that says so, and the two must be changed together.
31. **`lib/utils/dates.ts` landed in plan 02, not 04.** Home needs household-local "today" for
    tonight's dinner and the due count, plus the month boundary for the standings strip — so
    the file exists now, holding only what Home uses. `Intl` only, no `@date-fns/tz`. Plan 04
    extends it with recurrence math rather than starting a second date module.
    `zonedStartOfDay` is the subtle one: it applies **every** offset in play around that
    midnight and keeps the earliest result that really lands on the date. A naive "guess, then
    refine once" loses an hour wherever the clock springs forward _at_ midnight (Santiago,
    Havana, Asunción) — which silently moved the leaderboard's month boundary. Checked
    exhaustively against `Intl` for all 418 IANA zones × 2023–2027; keep that property if you
    touch it. Formatters are memoized per (kind, timezone) — constructing one costs far more
    than using it, and the activity feed formats per row.
32. **`services/tasks.ts` starts in plan 02 with one function.** "What's overdue for me" is
    read by the tab badge on every `(app)` page, not just by Home, so it's a task-domain
    primitive; `home.ts` composes the dashboard and owns the queries only it needs. Plan 04
    extends `tasks.ts`.
33. **While you're away, nothing is overdue _for you_** — "Anyone" tasks included. The holiday
    pause promises not to bug you, so the banner and the badge both go quiet; other members
    still see those unassigned tasks as overdue. The household-wide "tasks due today" tile
    likewise skips tasks assigned to a member who is away.
34. **Seven values moved from the mockups into `app.css`** rather than being hardcoded in
    components: `--tabbar-bg`, `--scrim`, `--danger-soft` (banner subtitle), `--info-tint`
    /`-border`/`-soft` (holiday banner [4a]) and `--shadow-knob`. The tokens-only rule means
    app.css is where a design value lives, even a one-off one.
35. **Member-coloured surfaces are mixed, not tokenised.** The design tints only sage
    (`--sage-tint-2`) and terracotta (`--terracotta-tint`), but a member can also be blue,
    amber or plum. Feed check circles and selected member chips use
    `color-mix(in srgb, <member colour> …%, var(--card))`, which lands within a shade of both
    drawn tints and covers the three that were never drawn.
36. **Sheets and modals are native `<dialog>` + `showModal()`** — focus trap, Escape, inert
    background and top-layer stacking, none of it hand-rolled. Three things are ours, and all
    three exist because a confirm gets raised **from inside** a sheet (SPEC §5.3 "Delete
    task"), which is the composition that breaks the naive version:
    - **Escape is handled by hand**, because the Chromium shell this was verified in never
      delivers the `close` event and a sheet that vanished while `open` stayed `true` could
      never be reopened. Only the _innermost_ dialog answers, decided by
      `event.target.closest('dialog') === dialog` — `stopPropagation` does **not** work here,
      Svelte delegates `keydown` and the outer handler runs anyway (verified in the browser).
    - **The body-scroll lock is ref-counted** in `lib/scroll-lock.ts`. Two dialogs each
      snapshotting `document.body.style.overflow` left the page permanently unscrollable
      depending on teardown order.
    - **Scrim dismissal requires the press to start on the scrim too.** Testing only the click
      target also fires when a drag begins in the panel and ends outside it — selecting text
      in a field — which threw away the form.
37. **Inputs adapt to the surface they sit on** via `--input-surface`: white on the paper
    background, `--field` on any white surface — sheets [3a], modals and `Card` all set it, so
    no screen has to remember which variant to ask for. Add it to any new white container you
    build, or the field inside it will be white on white.
38. **One global `:focus-visible` ring** (2px sage) — keyboard focus had no styling at all.
    Components that already show focus their own way (TextField's sage border) override it
    with a plain `:focus` rule, which outranks it.
39. **`/dev/kit` is a dev-only component gallery** (404 in production). Plan 02 builds the kit
    that 03/04/05/07/10 run in parallel on, so most of it has no screen yet; the gallery is
    where those components get checked against `design/Hearth.dc.html` instead of shipping
    unseen. Extend it when you extend `lib/components/ui`.
40. **The four tab icons and the crown are bespoke SVGs** in `lib/components/icons/` — Lucide's
    house has a door and its pot a different lid, and these five are the shapes the app wears
    in its chrome and its stat tiles. Everything else stays `@lucide/svelte`.
41. **The quick-add field adds; a second affordance opens the sheet.** SPEC §3.1 and plan 03
    disagreed — the plan reads "+ opens sheet [3a]", SPEC "typing + Enter (or the + button)
    adds instantly … the field's expand affordance opens the full sheet". SPEC wins (it is
    named behaviour ground truth, and making the obvious tap target cost an extra screen would
    tax every single add). The design draws no expand affordance, so the field gained a quiet
    sliders button between the text and the sage +; it carries whatever has been typed into
    [3a], which is the prefill the plan asked for. The page clears the field once the sheet has
    actually added, so the same words can't go on the list twice.
42. **Quantity semantics: "no quantity" is a real state, and `×1` is not written.** The stepper
    opens at 1 as drawn, but steps below 1 to empty ("—") rather than stopping — an item that
    never had a quantity (everything quick-added) must be editable without acquiring one.
    `formatQuantity` prints nothing for one piece, because "Tomatoes ×1" says no more than
    "Tomatoes"; every other unit prints ("1 L" is information). A quantity-less item also
    drops its unit, so the column never carries a measure of nothing.
43. **Units are a free-text column with six offered.** [3a] picks from pcs · g · kg · ml · L ·
    pack, but plan 07 pours recipe ingredients onto the list and a recipe says "tbsp". The
    service accepts any short string; the sheet adds the item's own unit to the dropdown when
    it isn't one of the six, so opening the sheet on "2 tbsp curry paste" can't silently
    rewrite it. Anything over 12 characters is a paste accident and gets trimmed away.
44. **Stores reorder with arrow buttons, not drag.** [7g] says "drag to reorder" and plan 03
    explicitly left the choice open. Arrows work on touch, with a keyboard, and without
    JavaScript (each is a submit button in a tiny form) — pointer-drag reordering manages none
    of those without a lot of code, and the list is three or four rows long. The helper copy
    changed to match. `reorderStores(householdId, orderedIds)` is exported for whoever adds
    drag later; `moveStore` is written in terms of it.
    Renaming is likewise an always-live text field that saves on blur (Enter blurs, Escape puts
    the old name back) rather than a tap-to-edit mode: one state instead of two, and it renames
    without JavaScript. Delete asks first — a store's items fall back to "Other", which the
    confirm says out loud.
45. **The nightly cleanup gates on "at or after 03:30, once per household-local day"** rather
    than on the minute matching. The registry ticks every minute and each job asks each
    household what time it is there (a timezone is data; it can't live in a cron expression).
    Exact-minute matching would lose a household's cleanup to a missed tick, a restart, or a
    zone that springs its clock straight past 03:30. The "already ran today" ledger is a Map in
    memory, not a column, because losing it is harmless: the job only ever deletes items
    checked more than 12 h ago, so an early or late run removes exactly the rows 03:30 would
    have. Every job is wrapped so one household's bad data can't stop the sweep, and
    `noOverlap` keeps a slow job from racing itself.
46. **Checked rows go quiet, `Other` is always offered, and the sheet mounts per opening.**
    Three small readings of the design worth writing down: [03] draws a checked row with the
    quantity folded into the struck name and _no_ adder avatar (bought is bought), so the row
    does that; the item sheet always offers an "Other" chip even though [3a] draws only real
    stores, because store-less items are a real state of the list; and the page renders
    `ShoppingItemSheet` only while it is open, so its `$state` initialisers are the form reset
    (BottomSheet's own children are already mounted per opening, but the component around them
    is not).

## Open questions (non-blocking, defaults chosen)

- **Production domain** — invite links & OAuth redirect need the final origin (design shows
  `choreganized.app`). Default: whatever Coolify serves; set `ORIGIN`/`BETTER_AUTH_URL`.
- ~~**Google OAuth credentials**~~ — **resolved 2026-07-22**: the GCP OAuth client exists, the
  keys are in `.env`, and Lukas walked the sign-in round-trip by hand. Agent sessions still
  can't drive it (Claude must never enter the owner's Google login), so the temporary
  email-password switch stays the way plans verify auth — see the memory note and plan 00.
- **Language** — UI is English like the design; German/i18n not planned for v1.
- **Recipe share** ([7c] "Share") — v1 ships plain-text share (Web Share API). Public share
  links would need a tokenized public route; deferred.

## Later (explicitly out of v1 scope)

SSE live updates · passkeys · email auth · Apple sign-in · multi-household ·
meal slots beyond dinner · offline mutations · recipe import from URL · iOS polish pass.
