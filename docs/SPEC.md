# Choreganized — Product Spec

> Household app for two (Lukas & Elisabeth, works for N members). Warm/minimal design
> (sage + terracotta, Fraunces + Figtree). Tagline: **Every chore, organized.**
>
> Ground truth for visuals: [`design/Hearth.dc.html`](../design/Hearth.dc.html) — open it in a
> browser. Screens are referenced below by their anchor badges (e.g. **[5a]** = `#5a` in that file).
> This document is the ground truth for _behavior_. Where the two conflict, see
> [DECISIONS.md](DECISIONS.md).

The app is an installable PWA (Android-first) with four tabs — **Home, Shopping, Cooking,
Tasks** — plus onboarding and settings. No finances, no message board.

---

## 1. Onboarding & household

### 1.1 Log in [5a]

- Logo + wordmark + tagline, then sign-in.
- **v1: "Continue with Google" only** (Better Auth). The design's email/password fields and
  Apple button are deferred (→ [DECISIONS.md #1](DECISIONS.md)). Keep the layout; render a
  single Google button where the form is.
- Signed-in users with a household land on Home; without one, on the create-or-join step.

### 1.2 Create or join [5b]

- "Welcome, {firstName}" (from Google profile). Two selectable cards: **Create a household**
  ("Start fresh and invite the people you live with.") / **Join a household** ("Got an invite
  link or code? Enter it here."). Continue button.

### 1.3 Create → set up your home [5c] (step 1 of 2)

- Fields: **Household name** (e.g. "Sonnengasse 12"), **Your display name** (prefilled from
  Google given name), **Your colour** — swatch row from the member palette (sage, terracotta,
  blue, amber, plum); preview avatar shows the initial on the chosen colour.
- Creates household (creator becomes **owner**), stores timezone from the browser
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`), seeds default stores
  (Grocery, Drugstore, Hardware store) and generates an invite code.

### 1.4 Create → invite housemates [5d] (step 2 of 2)

- Big sage card with the **invite code** displayed as `7K4-P2X` (stored without the dash).
- Invite **link** `{ORIGIN}/j/{code}` with Copy; **Share invite** opens the OS share sheet and is
  shown **only where the Web Share API exists** (phones) — on desktop it would duplicate Copy
  (→ [DECISIONS.md #29](DECISIONS.md)).
- Members list: you (Owner badge) + a dashed "Waiting for someone to join…" row.
- One CTA: **Move in** → Home. (The design's second "I'll invite them later" link went to the same
  place; the invite screen stays reachable from Settings → Members.)

### 1.5 Join [5e]

- Via link `/j/{code}`: public landing shows inviter avatar + "**Lukas** invited you to
  **Sonnengasse 12**", then Google sign-in, then join.
- Via code: 6-box code input (letters/digits, dash ignored, case-insensitive).
- After joining, the joiner sets **display name + colour** (same fields as 1.3, minus household
  name; colours already taken by other members are shown as unavailable).
- Invalid/revoked code → inline error, stay on screen.

### 1.6 Rules

- One household per user in v1. Leaving (or being removed) returns you to create-or-join.
- Invite code: single active code per household, revocable/regenerable (→ §7.2).

---

## 2. Home tab [8b is the canonical variant]

Top: household name (small caps), "Good {morning|afternoon|evening}, {name}", stacked member
avatars. Then, in order:

1. **Recent activity card** — the 2 most recent completed tasks (check circle in the member's
   colour, task name, "{member} · {time}", `+{points}` in the member's colour). Header links
   "All →" to Tasks → History. Hidden when there are no completions yet.
2. **Tonight's dinner card** — today's meal from the plan: photo thumb (or placeholder art),
   name, "{member} is cooking" with mini avatar (cook line hidden if no cook set). Tap → recipe
   view (or Cooking tab for custom meals). Hidden if nothing is planned today; show it as an
   "Add tonight's dinner" affordance linking to Cooking instead.
3. **Stat tiles** (2-up): "{n} on shopping list" (unchecked items) → Shopping;
   "{n} tasks due today" (due today + overdue) → Tasks.
4. **Standings strip** — "You're 1st this month" / "240 pts · 30 ahead of Elisabeth" + stacked
   avatars → Tasks → History. (Ties: "You're tied this month".)
5. **Overdue banner** [4e] — shown when the current user has overdue tasks (assigned to them or
   Anyone): danger-tinted card "1 task overdue / {task} · your turn" + View → Tasks.
   Sits above the activity card when present.

Bottom tab bar on all four tabs: Home, Shopping, Cooking, Tasks; active = sage. Tasks tab shows
a danger badge with the current user's overdue count [4e].

---

## 3. Shopping tab

### 3.1 List [03 main]

- Header "Shopping" + "{checked} of {total} done" (hidden when list empty).
- **Add an item…** inline field pinned above the list; typing + Enter (or the + button) adds
  instantly to the default store (topmost). Opening the field's expand affordance opens the full
  sheet [3a].
- **Suggestions**: as you type, the field offers names this household has put on the list
  before, most recently used first ("Rind" → "Rinderhackfleisch"). Case- and accent-blind, and
  a match inside a word counts — German compounds make "starts with" useless on its own. Up to
  6 at a time, in a list floating under the field; ↑/↓ + Enter or a tap. In the quick field a
  pick **adds the item** (one gesture is the field's whole point); in the sheet [3a] it fills
  the name and stops, because the sheet exists to say how much and which shop. Names already
  waiting on the list are never suggested. The pool is every name ever added, renamed or poured
  in from a recipe — it outlives the items themselves (→ [DECISIONS #106](DECISIONS.md)).
- Items grouped by **store**, in store sort order; items without a store under **Other** (last).
  Store header: pin icon + uppercase name. Stores with nothing left to buy are hidden.
- Row: check circle, name, optional quantity ("×6", "2L" — quantity+unit compact), adder's mini
  avatar. Checking: sage fill + strikethrough, and the row **leaves its store group** for
  "Recently bought". Unchecking puts it back where it was.
- **Undo bar**: for ~5 s after a tick, a dark toast above the tab bar says "**{item}** checked
  off" with an **Undo** — the moment you'd notice the wrong line is also the moment the row is
  hardest to find. Inverted on purpose: in an otherwise cream-and-white list it's the one
  surface that can't be mistaken for a row (→ [DECISIONS #107](DECISIONS.md)). It replaces
  itself when the next item is ticked, and holds while a keyboard is on it. Nothing is lost when
  it goes: un-ticking the row in "Recently bought" does the same thing.
- **Recently bought** — one section under the stores, all stores together, most recently ticked
  off first. Collapsed to its heading ("Recently bought · 3") so a half-done trip doesn't push
  what you still need off the screen; one tap opens it, to look or to put something back. It
  starts open when there is nothing left to buy at all.
- Checked items are cleared automatically ~12 h after checking (nightly cleanup) — the list
  keeps "done" context during a shopping trip but stays clean day-to-day.
- Tap a row (not the circle) → edit in the same sheet as [3a]; delete lives there.

### 3.2 Add/edit item sheet [3a]

- Fields: **Item** (text, required, with the same suggestions as the quick field — see §3.1),
  **Quantity** (stepper, optional), **Unit** (pcs · g · kg · ml · L · pack — free pick, default
  pcs), **Store** (chips of the household's stores; the add-field's current store preselected).
- CTA: "Add to {store} list". Editing: "Save changes" + a delete row.

### 3.3 Empty state [7d]

- Basket illustration, "Nothing to buy yet", copy, **Add first item** button.

### 3.4 Manage stores [7g] (from Shopping via an overflow/settings affordance)

- Reorder by drag ("your list follows this order, so arrange it the way you walk through
  town"), rename inline, **Add a store**, delete (items fall back to Other). Any member may
  manage stores. Item counts shown per store.

### 3.5 Notifications

- Optional "Shopping list updates" push (default **off**): "🛒 {member} added {n} items to the
  list", coalesced (max one per member per ~15 min), never for your own adds.

---

## 4. Cooking tab

### 4.1 This week [04 main]

- Header "Cooking" + the month label of the week on screen, and a two-way switch under it:
  **This week · {n} / Next week · {n}**, where {n} is how many of the seven days have a dinner.
  The week shown lives in the URL (`?week=YYYY-MM-DD`, a Monday); anything else it names falls
  back to this week, and `/cooking` with no query is always this week (→ DECISIONS #99).
  Planning reaches one week ahead; further out is not plannable. 7-day strip Mon–Sun with dates;
  today highlighted in sage — next week has no today, so no highlight. The strip stays a visual
  anchor, not a control: the meal rows below are already one tap target per day.
  (The heading anchor `#41-this-week` is kept as-is — plan files link it.)
- **Meal card**: one row per day (MON…SUN): planned meal name + "{member} cooks" (today's row
  highlighted, "Tonight · {member}") or dashed "Add a meal" placeholder. Tap → plan sheet [3d]
  for that day; tap a planned meal → recipe view, long-press/••• → change/remove (v1: tapping a
  planned custom meal opens the plan sheet prefilled; a "Remove" action lives there).
- **Recipe library** section: "Recently added" 2-up cards (photo, name, "{time} min · added
  {date}"), header link "Browse all · {n}" → library page.

### 4.2 Plan a meal sheet [3d]

- Title "Plan a meal / {Weekday} · {date}".
- Search field over the household's recipes; recent recipes listed with radio selection.
- **"Cook something not saved"** → free-text title input instead of a recipe (custom meal).
- **Who's cooking?** — member chips, optional (none = no cook shown).
- Toggle: **Add ingredients to shopping list** (only when a recipe with ingredients is
  selected; default on) — on save, ingredients are added to the shopping list (each to the
  default store, deduplicated by case-insensitive name against unchecked items).
- CTA "Add to {weekday}". Replaces the day's existing meal if one exists (one dinner per day);
  when opened on a planned day it's prefilled and offers **Remove meal**.

### 4.3 Recipe library (Browse all)

- Grid of recipe cards (photo, name, time). Search by name.
- The FAB (and the empty state's **Add a recipe** button) open the **"Add a recipe" chooser**
  (→ plan 14, a bottom sheet): **From a link** and **Enter by hand** always, plus **From a photo**
  and **Paste text** (each "AI"-tagged) **only when AI import is set up** — with no key there's
  nothing to offer, and the AI import row in Settings (§6) is where it's turned on.
- Empty state [7e]: "Build your cookbook" + **Add a recipe** (opens the same chooser).

### 4.4 New/edit recipe [3c] (full-screen route, not a sheet)

- Top bar: Cancel · "New recipe"/"Edit recipe" · **Save**.
- Photo picker (optional; stored resized to ≤1200px WebP under `UPLOADS_DIR`).
- Fields: name (required), time (minutes), servings.
- **Ingredients**: one typed row each, written the way you'd write them on paper ("400 g pasta")
  and parsed leniently to (quantity, unit, name); unparsed input becomes name-only. Each row
  shows what the parse made of it as a quiet amount chip; tapping the chip opens a sheet with
  the name, the amount and the units of §3.2 plus tbsp · tsp and "no unit", which writes the row
  back as a line and shows the reading that line will get (→ DECISIONS #100–101). Reorder with
  the arrows (→ DECISIONS #67), remove per row.
- **Steps**: numbered textareas, add/remove/reorder.

### 4.5 Recipe view [7a]

- Hero photo (placeholder art when none), name, meta row (⏱ {time} min · 👥 Serves {n} ·
  Added by {member initial}).
- Actions: **Add to plan** (day picker → plan sheet flow), basket button + per-section
  "Add all to list" → adds ingredients to shopping (same dedupe as 4.2).
- Ingredients list (name + amount right-aligned), numbered steps.
- **Start cook mode** (dark button) → cook mode.
- ••• menu [7c]: Edit recipe, Duplicate, Share (v1: share plain-text recipe via Web Share API),
  Delete (confirm; meal-plan entries keep the name via snapshot).

### 4.6 Cook mode [7b, 7h] (dark, hands-free)

- Full-screen dark UI (`--cook-*` tokens), screen wake-lock while open.
- Header: recipe name, close ×. Segmented progress bar (one segment per step, done = sage).
- "STEP {i} OF {n}" in amber; the step text huge (Fraunces ~33px). Ingredient names that appear
  in the step text are underlined in amber; "This step uses {…}" line beneath lists them.
- **Timer chip** — shown when a duration is parsed from the step text ("8 min", "8:00",
  "8–10 minutes" → first value): "Start 8:00 timer". A manual "Set timer" affordance (minute
  stepper) is always available in the header/overflow.
- **Ingredients chip** → bottom peek sheet listing all ingredients; the current step's are
  highlighted in amber [7b].
- Running timer [7h]: big circular countdown (remaining, label "{ingredient/step} · {total}"),
  Pause / **+1:00** / Cancel. **Up to three at once** (→ DECISIONS #102): the step on screen
  keeps the ring, every other running timer shrinks to a compact bar above Prev/Next with its
  own × to stop it where it stands, and a bar belonging to another recipe links out rather than
  moving this screen's cursor. At three the Start chip and the header ⏲ stand down and say why
  — the app **refuses** a fourth rather than silently cancelling one you are still watching. A
  step that names no ingredient labels its timer "Step {i} timer", so three timers are never all
  called "Timer".
- **Running-timer dock**: once a timer is going, every screen that is _not_ cook mode carries a
  slim bar pinned above the tab bar — the soonest timer, "+n" for the rest, tapping straight
  back to the step it belongs to, turning terracotta with a dismiss when it rings
  (→ DECISIONS #103–104). One client machine drives both surfaces, so a visible app still beeps
  exactly once and a locked phone still gets exactly one push. Honest limit: a **paused** timer
  exists only in the tab that paused it and is lost on reload, because pause deletes the row
  (→ DECISIONS #15).
- Prev / **Next step** buttons pinned at the bottom. Last step → "Finish" closes cook mode.
- **Timer completion must fire even when the phone is locked** [7h·2]: the server schedules a
  push ("⏲️ {label} is done — back to step {i}") at `endsAt`; the open page also alerts
  locally (sound optional, vibration via `navigator.vibrate`). Cancelling/pausing the timer
  cancels the server push. Tapping the notification reopens cook mode at that step.

### 4.7 Recipe import from a link (→ plan 12, reuses the [3c] editor as its preview)

- **Entry points**: the **"Add a recipe" chooser** (§4.3) routes here with a focused `mode` —
  `link` (default), `photo`, or `text` — so each method is its own clean screen rather than one
  stacked page (→ plan 14). The **OS share sheet** also lands here: the PWA registers a share
  target (§8) so sharing a page from a browser opens link mode with the URL filled in and
  auto-fetched.
- Paste a recipe URL → **Fetch recipe**. The server reads the page's Schema.org `Recipe` JSON-LD
  (no AI, no dependency — nearly every recipe site embeds one for Google). `@graph` wrappers and
  `@type` arrays are handled; a malformed block never sinks the next; the first `Recipe` wins.
  Fields map to the editor: name, `totalTime` (else `prepTime`+`cookTime`) → minutes,
  `recipeYield` → servings, `recipeIngredient[]` → raw ingredient lines (the editor parses them
  to amount chips like every typed row), `recipeInstructions` → steps in order, `image` →
  photo.
- On success the ordinary **recipe editor [3c] opens prefilled**, the photo already downloaded
  and re-encoded to WebP like any upload (a missing or unfetchable photo is non-fatal — the draft
  just has none). The preview _is_ the editor, so every imperfect parse is a two-second fix.
  **Save** creates the recipe through the normal path and attaches the photo; nothing is stored
  before Save but the temp photo, and an abandoned import's photo is swept nightly.
- **Fetching is guarded** (the server fetches a user-supplied URL): `http(s)` only,
  loopback / private / link-local hosts refused _before any request_ and re-checked on every
  redirect hop, redirects capped (~5), ~10 s timeout, ~3 MB page cap, `text/html` only. Each
  failure has its own translated message — unreachable · blocked · not a page · too large · no
  recipe found. A page with no recipe offers manual entry, and — when AI import is set up — the
  AI fallback below.
- **AI fallback** (→ plan 13) — available only when the household has set a Google **Gemini** API
  key in Settings (§6); nothing reaches any model without one, and every path lands in the same
  [3c] editor with a quiet "AI-extracted — check before saving" note (**the AI never saves on its
  own**). Three ways in (photo and text are their own focused modes off the chooser §4.3; the
  first is an in-context escalation off a failed link fetch):
  - **A fetched page with no recipe data** — in link mode the dead end becomes a **Try AI
    extraction** button (plus quiet links to the photo/text modes). The tap is deliberate (a paid
    call is never silent): the URL is re-fetched under the same guards, stripped to readable text
    server-side, and read by the model. No key → a link to Settings instead.
  - **Pasted text** — the text mode: paste the recipe into a box, the answer for sites that block
    the server (Cloudflare 403), since the browser can still load them.
  - **Photos** — the photo mode: 1–3 photos of a cookbook/magazine page, validated and re-encoded
    to WebP (EXIF stripped) before they reach the model; the first is offered as the recipe photo.
  Ingredients come back as **raw lines** and parse to amount chips exactly like typed and
  link-imported ones. Recipe content keeps its **source language** (→ §9). Failures are their own
  messages — key refused (→ Settings) · service busy · nothing found — never a raw API error.
- Household content is never translated: imported names, ingredients and steps pass through
  verbatim (→ §9).

---

## 5. Tasks tab

### 5.1 List [05 main, 4a]

- Header "Tasks" + two per-member points tiles (avatar, name, "{pts} pts" this month).
- Segmented control: **To do · {n}** / **History**.
- To-do sections in order: **Overdue · {n}** (red dot header), **Today**, **Upcoming**, then
  undated one-offs. Rows: check circle, name, meta line, assignee avatar, `+{points}`.
  - Meta examples: "Every 2 weeks · due tomorrow", "Weekly · due today" (terracotta),
    "Monthly · 3 days overdue" (danger, red left border on card), "One-off · Sat",
    "One-off · added by Elisabeth" (undated).
  - Overdue cards add a footer: "It's {member}'s turn · reminded yesterday & this morning"
    (reflects reminder flags).
  - "Anyone" tasks show a neutral avatar (dashed circle).
- **Holiday banner** [4a]: "{member} is away until {date} — their tasks are paused, nothing
  counts as overdue" when any member has `awayUntil` ≥ today. Away members' tasks render
  dimmed/paused instead of overdue.
- FAB (+) → new task sheet. A short "Recent history" preview with explainer copy sits under the
  to-do list ("Completed tasks are logged here. Recurring ones reappear in To do on their next
  date.") linking to History.
- Tapping the check circle completes immediately (→ 5.4); tapping the row opens the detail
  sheet [4b].

### 5.2 New/edit task sheet [3b]

- Fields:
  - **Task** name (required).
  - **Assign to**: member chips + **Anyone**.
  - **Alternate each time** toggle (visible when a member is selected): "Lukas → Elisabeth →
    Lukas …" — rotates through members in join order after each done/skip.
  - **Repeat**: One-off · Every day · Every week · Every 2 weeks · Every month · custom
    interval (unit + count picker).
  - **First due** (date picker; "Today"/"Tomorrow" shortcuts). Optional for one-offs.
  - **Effort → points**: chips Small · 5, Medium · 10, Large · 20, Very large · 40.
- CTA "Create task" / "Save changes".

### 5.3 Task detail sheet [4b]

- Name, overdue pill ("3 days overdue · was due Jul 14") when overdue, meta row (repeat ·
  whose turn · points).
- Primary: **Mark as done · +{points}**.
- List: **Snooze / reschedule** → [4c] · **Reassign to {other member}** (swaps current
  assignee) · **Skip this time · no points** (advances recurrence + rotation, logs a skip) ·
  **Edit task** → [3b prefilled]. Below: **Delete task** (confirm; history keeps snapshots).

### 5.4 Completing [4d]

- Marks done: logs completion (+points to the completer — for "Anyone" tasks the completer,
  otherwise whoever tapped; assumed self), then for recurring tasks reschedules
  (`next due = completion day + interval`, rotation advances), for one-offs removes the task
  row (history remains).
- Celebration modal: "Nice work, {name}!", "{task} · logged to history", `+{points}` chip,
  "Next due {date} · Rescheduled · {next member}'s turn next" (recurring only), live standings
  line ("You're now leading 235 – 240"), **Undo** (reverts completion, restores due
  date/assignee/reminder flags).

### 5.5 Snooze & holiday [4c]

- Snooze presets: Tomorrow · In 3 days · In 1 week · In 2 weeks · Pick a date. CTA "Snooze to
  {date}" — sets `dueDate`, clears reminder flags (they re-fire for the new date).
- **Going away?** toggle in the same sheet: pauses **all my tasks** until a picked return date
  (`member.awayUntil`) — no overdue, no reminders; banner appears for the household. Turning it
  off clears the date. Also accessible from Settings.

### 5.6 Reminders [4e] (full lifecycle — "a quiet nudge, never a red-alert storm")

1. **Due nudge**: the morning a task is due (08:00 household-local): "☑️ {task} is due today —
   your turn" to the assignee (Anyone → all members). Once per occurrence (`dueReminderSentAt`).
2. **Overdue nudge**: the morning after it slipped (08:00 next day): "🛏️ {task} is overdue —
   it's your turn". Once per occurrence (`overdueReminderSentAt`).
3. After that it just waits, flagged on the list, the Home banner and the tab badge — no
   further pushes.

- Respect per-member toggles (task reminders / overdue nudges) and holiday pause.
- Delivery: Web Push; cron tick every minute with a ~6 h lookback window (survives redeploys;
  see [ARCHITECTURE.md](ARCHITECTURE.md#notifications)).

### 5.7 Empty state [7f]

- "No tasks yet" + copy, **Popular starters** one-tap templates (Take out the bins · Weekly ·
  5 pts; Change the bedsheets · Monthly · 10 pts; Clean the bathroom · Every 2 weeks · 20 pts;
  prefill assignee = Anyone, first due = today) and **Create a custom task**.

### 5.8 History & leaderboard [8a]

- **Podium card** "This month" + "resets {1st of next month}": columns per member sorted by
  month points (1st centered/tallest with gold crown + ring; supports 2–5 members; 2 members =
  two columns). Values = sum of `done` completion points in the current household-local month.
- **Completed feed** grouped by day (Today, Yesterday, {date}): check circle in member colour,
  task name, "{member} · {time}", `+{points}` chip. Infinite scroll / "load more" by month is
  fine; skips are not shown.

---

## 6. Settings [6a]

- Profile card: avatar, display name, email + **Edit**.
- **Account**: Display name, Your colour (palette picker; taken colours disabled), **Language**
  (→ §9). (No password row in v1 — Google only.)
- **Notifications**: Enable on this device (subscribes push, shows permission state) ·
  Task reminders · Overdue nudges · Shopping list updates (toggles per member) · Send test
  notification.
- **Away mode**: "Going away?" — same control as 5.5.
- **Household**: name (owner can rename), **AI recipe import** (owner sets/removes a Google
  Gemini API key for the §4.7 fallback and can **Test connection** — a live check that reports
  "Connection works" or why not; members see only whether it's on — the key is never shown, only
  a masked hint), Members · {n} → members screen.
- **Sign out** · **Leave household** (danger, confirm [6d]: "You'll lose access to the shared
  shopping list, tasks and meal plan. Your points stay with the household.").

## 7. Members [6b, 6c]

- List: avatar, name (+"(you)"), "Owner" badge / "Member · joined {date}". Owner sees ••• per
  member → sheet [6c]: **Make owner** ("They'll also be able to manage members" — transfers or
  adds? → single owner, transfers; → [DECISIONS.md #11](DECISIONS.md)) and **Remove from
  household** ("Loses access · points stay with the house").
- **Pending invite** row: active code + **Revoke** (owner only). **Invite housemate** →
  invite screen (same as [5d]; any member can invite, → [DECISIONS.md #10](DECISIONS.md)).
- Removing/leaving: memberships deleted; their completions keep name snapshots; their assigned
  tasks become **Anyone**; owner leaving requires transferring ownership first (or is blocked
  as last member — last member leaving deletes the household after confirm).

## 8. Cross-cutting rules

- **Scoping**: every query filters by the session member's `householdId`. No cross-household
  data access, ever — including recipe images.
- **Dates**: calendar dates (due, meals, away) are household-local `YYYY-MM-DD`; "today" is
  computed in `household.timezone`. Weeks start Monday. Date _formats_ follow the reader's
  language (→ §9), never the household's timezone: Vienna in English still reads "Jul 14".
- **Points month**: completions grouped by household-local calendar month; no reset job —
  always derived.
- **Freshness**: data refetches on tab focus/visibility and after every action (SvelteKit
  invalidation). Real-time sync (SSE) is a later milestone.
- **Empty states**: every list has one (designs: [7d] [7e] [7f]).
- **PWA**: installable (manifest + icons + service worker), portrait, `theme-color #F5F3EE`;
  push works with the app closed. Offline: app shell renders with an offline notice; no offline
  mutations in v1.

---

## 9. Language (English · German)

The app ships in **English** (the language the design and this spec are written in) and
**German**, the latter in its **Austrian** form — `de-AT`, matching the default household
timezone, so January reads "Jänner" (→ [DECISIONS #93](DECISIONS.md)). Every string a member reads comes from a catalog in `src/lib/i18n/messages/`;
`en.ts` is the schema and `de.ts` is typed against it, so the two can't drift
(→ [DECISIONS.md #93](DECISIONS.md)).

- **Which language a request gets**, in order: the member's own choice (`members.locale`) ·
  the `locale` cookie · the browser's `Accept-Language` · English. A member who has chosen
  nothing follows whatever device they are on.
- **Settings → Account → Language** offers **System · English · Deutsch**. "System" is the
  absence of a choice, not a third language: it clears the column and the cookie so each device
  follows itself again. The two language names are never translated. Choosing reloads the app —
  `<html lang>`, every server-rendered string and every date have to change together.
- **Household content is never translated.** Task names, recipes, store names, meal titles and
  display names are what the household typed. The three starter stores and the three "popular
  starters" are written in the language of whoever created them, and are theirs to rename.
- **Units are stored canonically and shown per language** — `tbsp` reads "tbsp" or "EL", `pcs`
  reads "pcs" or "Stk.". A recipe typed in either language parses to the same rows.
- **Notifications** go to a device, so they use the recipient's own language: their explicit
  choice, else the language the device was reading in when it subscribed.
