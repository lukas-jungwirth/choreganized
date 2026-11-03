# 35 · The raccoon album: collect every raccoon Home shows you

**Status: done.** Depends on: 02 (Home), 10 (Settings), and Home's raccoon (DECISIONS #216,
#219, #220).
SPEC: §2 (the raccoon), §6 (Settings) — both gain a paragraph when this is built. Decisions:
#229, #230 (`HOME_RACCOONS`).
Design: no frame in `design/Hearth.dc.html` (→ `size:l`). The sketch Lukas approved on
2026-11-03 is `design/sketches/raccoon-album.html` — open it from the repo so the art loads.
Build to it, then copy its season colours into `app.css` as tokens.

**Goal:** Home's raccoon changes with the season, the time of day and the date. The album makes
that a game: every raccoon you have actually seen on Home is yours to keep, in a grid under
Settings, and each one opens a little trading card with its name, a fun fact and some stats.
The rest stay silhouettes until you meet them. The challenge is to see all of them.

## What counts

**Exactly the raccoons Home can show**, which is every value `homeRaccoon()` in
`lib/utils/raccoon.ts` can return. Nothing else: the tab-title poses (shopping, cooking, tasks,
expenses), the sign-in head, Settings' wrench raccoon, the leaving raccoon and the app icons
are not collectable. Lukas's call: the Home art is the good art.

Today that is **39**:

- the 30 everyday poses (SPEC §2's table);
- the 6 special days: birthday, Christmas, New Year, Easter, Halloween, Valentine's;
- sleeping (22:00–05:00);
- the two reminder poses (bell, alarm clock).

**The list already exists:** `HOME_RACCOONS` in `lib/utils/raccoon.ts` (PR #107, DECISIONS
#230), with `isHomeRaccoon()`. It is derived from the same sources `homeRaccoon()` reads, and its
test walks every hour of two years to check the two agree. The admin picker uses it too. The
album builds on it: no second list, no folder split (the art stays in one folder). A new
everyday pose from `/raccoons` joins the album by itself; only its `album` number, `stats` and
catalog copy are new.

## Rarity: three steps, worked out, never typed in

| Stars | Name         | Which raccoons                                              | Card frame                                    |
| ----- | ------------ | ----------------------------------------------------------- | --------------------------------------------- |
| ★     | All year     | everyday poses in all four seasons, sleeping, the reminders | sage                                          |
| ★★    | Seasonal     | everyday poses in one to three seasons                      | the season's colour; several blend first→last |
| ★★★   | Special days | the holidays and your birthday                              | holo foil                                     |

No "legendary" (Lukas dropped it). The tier comes from the pose itself (its `seasons`, or being
a special day), so new art needs no extra field.

## Build

### Data

- **`raccoon_sightings`** (new table, `npm run db:generate`): `memberId` (FK, cascade on
  delete), `householdId` (for scoping, like every table), `raccoon` (the mascot name),
  `firstSeenOn` (household-local `YYYY-MM-DD`), `seenCount`, `lastSlot` (`YYYY-MM-DD#0|1|2`;
  night is its own slot, `#n`). Unique on `(memberId, raccoon)`.
- **Per member, not per household.** Everyone fills their own album; a housemate's birthday
  raccoon is theirs. Leaving the household deletes the album with the membership.
- **`seenCount` counts slots, not page loads.** A sighting in the slot already recorded in
  `lastSlot` changes nothing, so reloading Home all evening is one sighting.
- DATA-MODEL.md gets the table's notes.

### Recording a sighting

- `lib/server/services/raccoons.ts`: `recordSighting(householdId, memberId, raccoon, today,
slot)` upserts in one transaction and returns `{ isNew, found, total }`. `listAlbum(householdId,
memberId)` returns the sightings.
- `(app)/home/+page.server.ts` calls it after it has worked out the pose. **Not** when the pose
  came from admin mode's `?raccoon=` (plan 34): the picker must not unlock anything.
- A write in a `load` is a deliberate exception (the pose is decided on the server, and a second
  round trip from the browser would be a request the Home screen can lose). Log it in DECISIONS.

### The album: `(app)/settings/raccoons`

- Entry: a row in Settings right under the profile card, "Raccoon album" with "17 of 39" on the
  right. Guarded with `requireMember` like every Settings page.
- `SubHeader` "Raccoon album", subtitle "Every raccoon you've met on Home."
- **Progress card**: a ring and "17 of 39 found", a line "5 seasonal · 4 special days still to
  find" (counts of missing ★★ and ★★★), and a `ProgressBar` in **plain sage, no gradient**.
- **Filters** (`Chip`s, scrolling sideways at 390px): All · ★ All year · ★★ Seasonal ·
  ★★★ Special days · Missing. The tier chips pick one; Missing works on top of any of them.
- **Grid**, four columns, tiles 3:4: the raccoon on its frame colour with its number under it
  (`009`). A raccoon met since you last opened the album has a "New" badge. An unmet one is
  its silhouette (the same AVIF, `filter: brightness(0)` at low opacity) with a "?"; **no
  hints**, no stars.
- **Order and numbers**: `album` in `mascots.json`, one number each, contiguous from 1. A new
  raccoon takes the next free number, so numbers never move once shipped. Suggested first
  order: ★ first, then ★★ by when their season starts (winter → autumn), then ★★★ in calendar
  order.

### The card (a `BottomSheet` or a centred modal, the builder's call; it lands in DECISIONS)

- **Header**: the number top left ("No. 009"), the stars top right (filled and faint, ★★☆). The
  header says nothing else.
- **Art**: the raccoon on a soft stage in its frame colour.
- **Name** in Fraunces, a short **title** under it ("The snowman builder").
- **One chip: when you can meet it.** `All year` · the months for a seasonal one
  (`❄ Dec – Feb`, `Sep – May`) · the date for a special day (`24–25 Dec`, `31 Oct`), `Easter`
  (it moves), `Your birthday`. Built from `seasons` and the special-day list, month names from
  `m.date.*`.
- **Fun fact**, one or two sentences, in quotes.
- **Stats**: four fun scales, 1–5 dots each, fixed per raccoon: Cosiness, Mischief, Snack drive,
  Helpfulness (names in the catalog, values in `mascots.json` as `stats`).
- **Footer**: "First met 2 Dec" and "Seen 7×" (live, from the sighting).
- **Swipe** or prev/next to the neighbouring card, in album order, skipping nothing (an unmet
  neighbour shows as the locked card).
- **Locked card**: same frame shape in `--sunken-2`, the silhouette with one big "?", the name as
  "? ? ? ? ?", "Not met yet". No stars, no window, no stats.

### Frame colours (new tokens in `app.css`, one `light-dark()` line each)

The season decides the hue; the theme only decides the shade. The card's inside is `--card`.

| Token                       | Light                               | Dark           | Ink on it (light / dark) |
| --------------------------- | ----------------------------------- | -------------- | ------------------------ |
| `--season-any` (all year)   | `#E6EFE8`                           | `#1E2A22`      | `#3E5D49` / `#A9CFB6`    |
| `--season-winter` (ice)     | `#DDE7EF`                           | `#1D252C`      | `#4D6A82` / `#A8C3D8`    |
| `--season-spring` (blossom) | `#F5E2E6`                           | `#2D1F23`      | `#94506A` / `#E8B3C4`    |
| `--season-summer` (sand)    | `#F6EAD0`                           | `#2A2417`      | `#8A6A24` / `#E6C983`    |
| `--season-autumn` (rust)    | `#F3DFD2`                           | `#2E2018`      | `#8F4A26` / `#E9AC85`    |
| `--holo-1…5` (special days) | peach → butter → mint → sky → lilac | the same, deep | `#6B5A3A` / `#E6D3A8`    |

- Several seasons: a gradient from the first season's colour to the last, in season order
  (tea: autumn → winter; handball: autumn → winter → spring).
- Spring is pink, not green, so it can't be mistaken for all year.
- DESIGN-SYSTEM.md gets the tokens in its table.

### The moment on Home

When `recordSighting` returns `isNew`, Home shows a toast in the `ui/UndoToast` style:
the raccoon's thumbnail, "New raccoon!", "Frosty Fritz is in your album · 18 of 39", and
**View**, which opens the album at that card (`/settings/raccoons?card=<name>`). It goes by
itself after a few seconds; it appears once, because the second visit in the slot is no longer
new.

### Copy

- `en.ts` / `de.ts`: `album.*` for the screen, the filters, the chips, the toast, stat names;
  `raccoons.<name>.{ name, title, fact }` for all 39, typed by `HOME_RACCOONS` so a missing
  one is a `check` failure. German may be Austrian and punny; household content rules don't
  apply, these are the app's words. No em dashes (DECISIONS #205).
- The builder writes the 39 names, titles, facts and stats in both languages and **ships them as
  drafts**: don't wait for Lukas, he reviews them later. List them all in the PR description so
  the review is one read, and add a "raccoon copy reviewed" follow-up to the handoff.

## Acceptance

- [ ] A fresh member opens Home: a toast says a new raccoon is in the album; **View** opens its
      card. Reloading Home in the same slot shows no toast and leaves "Seen 1×".
- [ ] The next slot's raccoon (fake the clock in the e2e server) unlocks a second one; the album
      says "2 of 39".
- [ ] Settings shows "Raccoon album" under the profile card with the count.
- [ ] The album grid shows met raccoons in colour with their number and unmet ones as a
      silhouette and "?", with no hint.
- [ ] Each filter shows the right raccoons; Missing combines with a tier.
- [ ] A met card shows number, stars, name, title, the window chip, the fact, four stats, first
      met and times seen. A locked card shows only the number, the silhouette and "?".
- [ ] Frames: sage for all year, a season's colour for one season, a blend for several, holo
      for a special day — in light and in dark.
- [ ] A housemate's album is their own: your sightings never show in theirs.
- [ ] Admin mode's raccoon picker unlocks nothing.
- [ ] At 200% text size the card and the grid still read (`text-size.spec.ts`).

## Tests

- Unit: `lib/utils/raccoon-album.test.ts` — tier from seasons, the window chip for every kind,
  the season blend's order, numbering.
- Convention: `tests/conventions/raccoon-album.test.ts` — the album lists exactly
  `HOME_RACCOONS` (whose own test already ties it to `homeRaccoon()`); `album` numbers are
  unique and contiguous; every album raccoon has `stats` with four values 1–5.
- Integration: `tests/integration/raccoon-sightings.test.ts` — first sighting is new, the same
  slot doesn't count twice, the next slot does, scoping by household and member, cascade on
  leaving.
- E2E: `tests/e2e/raccoon-album.spec.ts` — Home toast → View → card; the album count.
- Visual: `raccoon-album`, `raccoon-album-dark`, `raccoon-card`, `raccoon-card-locked`, and a
  `home-new-raccoon` toast shot.

## Settled: the reminder raccoon stays first

Home shows the reminder raccoon whenever a chore is on you, ahead of every everyday pose
(SPEC §2, rule 3), which in a busy household can hide the everyday raccoons for days. Lukas
kept it that way (2026-11-03): Home's order doesn't change for the album, and a ★ card that
takes a while to find is part of the challenge. Don't change `homeRaccoon()` in this plan.
