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
   08:00 household-local. Weeks start Monday. ~~UI English (i18n later).~~ **Superseded by
   #93**: the UI ships in English and German. Timezone and language stayed separate axes —
   a Vienna household reading in English gets Vienna's midnight and English month names.
   (`INTL_LOCALE` is a single constant per language; de-AT, → #93.)
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
    changed to match. `moveStore` swaps two adjacent rows through the shared `writeOrder`
    helper; a full drag-to-reorder can build on `writeOrder` the same way when it lands.
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
62. **`sharp@0.35.3` is the only new dependency plan 07 adds**, and nothing is stored as
    uploaded: every photo is re-encoded to a ≤1200px WebP (`quality 80`, `.rotate()` first so
    EXIF-rotated phone photos land upright). A 12 MP JPEG is ~4 MB; the same picture at the
    size a 390px screen shows is under 100 KB — and re-encoding drops the EXIF, including
    where the picture was taken, which is not something a shared household app should keep.
    Verified in the app: a 2000×1400 JPEG became 1200×840 / 8 KB, a 1600² PNG 1200² / 7.5 KB.
63. **A stored photo's filename is a UUID, and replacing one writes a new file.** Same-path
    replacement would leave every phone that had loaded the old photo showing it, so the URL
    would have to be uncacheable; a fresh name per write makes `Cache-Control: private,
immutable` honest. The name carries nothing about the recipe on purpose — a file that can
    be written _before_ its row exists is one no failed insert can half-reference, which is
    why the new/edit actions validate and store the image first and only then touch the
    database (and delete the file again if the row turns out not to be theirs).
64. **The uploads endpoint's gate is a database lookup, not a path check.**
    `/api/uploads/[...path]` answers only if the requested path is some recipe's `imagePath`
    **in the caller's household** — so the filesystem layout is never part of the security
    argument, and a guessed name is unreadable even to a signed-in member of another
    household. Verified: own photo 200, another household's file 404, unknown name 404, no
    session 303 → /login.
65. **`hasIngredients` is a second query, not an `exists (…)` column** (→
    `services/recipes.ts`). Drizzle only qualifies column names when a statement has a join,
    so a hand-written correlated subquery beside a plain `select` compiles to
    `where "recipe_id" = "id"` — both resolved against the _inner_ table, silently always
    false. It shipped that way for an hour and the plan sheet's shopping toggle never
    appeared; the lesson is that a subquery mixing `sql` with Drizzle column references needs
    its generated SQL read at least once.
66. **The week's rows gained a ••• that the design doesn't draw.** [04] shows only the cook's
    avatar, and SPEC §4.1 asks for "long-press/•••" to change or remove a planned meal — a
    long-press is not something a browser hears reliably, and the row itself is already the
    way to the recipe. So a planned row is: tap = the recipe (or the prefilled sheet for a
    free-text meal), ••• = the plan sheet, where **Remove meal** lives.
67. **Reordering ingredients and steps uses arrows, like the store list** (→ #36). [3c] draws
    a drag grip; the grip is gone rather than promising a gesture that isn't there. The rows
    also take Enter as "next ingredient", which is how a list of them actually gets typed.
68. **The shopping toggle in [3d] is our pill `Toggle`, not the design's check-square**, and
    it only appears when the selected recipe _has_ ingredients (SPEC §4.2). Every other
    on/off preference in the app is that pill; a second on/off vocabulary for one sheet would
    cost more than the fidelity is worth. It posts inside the form, so no JavaScript is
    involved in reading it. The cook picker beside it went the other way: [3d] draws bare 28px
    initial circles, but SPEC §4.2 asks for "member chips" and the app already picks a member
    with `Chip` + `Avatar` [3b] — a fourth way to choose a housemate wasn't worth the pixels.
69. **Search is server-side in the library and client-side in the sheet.** `/cooking/recipes`
    is the one cooking screen whose list can really grow, and `?q=` makes a search something
    you can reload, share and go back to (a real GET form, submitted on a 220 ms debounce, so
    it also works without JavaScript). The plan sheet can't navigate, so it filters the
    summaries the page already loaded — instant, and the household's whole library is a few
    kilobytes.
70. **"Share" becomes "Copy recipe" where the Web Share API is missing** (extends #29 rather
    than hiding the row): on a phone it opens the OS share sheet, on a desktop it puts the
    recipe on the clipboard and says so. Either way v1 shares plain text — a public link
    would need a tokenized public route, and nothing in this app is public.
71. **Cook mode's route ships in plan 07 as an honest placeholder.** [7a]'s "Start cook mode"
    had to lead somewhere, so `/cooking/recipes/[id]/cook` exists with the guard, the recipe
    lookup and the dark surface plan 08 will need — and a screen that says what's coming
    rather than half a cook mode. Its two chip surfaces are the one new token, `--cook-surface`
    (the 10% white the dark screens fill buttons and chips with, drawn all over [7b]/[7h]).
    The button's icon is Lucide's `chef-hat`; the mockup's glyph there is a music note, which
    reads as anything but cooking.

72. **`BODY_SIZE_LIMIT=20M` is now required env, because adapter-node's default is 512K.**
    The built server answers **413 before the form action runs** for any body over that, and a
    recipe photo straight off a phone is several megabytes — so uploads would have been broken
    in production while working perfectly in development, which applies no limit at all. Found
    by review, then reproduced against `node build/index.js`: 900 KB multipart → 413 at 512K,
    and at 20M the same request reaches `processImage` and comes back with our own sentence.
    Set in the Dockerfile and `.env.example`, and deliberately _above_ the app's own 15 MB gate
    so an oversized photo gets our wording rather than a framework error page. The general
    lesson is in ARCHITECTURE.md: the dev server is not a proxy for the deployed one, and
    anything that only the built server enforces has to be tested against the built server.
73. **A recipe id travels with the recipe's name, and planning is atomic per table, not across
    them.** The plan sheet posts `title` alongside `recipeId`, so a recipe a housemate deletes
    while the sheet is open still lands as the free-text meal it was named after; before that,
    `readPlanForm` dropped the title whenever an id was present, `planMeal` had nothing to
    write, and it wrote nothing — reporting success and closing the sheet on a meal that did
    not exist. `planMeal` now says whether it planned anything and the action 409s when it
    didn't.
    The shopping add stays a **second** transaction, which is a deliberate deviation from
    ARCHITECTURE's "anything touching more than one table … is a service function using a
    transaction" (which names this very case). `services/shopping.ts` `addIngredients` opens
    its own transaction and fires its own notification, and one Drizzle transaction cannot
    start inside another; more to the point, if the shopping insert fails the better outcome is
    a planned dinner without its ingredients, not a lost dinner. Rolling both back would undo
    the thing the person actually asked for.
74. **"Added by Elisabeth", not the design's "Added by E".** [7a] and SPEC §4.5 both write the
    initial, and it fits the meta row more tidily — but initials collide (Lukas and Lisa are
    both "L") and the recipe view is the one place the app says who added a thing, so an
    ambiguous credit is worse than a wrapped line. The row is `flex-wrap`, so a long name wraps
    rather than pushing the page sideways at 390px.

75. **The podium ranks by competition, arranges outwards from the winner, and hands a tie's
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
76. **The history feed pages by month, and the window lives in the URL.** "Load more" hands
    back a _month_ (`?from=2026-06-01`) rather than the next _n_ rows: a month is a landmark you
    can picture before you tap, and SPEC §5.8 already offers the choice. In the URL rather than
    in client state so the view survives a refresh, a share and the back button and works with
    no JavaScript — the button is a plain `<a>` (`data-sveltekit-noscroll`, so the page doesn't
    jump back to the podium). The button names the next month that _actually holds something_,
    found with one `max(completedAt)` query below the window, so a household that went quiet
    over the summer doesn't need three taps to reach one June evening. The podium is always the
    current month regardless of how far the feed has been paged back — "This month" is the
    scoreboard, not a cursor.

77. **Role checks live in the service, inside the transaction.** Plan 10's plan said "all with
    role checks in the service (never trust the client)", and the shape that keeps that true is
    `requireOwner(tx, householdId, actorMemberId)` as the first statement of the same
    transaction that writes — not a check in the form action, which the next action to be
    written can forget. Every owner-only path goes through it (rename, transfer, remove, revoke,
    regenerate), and `updateProfile`/`setNotificationPref` need no check at all because they
    only ever take the id `requireMember` just handed the action. The refusals leave as
    `HouseholdError` codes (`not-owner`, `not-member`, `transfer-first`, `remove-self`) and the
    actions map them to 403/404/409 with copy; a member posting `?/makeOwner` by hand gets the
    403 and an unchanged roster. Regenerating the invite code became owner-only too, which #10
    implied and the service didn't enforce — any member may pass the live code around, only the
    owner decides which code is live.
78. **The holiday pause is one component in two surfaces.** SPEC §6 says Settings offers "the
    same control as 5.5", and the cheapest way to make that a fact rather than a resemblance is
    `components/AwayControl.svelte` — the block plan 04 wrote inside `SnoozeSheet`, lifted out
    with a `surface` prop (`sheet` keeps its sunken well [4c]; `row` goes flat inside Settings'
    white group [6a]). It posts to `?/away` relative to whatever page renders it, and both
    pages' actions call the same `setAway`, so there is one answer to "am I away?" and no way
    for the two screens to drift. It sits beside `EnablePush` at the top of `components/` for
    the same reason: shared by a tab and by Settings, owned by neither.
79. **Leaving asks one of three questions.** [6d] draws the member case only, and the other two
    can't borrow its copy. The **last member** takes the household with them — nothing would be
    left to belong to it — so the confirm says "leaving deletes {household} for good … this
    can't be undone" and the button reads "Delete household & leave"; promising that "your
    points stay with the household" there would be a lie about a household that is about to
    stop existing. An **owner with housemates** is refused outright (→ #11): the modal has no
    destructive button at all, just "Hand over the house first" and a link to Members, because
    an error message after the fact is a worse answer than not offering the action. The service
    enforces the same order — `?/leave` posted by hand as the owner answers 409 — and checks
    "am I the last one" _before_ "am I the owner", so the last member out is never told to
    transfer to nobody.
    **The confirm posts which sentence it showed** (`mode`), and `leaveHousehold` only deletes a
    household when that sentence was the destructive one. The roster it decided from is loaded
    data: a page left open while the last housemate leaves would show "your points stay with the
    household" over a button that now deletes everything. The mismatch is refused with "you're
    the only one here now — reload and confirm again" rather than silently doing the worse thing.
    The other direction needs no guard: over-warning and then merely leaving costs nobody
    anything.
80. **Three shared components grew rather than being forked** (again — cf. #53). `BottomSheet`
    took a `lead` snippet and a `subtitle`, which is [6c]'s header: a 52px avatar beside the
    name, with "Member · joined Jul 4 · 210 pts" under it. `StepHeader`'s `step` became
    optional, so the invite screen reached from Settings → Members shows a bare back chevron
    instead of claiming to be "Step 2 of 2" of an onboarding you finished weeks ago (its CTA
    reads **Done** there, → #28). And `utils/household.ts` now holds the two name limits that
    onboarding had declared twice and Settings would have declared a third time. The one number
    that changed meaning: [6c]'s flat "210 pts" is rendered as "{n} pts this month", because
    every point total in this app is the current month's (→ #9) and a bare "210 pts" beside a
    join date reads like a lifetime score.
81. **Settings stays behind the Home avatar stack** (amends #57, which let plan 10 move it).
    The plan suggested "a small gear/avatar affordance — add it", but [8b] draws exactly one
    thing beside the greeting and it is the household's faces; a gear next to them would be a
    second door to the same room and a shape the design never uses. The stack's `aria-label`
    already says "Settings · Household: {names}", so the affordance is announced even though it
    looks like decoration.

82. **A cook timer is sent as seconds, and comes back as time remaining** — never as an
    instant. The plan sketched `POST /api/timers {label, endsAt, …}`, but `endsAt` from the
    client is the wrong clock: the server's is the one the `setTimeout` and the push are
    scheduled against, and a phone forty seconds out of sync would book its alarm forty seconds
    off. So the body carries `seconds`, the server computes `endsAt`, and `CookTimerView`
    answers with `remainingMs` — which the page turns back into an instant in _its_ clock, so
    the countdown on screen is right even when the two disagree.
83. **The open page claims the alert two seconds before zero** (→ SPEC §4.6 "the open page also
    alerts locally"). The page's countdown and the server's alarm fire at the same instant, so
    "whoever gets there first" is a coin toss between a buzz from the app and a notification
    from the OS. A visible page therefore claims `notifiedAt` — the same flag the server would
    have spent — a little early, and rings itself at zero. A **hidden** page never claims: it
    has probably been throttled to a tick a minute, and the push is the entire point of [7h·2].
    Losing the claim (`{owned: false}`) means the push already went out, so the page shows the
    timer as rung but stays quiet rather than alerting twice.
84. **The timer's _length_ lives in the client, its _deadline_ on the server.** Pause and
    "+1:00" are cancel-and-recreate (→ #15), so a resumed row only knows it was created for
    5:39 — the 8:00 you actually set is gone from the database. `totalSeconds` therefore lives
    in `CookTimer`, which is what keeps the ring reading "how much of what I set is left" across
    a "+1:00" instead of snapping back to full. The trade is visible in one place: a page
    reloaded mid-timer reads the length back as `endsAt - createdAt` and so says "5:39" where it
    said "9:00" before. Honest about the row it found, and cheaper than a column.
85. **The timer state machine is a runes class** (`lib/cook-timer.svelte.ts` — the repo's first
    `.svelte.ts`). Three parts of cook mode read the same timer: the big ring on the step that
    started it, the compact bar on every other step, and the chip row that offers to start one.
    Putting it in the page would have made the page own an interval, three fetches and a
    lifecycle; putting it in the ring would have made the other two ask the ring. This is the
    documented Svelte 5 shape for exactly that, and it keeps all three components dumb.
86. **The ring is pinned; the step text is what scrolls.** [7h] positions the ring absolutely at
    `top: 340px`, which works for the mockup's two-line step and puts Pause below the fold on a
    five-line one — the seeded "Sauté the mushrooms in butter until golden, 8 minutes, season
    well." is five lines at 33px on a 390px screen. So cook mode is a column: header and
    progress, then a scrolling step, then the ring, then the pinned Prev/Next. A countdown you
    have to scroll to pause is not a kitchen timer. The scrolling half fades at its bottom edge
    rather than slicing a chip in half, and while the ring is up the "This step uses…" line
    stands down — [7h] clears that whole area, and the peek sheet says the same thing better.
87. **"Set a timer" is a button in the header, not an overflow menu.** The plan put the manual
    minute stepper "in header overflow"; an overflow menu holding one item is two taps and a
    modal to reach what a second round button reaches in one, on the screen in the app most
    likely to be operated with a knuckle. The parsed-timer chip becomes **Set timer** on steps
    where nothing parses, so the common case never opens a menu either.
88. **Two shared components grew a `tone`, rather than being forked dark** (again — cf. #53,
    #80). `BottomSheet` and `Stepper` take `tone="dark"`: the focus trap, Escape, the scroll
    lock and the clamping are the same problems on any background, and only the surfaces differ.
    Cook mode's chips and buttons stay bespoke, because those really are a different shape.
    Five tokens joined the `--cook-*` family for the pixels the design uses but `app.css` hadn't
    named yet: `--cook-text-2` (the ingredients under a step), `--cook-track`, `--cook-divider`,
    `--cook-amber-line` and `--cook-amber-tint`.
89. **`requireMemberApi` / `requireUserApi`** — the guards for the JSON endpoints (→ #20).
    `requireMember` _redirects_, which is right for a page and useless for `fetch`: a 303 to
    /login arrives as a 200 with a page of HTML in it, so a signed-out timer request would look
    like a successful one. The API pair answers 401/403 instead. `api/push/subscribe` had
    hand-rolled the same check; it now shares these.
90. **A timer rings for ten minutes and then never.** Unlike a task nudge, which is still worth
    having at 13:45 if the server was down all morning (→ #60), "the pasta is done" is worth
    nothing an hour late — it is a lie about a pan. The catch-up sweep only rings rows that
    ended within the last ten minutes, and the push goes out with a 15-minute TTL. The window is
    also what keeps the sweep cheap forever: rows older than it sit below the index range and
    are never scanned again.

91. **The nightly backup is `better-sqlite3.backup()`, not the `sqlite3` CLI.** Plan 11 wrote
    "`sqlite3 .backup`", but the slim runtime image (`node:22-bookworm-slim`) ships no `sqlite3`
    binary, and a plain `cp` of a WAL-mode `.db` mid-write captures a torn file. better-sqlite3
    exposes SQLite's Online Backup API in-process — a consistent snapshot of a live database with
    no writer lock and no extra dependency — so `lib/server/backup.ts` uses it. Verified it
    produces a complete standalone database (1000/1000 rows, no `-wal` sidecar until reopened).
    One file per day at `${DATABASE_PATH dir}/backups/YYYY-MM-DD.db` (on the `/data` volume),
    14-day rotation by filename date, written to a `.tmp` sibling and renamed in so a crash never
    leaves a half-file wearing today's date. The cron gate is the resilient "at or after 03:00
    server-local, once per day" shape from #45 — **server**-local, not household-local, because
    there is one database and it has no household clock (like the cook-timer sweep). The
    already-ran ledger is one in-memory string, harmless to lose: a re-run only overwrites the
    day's file. Restore is documented in `docs/plans/11-pwa-deploy.md` (drop in a snapshot, delete
    the live WAL sidecars, restart). Litestream stays the documented optional upgrade (→ #19).
92. **`viewport-fit=cover` was missing, so every safe-area inset was silently 0.** The app was
    written throughout with `env(safe-area-inset-*)` (tab bar, FAB, sheets, page shell, cook mode)
    — but `env()` only returns real values when the viewport opts into the display cutout with
    `viewport-fit=cover`, which `app.html` didn't set. So on a notched phone the tab bar and FAB
    sat under the home indicator and the code that meant to prevent it did nothing. Fixed on the
    viewport meta; the insets are now live. Related head decision: **`theme-color` stays only in
    the root layout, never in `app.html`.** Cook mode swaps it dark (#88 territory), and two
    `theme-color` metas mean the first wins — app.html's would always be first and freeze it
    light. So the static PWA tags (manifest, apple-touch, favicons, apple/mobile web-app metas)
    live in `app.html`; the one dynamic tag lives in the layout. The scaffold's Svelte-logo
    `favicon.svg` was replaced by the generated mark (→ ARCHITECTURE "PWA").

93. **i18n is a hand-written, type-checked catalog — no library.** `src/lib/i18n/messages/en.ts`
    is the schema (`Messages = typeof en`) and `de.ts` is declared `: Messages`, so a missing,
    misspelt or wrongly-shaped key fails `npm run check` instead of falling back to English at
    runtime. There is no key lookup by string and no missing-key path. Rejected Paraglide and
    svelte-i18n: the call-site edit is identical either way, and this keeps the zero-dependency,
    zero-build-step posture the rest of the app has — at the price of owning ~150 lines of
    infrastructure. **Anything with a number, a name or a plural in it is a function**, so each
    language writes its own agreement rules rather than filling in a shape English chose
    ("3 days overdue" vs "seit 3 Tagen überfällig", "It's Lukas's turn" vs "Lukas ist dran").
    German is **Austrian** (`de-AT`), matching the Europe/Vienna default: `Intl` then writes
    "Jänner"/"Jän." instead of "Januar"/"Jan.", which is the only place the tag changes anything
    this app shows, and the copy uses the Austrian word where one exists ("Mist rausbringen",
    not "Müll"). It is the written standard as Austria writes it, not dialect, so it still reads
    plainly to any German speaker. The locale _key_ stays `de` — it names a language, and that
    is what `members.locale`, the cookie and the switcher speak; only the rendering tags
    (`INTL_LOCALE`, `HTML_LANG`) are regional, which is why those are separate tables and why
    moving to `de-DE` or adding `de-CH` needs no migration.

94. **Which language a request gets: member choice → cookie → `Accept-Language` → English.**
    `members.locale` is nullable and NULL is a _real setting_ — the "System" option — meaning
    "follow whatever device I'm on", which is what lets the fall-through happen. Nothing writes
    a cookie from negotiation; only an explicit choice does, or changing the phone's language
    would stop changing the app's. The cookie exists for the signed-out screens (login, an
    invite link) and to make the first paint after a switch already correct. `<html lang>` is a
    placeholder filled in `hooks.server.ts` — it is the one attribute of the document no
    component can reach.

95. **Switching language reloads the document.** The catalog a component holds is a snapshot
    taken at mount, which is only safe because `<html lang>`, the `Intl` formatter caches and
    every server-rendered string have to change together — and only a fresh request does all of
    that. The switcher therefore calls `location.reload()` itself rather than leaning on the
    browser's default form navigation, which was observed being swallowed in testing: the
    preference saved while the page carried on in the old language, the one outcome that screen
    must never produce. The root layout asserts the invariant (`data.locale !== mounted →
reload`) so it can't silently regress.

96. **Values in `utils/`, words in the catalog.** `EFFORTS`, `REPEAT_PRESETS`, `SNOOZE_PRESETS`,
    `STARTERS`, `MEMBER_COLORS` and the task-section order all carry a `key` and no label —
    "Small" and "Klein" are two names for `points: 5`. Same rule server-side: `TaskSection`
    ships its key and not a heading, `ShoppingGroup.name` is null for the virtual "Other" group,
    `UploadError` carries a code rather than a sentence, and `TaskContext` grew a `locale`
    beside `today`/`timezone` for the handful of rows that come back already written out.
    **Household content is never translated** — task names, recipes, stores and meal titles are
    what the household typed. The starter chores and the three default stores are _seeded_ in
    the creator's language and are theirs to rename from then on.

97. **Units are stored canonically and labelled per language**, so switching language re-labels
    the list rather than rewriting it: the column keeps `tbsp`, the screen reads "tbsp" or "EL".
    `UNIT_ALIASES` reads both languages into the same canonical unit, so "2 EL Öl" and
    "2 tbsp oil" store identically and each round-trips through the edit form in whichever
    language is on. Anything a member typed that isn't in the table shows exactly as typed.

98. **A push notification is written in the recipient's language, not the sender's.** It is the
    one place the app addresses somebody who isn't making the request — a shopping nudge goes to
    the _other_ housemate, and the morning sweep has no request at all. So `sendToUser` /
    `sendToMembers` take a `PayloadFor` callback instead of a finished payload, and `deliver`
    encodes once per language actually in play. `push_subscriptions.locale` records what the
    _device_ was reading when it subscribed, which is what makes "detect the system language"
    true for notifications as well as pages; an explicit `members.locale` outranks it.

99. **The meal plan reaches two weeks — this one and the next — and which is on screen lives in
    `?week=YYYY-MM-DD`.** Planning happens _before_ the week it plans, so "current week only"
    (SPEC §4.1) made the tab useless on the evening the plan actually gets made. The window goes
    in the URL rather than in component state, so it survives a reload, a share and the back
    button: the shape the history feed's `?from=` established (→ #76). `getPlan` takes the param
    as `unknown`, normalises any day of a week to its Monday, and clamps anything else to this
    week rather than erroring — a bookmark from a fortnight ago should open on this week, not on
    an empty window with no way back. Free paging was rejected: a meal plan has no landmarks to
    page through, and two named windows let the control _name_ them (`SegmentedControl` in link
    mode, the shape /tasks ↔ /tasks/history already uses) where two chevrons flanking a date
    range would have to be decoded — and the inactive segment's count ("Next week · 0") is
    itself the nudge to go and plan. Three consequences. **(a)** The `<h1>` gives up "This week"
    and becomes "Cooking" like every other tab root — a deviation from [04], where the heading
    was the only thing naming the week, but a 30px Fraunces "This week" directly above a control
    also saying "This week" is the screen we did not want. **(b)** `today` still comes from the
    `(app)` layout, so `isToday` stays a fact about the date: on next week nothing is sage and
    `MealRow`'s "Tonight ·" line falls to "{name} cooks" with no change to that file. `WeekStrip`
    stays non-interactive — the meal rows below are already one tap target per day, and the
    switch above is a labelled control where chevrons in the strip would be a smaller, invisible
    one. **(c)** "Add ingredients to shopping list" is unchanged and still defaults **on** for
    either week: `shopping_items` carries no date, so the toggle has always meant "put these on
    the list now", and shopping ahead is precisely why the plan gets made on a Sunday. Because
    both weeks ship in one 14-day query, a recipe's "Add to plan" day picker [7a] lists both
    under THIS WEEK / NEXT WEEK rather than being stranded on the current one. Note the plan
    sheets are opened from client state inside a `<dialog>`, so they do not exist at all without
    JavaScript — the segments are the part of this feature that works without it.

100. **The ingredient row keeps its one typed line; structured controls are a second way to write
     it.** [3c] draws one line per ingredient and the server has always parsed it (→ #14, whose
     "plain text" is about what the form _posts_ — still true), but nothing on screen ever said
     what the parse made of it: "2 x 400 g tins tomatoes" is stored as 2 pcs of an ingredient
     _named_ "400 g tins tomatoes", and that name is what cook mode underlines and what the
     shopping list dedupes on. So each row now carries a quiet amount chip in the column [7a]
     prints the amount in, and tapping it opens `cooking/IngredientSheet` — name, amount, and
     [3a]'s unit picker plus a "no unit" option, because salt is not measured in pieces. The
     sheet **posts nothing**: it takes the line apart with `parseIngredient` and hands a line
     back, so `readRecipeForm` still reads one `ingredient` field per row, `writeChildren` still
     calls the one parser this app has, and every recipe written before this edits and re-saves
     byte-identically. Three parallel field arrays were rejected — they stay aligned only while
     every row posts every field, and one row that skipped one would silently move somebody
     else's grams onto the wrong ingredient with no error anywhere. Fully structured rows were
     rejected twice over: a name, an amount, a unit and three controls do not fit one line at
     390px, and twelve ingredients would become twelve trips through a native picker instead of
     twelve lines and an Enter. The chip is a `<span>` server-side and a `<button>` after
     hydration, so a browser with no JavaScript loses the sheet and keeps both the recipe and
     the reading.

101. **A recipe amount is typed, not stepped — and the sheet says what its line will be read
     as.** [3a]'s quantity is a `Stepper` because a shopping list counts things; a recipe
     measures them. `Stepper` rounds on blur and carries `step="1"`, so opening it on "½ tsp
     salt" would round the half away — and `parseIngredient` accepts "½", "1 1/2" and "1,5"
     while `formatAmount` writes the glyph back, precisely so that round trip holds (→ #42). The
     amount is therefore a `TextField` held as _text_ with `inputmode="decimal"`, and the same
     parser the server runs reads it back. Adding a `step`/`precision` escape hatch to `Stepper`
     was rejected: it is shared with /shopping and cook mode's minute sheet, and stepping
     quarters through "400 g" is nonsense. The honest limit of composing three fields back into
     one line is that a few names cannot be escaped — "1 Packung Nudeln" reads back as one _pack_
     of "Nudeln", "7up" as 7 of "up", because the first word is a unit alias or a numeral. There
     is no spelling that avoids it while the line stays the wire format, so
     `composeIngredientLine` returns the reading alongside the line and the sheet shows it live
     under the fields ("Saved as **1 Pck. Nudeln**"). Nothing is silent; the alternative —
     refusing the save — would leave someone with a row they cannot express and no way forward.
     The unit `Select` is never disabled for the same reason: a disabled `<select>` leaves the
     tab order and takes its own explanation with it, so the hint says "Only saved with an
     amount" and the preview shows it happening.

102. **Three cook timers at once, and a refusal instead of a replacement.** One at a time was
     never a data rule — `cook_timers` has no unique index — it was `startTimer`
     blanket-cancelling every live row for the person before inserting. Fine while the screen
     could only show one, actively harmful once it can show three: cancelling a timer somebody
     is still watching is silent, and silence is the one thing a kitchen timer must not be. So
     the blanket cancel becomes a counted check in the same transaction against
     `TIMERS_MAX = 3`, throwing `too-many-timers` → 409, plus an explicit `replaces` on the start
     input naming the one row the caller is genuinely handing in. Three because a kitchen watches
     a pan, an oven and a kettle, and because ring + two bars is what fits above the Next button
     at 390px (→ #86). The cap lives in `lib/utils/timer-parse.ts` beside the duration bounds,
     for the reason those do. `getActiveTimer` becomes `listActiveTimers`, ordered `endsAt, id` —
     soonest first, with the tiebreaker the old `desc(createdAt)` lacked, and unlimited, so an
     overflow row stays visible and cancellable rather than becoming an unstoppable phantom push.
     Two consequences worth naming: **"+1:00" now has to name the row it replaces**, because it
     used to lean on the blanket cancel and would otherwise orphan a live row that rings a pan
     already off _and_ eat a cap slot; and the two-taps race that could leave _zero_ live rows
     under a running countdown — killing the locked-phone push entirely — cannot happen any more,
     since no request touches another's row.

103. **The timers belong to the app, not to cook mode.** `CookTimer` was built for cook mode and
     died with it, which is why a timer you walked away from was invisible.
     `lib/cook-timer.svelte.ts` grows a `CookTimers` manager exported as a module singleton, and
     cook mode reads it instead of constructing one. This is #85's argument one ring out — three
     dumb readers become four, one of them a different screen — and it settles the thing that
     makes a second countdown dangerous: the claim (→ #83) lives in the store, so there is
     exactly one claimer whatever is on screen, and no two surfaces can race for one
     `notifiedAt` and leave the loser silent while no push was sent either. The manager owns one
     200ms interval for all three, because three countdowns off by a tick is exactly what a
     kitchen notices. It also makes the dock appear _when you leave_: the `(app)` layout load
     reads no `event.url`, so it does not re-run on a client-side navigation, and a
     load-data-only banner would need its own invalidation key to show up at all. **A module
     singleton on a server is shared between requests**, so it is written only from `$effect`s —
     which never run during SSR — and every write refuses outside the browser. Two prices are
     accepted rather than hidden. The ring is no longer server-rendered, so a reload with a timer
     running paints the step first and the ring on hydration; and `sync` **must** be called
     inside `untrack`, because it reads the `phase` and `remainingMs` the ticker writes and would
     otherwise re-run five times a second against stale load data and delete live timers. A
     paused timer still exists only in the tab that paused it (pause deletes the row, → #15),
     which the dock cannot show and a reload still loses.

104. **The dock is fixed above the tab bar, and it is not a `Banner`.** Every existing banner is
     in normal flow, which is right for something you read once and wrong for something you
     glance at while scrolling a shopping list. So the dock borrows the tab bar's own positioning
     — pinned to the 480px column rather than to the viewport — sits above it at `z-index: 11`
     (it never overlaps the tabs, and 11 keeps `--shadow-tabbar`'s upward throw off its edge),
     and the shell makes room via `--timer-dock-h`, which the FAB also reads so it stops covering
     the chevron. Not `ui/Banner`: its two variants are token-bound to danger and info, its
     `href` form deliberately suppresses `onclick`/`ondismiss` — and this row is both a way back
     and a dismiss — and it is not an alert but the compact rendering of a running timer, i.e.
     `CookTimerBar` with a different job. It carries `role="status"`, because outside cook mode
     it is the only in-app surface a rung timer has. Running is sage, rung is terracotta, which
     in this app already means "now". No new colour tokens.

105. **Bought items leave their store group for one "Recently bought" section, and the split is
     one function both halves call.** SPEC §3.1 used to send a checked row to the end of its
     group, which is fine for the two items the mockup strikes through and wrong by the end of a
     real trip: the store headings stay, the rows you still need get pushed down, and the last
     screen of a shop is mostly things you already have. So checked items leave the groups
     entirely and collect in one collapsed section under them, newest first, across all stores —
     a store with nothing left to buy disappears with them. Collapsed by default because "what's
     in the trolley" is context and the header's "4 of 9 done" is the part you actually check;
     open by default when there is nothing left to buy, or the screen would read as an empty
     list. What made the old shape awkward was that the order lived twice — an `ORDER BY` in
     `getShoppingList` and a comparator in the browser, "keep them in step" — and an optimistic
     tick now moves a row _between two lists_, which is far more than a sort. So the service
     returns the list flat and `utils/shopping.ts` `splitList` groups it: once on the server for
     the first paint, again in the browser on every tick, one definition. Grouping needs the
     stores in walking order, which the page already loads for the sheet's chips.

106. **The add field completes from a table of its own, and the whole pool goes to the browser.**
     "Type Rind, get Rinderhackfleisch" cannot be a query over `shopping_items`: those rows are
     deleted 12 h after they're checked off (→ #13), so the list is a shopping trip and a
     household's vocabulary has to outlive it. Hence `shopping_suggestions` — one row per
     distinct name, upserted on every add, rename and recipe pour-in, keyed on
     `(household, lower(name))` so capitalisation doesn't fork a word into two.
     Renaming counts as using a name: the point is that somebody fixing a typo stops being
     offered the typo. The pool is then sent **whole** with the page (250 most recent names, a
     few KB) and filtered in the browser, rather than through a per-keystroke endpoint — the
     field's entire promise is that it keeps up with typing, JSON endpoints in this app are for
     push, timers and uploads (→ ARCHITECTURE "Server patterns"), and a household's vocabulary is
     small enough that the request would cost more than the data. Ranking is three tiers — the
     name starts with what you typed, a word inside it does, it appears anywhere — because
     German compounds make a plain prefix match useless ("hack" must find
     "Rinderhackfleisch"); ties break on recency. Names already on the list are filtered out
     client-side: offering something three rows below is an invitation to buy it twice. No
     pruning job — the table grows by distinct words, which a household of two exhausts long
     before it becomes a row count worth a cron.

107. **The undo bar is the tick's receipt, not a second source of truth — and it is the one place
     the app inverts.** #105 moves a ticked row out of its store group and into a section that is
     folded up by default, which makes the one thing you might want next — putting it back,
     because that was the wrong line — the hardest thing on the screen to find. So a bar appears
     above the tab bar for five seconds: "**{item}** checked off · Undo".
     It is dark, which took a beat to justify in a warm, soft app that has exactly one dark
     surface on purpose (cook mode). But a toast's real job here isn't to be pretty, it's to
     _not read as a row_ in a UI that is otherwise all cream and white — and every lighter option
     fails that. Sage collides with the checked-state sage; a cream pill dissolves into the
     sheets. Inverted is the only surface on the palette that says "message, not list" at a
     glance. The dark is `--ink` (which cook mode already is) warmed a touch to `--toast` so it
     doesn't go cold beside the paper, and it stays Choreganized's rather than a system
     snackbar's by keeping the sage check dot and a sage "Undo" — the latter lifted to
     `--toast-accent` because plain `--sage` on the dark is ~3.9:1, under AA (the lifted one
     clears it at ~5.8:1). Text borrows cook mode's off-whites. No new dark _surface_ concept —
     the same ink, one transient spot.
     Furniture-wise it borrows `TimerDock`'s framing (the 480px column, the `rise`), sits at
     `z-index: 12` and reads `--timer-dock-h` so it stacks above a running timer rather than on
     it — one more reason that dock is not a `ui/Banner` (→ #104), and the same reason this is a
     feature component in `components/shopping/` rather than a `ui/Toast`: one caller, and the
     undo is a form action, not a callback.
     Three things it deliberately does not do. It does not queue: a second tick replaces it, so
     the bar always speaks about the last thing you did, and everything before that is in
     "Recently bought" — which is also why a five-second timer is not a WCAG 2.2.1 problem here,
     since the action it offers never actually expires. It does not wait for the server: it is
     shown the instant the row moves, like every other optimistic edge in this list, and takes
     itself away again if the tick comes back a failure. And it says nothing when you _un_-tick
     something, because that is already an undo.

108. **Recipe import reads Schema.org JSON-LD, and that needs no dependency and no AI** (→ plan
     12, SPEC §4.7). Nearly every recipe site embeds a `<script type="application/ld+json">` with
     a `Recipe` in it, because Google's rich results ask for one — so the import is a fetch, a
     regex for the script bodies, `JSON.parse`, and a walk to the first `Recipe`. The regex is
     safe precisely here: a `<script>`'s content can't contain `</script>`, so a non-greedy match
     to the first close tag can't under-run, and no HTML parser is pulled in for it. The walk
     handles the shapes real sites use — a top-level object or array, a `@graph` wrapper, `@type`
     as a string or an array — and a malformed block is skipped, not thrown on, so one blog's
     stray comma doesn't lose the recipe in the next block. The mapping keeps ingredients as
     **raw lines**, not parsed columns: the editor already parses a typed line to (amount, unit,
     name), so a line stays in exactly the shape the user types and an imperfect parse is visible
     and fixable before Save. Microdata/RDFa are out of scope — JSON-LD covers the overwhelming
     majority, and the dead-end page is plan 13's AI fallback. The parser is a pure module
     (`utils/recipe-jsonld.ts`) with its own `node --test` suite, kept free of `$lib`/server
     imports so the runner can load it and the mapping is pinned against regressions.

109. **The import fetch is SSRF-guarded to "public hosts only", and DNS-rebinding is explicitly
     out of scope** (→ `server/recipe-import.ts`). The server fetches a URL the user typed, so it
     resolves the hostname and refuses any address that is loopback, RFC-1918 private, link-local
     (which includes `169.254.169.254`, the cloud metadata endpoint), CGNAT or reserved — for
     both IP families — `http(s)` only, and it re-runs that check on **every redirect hop** by
     following redirects by hand, because a 302 to `http://127.0.0.1/` is the oldest trick there
     is. The response is bounded too: ~10 s, ~3 MB, `text/html` only, redirects capped at ~5. What
     it deliberately does **not** do is pin the connection to the vetted IP, so a hostname that
     passes the check and then re-resolves to a private address between the check and the fetch
     (DNS rebinding) is not defended against — a real hardening for a public multi-tenant service,
     but disproportionate for a two-person household app fetching recipe blogs, and it would mean
     a custom `undici` dispatcher. The address is resolved and checked immediately before the
     fetch, and the residual TOCTOU window is accepted.

110. **An imported photo is downloaded before Save, previewed as a data URL, and attached only if
     it's an unclaimed temp file.** The plan wanted the editor to show the _real_ photo it would
     save (not a hotlink to the source, which leaks the reader's IP and can be hostile), so the
     image is fetched server-side through the same sharp→WebP pipeline as an upload and written to
     a temp file straight away. But that file isn't attached to any recipe yet, and the image
     endpoint (rightly) serves only a file some recipe in _your_ household owns (→ #62, SPEC §8) —
     so it can't serve the preview. Rather than open a second, less-scoped serving path, the
     preview is **inlined as a `data:` URL** (the bytes are the user's own download, in the user's
     own page — no new surface), and the editor carries the temp path in a hidden field. Save
     attaches it through `claimImportedPhoto`, which refuses any path that is already some recipe's
     `imagePath` — the one query in the app deliberately _not_ scoped to a household, because
     without it a member could post another household's photo path and read that picture through
     their own recipe. A genuine temp file is owned by nobody (nothing is persisted before Save),
     so it passes; the random-UUID filename makes guessing an in-flight one a non-threat.
     **Cleanup**: a fresh pick or a removal deletes the temp on Save; a cancelled or closed import
     leaves it unreferenced, and a nightly cron sweep collects unreferenced recipe photos older
     than 24 h (the age floor is longer than any editing session, so a still-open editor's photo
     is never pulled out from under it). That sweep is the one place the uploads dir is listed,
     and it's maintenance only — serving security is unchanged.

111. **The share target is `GET`, and it also reads a URL out of `?text=`.** The manifest
     registers `/cooking/recipes/import` as a share target with `url`/`text`/`title` params; the
     page prefills the field and auto-submits. Android browsers frequently share a page as plain
     text with the link _inside_ `text` (or `title`) rather than in `url`, so the load pulls the
     first `http(s)` URL out of those as a fallback. `GET` (not `POST`) because the share carries
     no file — plan 13's photo-share will add the `POST`/`multipart` variant.

112. **AI recipe import uses the household's own Google Gemini key, stored plaintext, and never
     acts without an explicit tap** (→ plan 13, SPEC §4.7, §6). The fallback for what JSON-LD
     import (→ #108) can't read — a page with no `Recipe` markup, text pasted from a bot-blocked
     site, photos of a cookbook — is one `@google/genai` (v2.13.0) call on the current Flash
     model (vision-capable, cents an import). The model is **`gemini-flash-latest`** — an alias
     Google keeps pointed at the live Flash model — not a pinned version, because Google retires
     versions aggressively and often early: the originally-pinned `gemini-2.5-flash` began
     returning `404 "no longer available"` around 2026-07-09, *weeks* before its own scheduled
     Oct-16 shutdown, breaking every request. `GEMINI_MODEL` in the env overrides the alias
     without a code change if a rotation ever needs a specific id, and a `404` now maps to a
     distinct "model unavailable" message instead of a generic failure (→ services/ai-import.ts). The key lives in `households.geminiApiKey` **in the
     clear**: the DB is this household's own file in a single-tenant container, so any key that
     could decrypt it would have to sit in that same container — encryption there buys nothing
     real. It never reaches the browser (server-only modules; Settings returns a masked
     first-four-plus-last-four hint plus a set/unset flag), and only the owner can set or remove it
     (`requireOwner` in the write, → #10). Extraction is structured output against a hand-written
     `responseSchema` (no zod in the tree) → the same `RecipePrefill` the link importer produces,
     so all paths converge on the [3c] editor and **nothing is ever saved by the model** — each
     extraction opens the editor with a "check before saving" note. Ingredients stay raw lines
     (→ #108); recipe content keeps its source language (→ §9). The page path **re-fetches** the
     URL on the tap rather than caching the stripped HTML across the request — a second guarded
     fetch of a page that just succeeded is cheap, keeps the action stateless, and avoids
     round-tripping tens of KB through a hidden field. Other providers and on-device models are
     out of scope (a PWA has no bridge to on-device Gemma; browser-local inference is GB-scale
     downloads).

113. **Gemini errors are mapped by HTTP status, because the SDK has no typed error hierarchy**
     (→ `services/ai-import.ts`). Unlike Anthropic's SDK, `@google/genai` throws a single
     `ApiError` carrying a numeric `status` — there is no `AuthenticationError`/`RateLimitError`
     class to catch. So the mapping reads the status: `429` → "try later", `401`/`403` → bad key,
     and a rejected key's actual shape — a **`400` whose message says "API key not valid"** — is
     matched on that message, not on a class. Anything else, and an empty or unparseable model
     reply, becomes a generic "couldn't extract" — the raw API string is never shown to the user.

114. **One "Add a recipe" chooser replaces the New button + separate import link, and the import
     screen is focused per mode** (→ plan 14, SPEC §4.3/§4.7). Plans 12–13 left three doors to a
     new recipe — the New FAB, a quiet "Import from a link" link, and a stacked import page whose
     link field sat above two collapsed AI sections — which read as an afterthought. Now the FAB
     (and the empty-state button) open a single bottom-sheet chooser with four rows: **From a
     link**, **From a photo** (AI), **Paste text** (AI), **Enter by hand**. The two AI options
     are kept **separate** rather than folded into one "AI" entry, because a camera and a paste
     are different actions and "From a photo" is the flagship worth its own row. The chooser is
     dumb (static links); the two AI rows route to Settings — not a dead end — when no key is set,
     which also makes the feature discoverable. The import route reuses its five actions but
     renders **one focused method per `?mode=`** (`link` default, `photo`, `text`), so each is a
     clean screen; the link→AI "Try AI extraction" stays as an in-context escalation with quiet
     links across to the photo/text modes. The share target keeps landing in link mode.

## Open questions (non-blocking, defaults chosen)

- **Production domain** — invite links & OAuth redirect need the final origin (design shows
  `choreganized.app`). Default: whatever Coolify serves; set `ORIGIN`/`BETTER_AUTH_URL`.
- ~~**Google OAuth credentials**~~ — **resolved 2026-07-22**: the GCP OAuth client exists, the
  keys are in `.env`, and Lukas walked the sign-in round-trip by hand. Agent sessions still
  can't drive it (Claude must never enter the owner's Google login), so the temporary
  email-password switch stays the way plans verify auth — see the memory note and plan 00.
- ~~**Language**~~ — **resolved 2026-07-24**: English + German, switchable in Settings, with
  the browser's own language as the default (→ #93–#97, [SPEC §9](SPEC.md)). A third language
  is `LOCALES` + one catalog file; nothing else changes.
- **Recipe share** ([7c] "Share") — v1 ships plain-text share (Web Share API). Public share
  links would need a tokenized public route; deferred.

## Later (explicitly out of v1 scope)

SSE live updates · passkeys · email auth · Apple sign-in · multi-household ·
meal slots beyond dinner · offline mutations · iOS polish pass.
