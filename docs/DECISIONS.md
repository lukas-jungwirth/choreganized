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

47. **"Paused" is a section, and it means _away and already due_.** SPEC §5.5 says an away
    member's tasks "render dimmed/paused instead of overdue" without saying where they go; a
    paused task left in **Overdue** would make the section header lie, and one dropped into
    **Today** would be a different lie. So the to-do list has a fifth section, **Paused**, sat
    after Upcoming because de-emphasis is the entire point of the holiday pause, and the row's
    meta reads "Monthly · paused until Jul 29" rather than counting days it isn't behind.
    `TaskListItem.paused` carries the "and already due" half, so the section and the treatment
    the row wears are one question asked once — an away member's task due next week is simply
    upcoming, because nothing is being suppressed yet. Undated one-offs are never paused for the
    same reason. The sixth section, **No date**, is the undated one-offs SPEC §5.1 asks for.
48. **Undo's snapshot round-trips through the browser.** Reverting a completion needs the due
    date, assignee and reminder flags the task had a moment ago — none of which are derivable
    afterwards, and for a one-off the row is gone entirely. `completeTask` returns a full
    `TaskSnapshot` with the celebration payload; [4d]'s Undo posts it back as one JSON field.
    The alternative, parking snapshots in a server-side `Map`, loses every pending undo to a
    redeploy and needs a TTL nobody will ever tune. Nothing in the snapshot is a capability the
    same member doesn't already have through the edit sheet, and `undoCompletion` still scopes
    the completion id and every member id in it to their household. A one-off can only ever
    carry the one completion being undone, so re-inserting the row under its original id costs
    no history links.
49. **"Skip this time" is hidden on one-offs.** "This time" presupposes a next time; a one-off
    you don't intend to do is deleted, which is a row away in the same sheet. The service still
    handles the case uniformly (skip is completion with `points 0` and `action 'skipped'`), so
    only the affordance is conditional.
50. **The due meta counts days, then names the day, then gives the date.** [4a] draws both
    "in 2 days" and "Sat" without saying where one becomes the other, so: today/tomorrow by
    name, 2–3 days counted, 4–6 days as a weekday, a week or more as "Jul 14" — and with the
    year attached once it isn't this one. `formatDateLabel` is the same scale for a value you're
    _choosing_ ("Tomorrow · Jul 17" [3b]), where the date has to stay visible.
51. **The Toggle's knob was eating the tap.** `input:checked + .track .knob` has a `transform`,
    which promotes the knob into the positioned-element painting step — above the invisible
    `<input>` stretched over the switch. Once a toggle was **on**, a tap in its centre (where a
    thumb lands) hit the knob and did nothing: it could be switched on but never off. Found by
    walking [4c]'s holiday pause. `pointer-events: none` on the track makes the input the only
    hit target in both states. It shipped in plan 02 and would have hit every notification
    preference in plan 10.
52. **Escape listens on the window, not on the dialog** (amends #36). A form action that
    re-renders its own submit button drops focus to `<body>`, so a keystroke aimed at a sheet
    that is still on screen never reaches its `keydown` handler — [4c]'s holiday pause is
    exactly that shape, since it posts and stays open. Both dialogs now listen on the window and
    ask `ownsEscape`: the innermost dialog answers, and when the keystroke came from outside
    every dialog, "innermost" is the last open `<dialog>` in document order — the same thing for
    the one nesting we build, since a confirm is rendered inside its sheet.
53. **Two shared components grew rather than being forked.** `SegmentedControl` takes an `href`
    per option and becomes real navigation (`<nav>` + `<a aria-current>`), which is what the
    To do / History switch is — `bind:value` with a `goto` in an effect would have been a
    router pretending to be a control. New: **`DateField`**, TextField's shape around a real
    `<input type="date">` — it posts with the form action and opens the platform picker, and
    the browser's own picker button is stretched invisibly across the row so the whole field
    opens it, which is what the chevron in [3b] promises. The friendly reading ("Tomorrow ·
    Jul 17") sits beside the value rather than replacing it.
54. **A new task defaults to Anyone · every week · due today · Medium.** [3b] draws an example
    (Elisabeth, every 2 weeks, tomorrow), not a default. Anyone asks nothing of you and matches
    the starters; "every week" is what this app is for; **today** rather than the mockup's
    tomorrow because the starters are due today (#22) and one screen shouldn't disagree with
    the other about what "add a chore" means.
55. **Notification copy lives in the title, not the body.** [4e] and [7h·2] draw one content
    line under a "Choreganized"/"Choreganized · Timer" header, which reads as though the app
    name were our `title`. It isn't: Android and Chrome print the app/origin themselves above
    whatever we pass, so a title of "Choreganized" would only buy a duplicated line and push
    the message into the smaller, first-truncated slot. SPEC's strings ("🛒 {member} added {n}
    items to the list", "☑️ {task} is due today — your turn") are therefore the `title`, and
    `body` is optional supporting text — the structure the mockups draw, with the sentence that
    matters in bold.
56. **The service worker precaches assets and never pages.** ARCHITECTURE's "network-first for
    navigations with an offline fallback notice" is implemented as: hashed build assets +
    `static/` cache-first, navigations straight to the network, and a self-contained "You're
    offline" page when that fails. Caching rendered pages would be the other reading, and it
    buys a household staring at yesterday's shopping list believing it — plus one member's data
    sitting on the device after they sign out. There are no offline mutations in v1 (SPEC §8),
    so there is nothing an offline page could usefully do anyway.
    Two follow-ons: the worker does **not** `skipWaiting()` (an open tab is still lazy-loading
    the previous build's chunks; the new worker takes over when the last tab closes, which is
    also when its `activate` deletes the old cache — verified), and the offline page is the one
    place outside `app.css` with literal colour values, because it is served precisely when
    nothing else can be fetched.
57. **Settings stands up in plan 05 with only its Notifications section, reached from Home's
    avatar stack.** Enabling push is a permanent per-device decision, so it needs a permanent
    home; [6a] opens with a back chevron, so something has to lead there, and the household's
    faces are the obvious door. Plan 10 owns the screen and may move the entry point.
    The one-time Home prompt is `EnablePush variant="prompt"`, which renders **nothing** unless
    push is genuinely available and unanswered on this device, and remembers a dismissal in
    `localStorage`. It's drawn with `Banner`, which gained two props for it: `onclick` (the
    action pill becomes a real button) and `ondismiss` (a trailing ×). With either set the card
    itself stops being the target — nesting a dismiss button inside a card-sized one is invalid
    HTML — so `href` remains the "whole card is the link" case.
58. **Push sends default to a 12 h TTL, and the shopping ledger counts attempts, not
    deliveries.** web-push defaults to four weeks; everything this app sends is about _now_, so
    a phone that was off all weekend must not wake to Friday's nudges (the test notification
    drops to 60 s). The 15-minute shopping coalescing window is stamped when a notification is
    _set off_, before the send resolves — keeping it synchronous is what makes "one per member
    per 15 min" a guarantee rather than a race, and the alternative (stamp only on successful
    delivery) would let a burst of adds all slip through together. The cost is an edge case
    nobody will meet: turning the preference on within 15 minutes of a housemate's add delays
    the first notification.
59. **Notification and app icons are placeholders drawn from the logo mark** (`icon-192`,
    `icon-512`, `badge-72` in `static/icons/`) — full-bleed sage, since Chrome circle-crops a
    notification icon and Android masks an app icon, and a house-only monochrome badge because
    sparkles are noise at 24 dp. Plan 11 ships the real set; until then a notification is drawn
    with our mark rather than the browser's default globe.
60. **A holiday defers a nudge; a switched-off toggle spends it.** The reminder sweep claims a
    task's flag whenever at least one person the nudge is for is home — whatever their
    notification preferences — and doesn't claim it at all while everyone it is for is away.
    The two skips look identical from outside and aren't: the holiday pause exists so that a
    task isn't somebody's problem yet (SPEC §5.5), so the nudge is still waiting for them the
    morning they're back, which the overdue sweep then delivers — the gentlest possible
    "welcome home", and the alternative (marking it sent while they were on a beach) is a
    reminder nobody ever receives. A member who switched the nudge off has already answered, so
    the occurrence is closed: re-asking every minute for the rest of the day would be a
    question that never settles. Reassigning keeps the flags, which is plan 04's call and still
    the right one — the occurrence hasn't changed, so the new assignee hears about it in the
    next morning's overdue nudge rather than in a second push the same day.
    Both flags are claimed with a conditional `UPDATE … WHERE flag IS NULL` _before_ anything
    is sent, so a crash mid-sweep costs a notification rather than repeating one, and a second
    sweep (a slow tick overlapping the next, two processes mid-redeploy) sees `changes === 0`
    and stays quiet.
61. **The overdue nudge wears the chore's own emoji, and an "Anyone" task doesn't claim it's
    your turn.** [4e] draws "🛏️ Bedsheets are overdue — it's your turn", so the overdue line
    picks its emoji from the task name (a dozen keyword patterns, ⏰ when none match) while the
    due line keeps SPEC's ☑️ — on a lock screen the picture lands before the sentence does. For
    an unassigned task the copy borrows the words the overdue card already uses [4a]: "☑️ Take
    out the bins is due today — anyone can pick this up", because "your turn" is a lie about a
    chore nobody has been handed, and SPEC only pins the wording for the assigned case. Both
    live in `services/reminders.ts` rather than `utils/tasks.ts`: it is the one piece of task
    copy the browser never renders, and a keyword table is not worth shipping to a phone.
62. **The podium ranks by competition, arranges outwards from the winner, and hands a tie's
    crown to the earlier `joinedAt`.** 240 / 240 / 160 ranks 1 · 1 · 3: tied housemates get
    identical heights, identical numerals and both wear their own colour, because the alternative
    (breaking the tie for the layout) would draw a leader who isn't one. Exactly one crown
    survives that, and it goes to whoever has lived here longest — the same tiebreak rotation
    and the avatar stack already use — rather than none: the crown is the card's focal point and
    a podium that loses it whenever two people draw looks broken rather than even-handed. Home's
    strip still says "You're tied this month" [8b], which is the honest sentence and doesn't
    contradict the ornament. Columns are placed by putting 1st in the middle and alternating
    outwards (2 · 1 · 3, then 4 · 2 · 1 · 3 · 5), except at two members, where there is no middle
    and the winner takes the left — a leaderboard rather than a podium. The markup stays in
    _rank_ order and CSS `order` does the arranging, so a screen reader hears the standings
    rather than the choreography. A month nobody has scored in yet (the 1st, [8a]'s "empty but
    valid") drops the crown and the numerals and levels the plinths: a rank of 1 for everyone at
    zero would be a claim about a month that hasn't happened.
63. **The history feed pages by month, and the window lives in the URL.** "Load more" hands
    back a _month_ (`?from=2026-06-01`) rather than the next _n_ rows: a month is a landmark you
    can picture before you tap, and SPEC §5.8 already offers the choice. In the URL rather than
    in client state so the view survives a refresh, a share and the back button and works with
    no JavaScript — the button is a plain `<a>` (`data-sveltekit-noscroll`, so the page doesn't
    jump back to the podium). The button names the next month that _actually holds something_,
    found with one `max(completedAt)` query below the window, so a household that went quiet
    over the summer doesn't need three taps to reach one June evening. The podium is always the
    current month regardless of how far the feed has been paged back — "This month" is the
    scoreboard, not a cursor.

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
