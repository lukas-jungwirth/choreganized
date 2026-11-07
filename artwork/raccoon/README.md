# Raccoon masters

The original artwork for every raccoon the app shows and for its icons — and only the pieces the
app uses. Nothing here is shipped: `npm run icons` (`scripts/icons.ts`) turns these into
`static/icons/*.png` and `src/lib/assets/mascot/*.avif` (+ the generated `index.ts` with their
sizes, and `everyday.ts` with Home's everyday poses). Change a master, re-run, commit both
(→ DECISIONS #211, #215).

**New raccoons:** drop the PNGs in `design/new-raccoons/` (always there; git ignores what's in it)
and run `/raccoons` — it checks and cuts
them (`npm run raccoons`), proposes where each goes, asks, and ships them (→ DECISIONS #220).

## `mascots.json`

Every screen raccoon, one entry each, read by `npm run icons`:

- `name` — the file, `artwork/raccoon/<name>.png`, and the name in code (`<Mascot name=…>`);
- `height` — what to store it at: 3× the tallest it is shown (Home's 136px → 408);
- `perched` — it sits on a card's top edge, so it must be cut flat at the waist
  (`tests/conventions/mascot-perch.test.ts`);
- `seasons` — makes it an **everyday pose** on Home: `winter` (Dec–Feb), `spring` (Mar–May),
  `summer` (Jun–Aug), `autumn` (Sep–Nov), all four for all year;
- `body` — where the body is across the width, 0–1. Normally left out: `npm run icons` finds it
  between the two overall buttons, and Home places the raccoon by it. Give it by hand only for a
  pose whose buttons are hidden (the script says so);
- `lookAlike` — a group name for everyday poses that look nearly the same (`greeting`,
  `gardening`, `hot-drink`, `ball-sport`, `talking`, `snow-gear`): a member's day never draws two of a group;
- `days` / `slots` — keep an everyday pose to some weekdays (`mon`–`sun`) or some of Home's slots
  (`morning` 05–11, `afternoon` 11–17, `evening` 17–22); left out, it's every day and every
  slot. It's still drawn, just only then (coffee: `["morning"]`, laptop: Mon–Fri). The album
  works out its rarity from it (→ DECISIONS #237);
- `weight` — a whole number from 2: the pose's odds in the draw where it is allowed, against 1 for
  the rest, for a pose of one or two days a week that would otherwise take far longer to meet
  (friday: 3; → DECISIONS #243). The album's rarity ignores it.

The everyday poses' order doesn't matter to Home: each member draws three of the season's poses
a day, seeded by member and date (→ DECISIONS #232). `src/lib/utils/raccoon.test.ts` walks two
years and fails, naming the date, if a day's three repeat a pose or hold two look-alikes, and
checks that simulated members meet every pose of every season. The app icons aren't listed — they have their own steps in the script.

| File                      | Where it shows up                                              |
| ------------------------- | -------------------------------------------------------------- |
| `app-icon.png`            | launcher icon, apple-touch-icon — opaque, background #74A585   |
| `app-icon-foreground.png` | maskable icon, favicons, notification badge (transparent bust) |
| `shopping.png`            | Shopping title                                                 |
| `cooking.png`             | Cooking title                                                  |
| `tasks.png`               | Tasks + History titles                                         |
| `expenses.png`            | Expenses title                                                 |
| `head.png`                | login, join, invite link                                       |
| `welcome-a.png` / `-b`    | Home, everyday, all year                                       |
| `reminder-upcoming.png`   | Home, on the next-chore card while it's coming up              |
| `reminder-overdue.png`    | Home, on the next-chore card once it's overdue                 |
| `birthday.png`            | Home, on your birthday (set in your profile)                   |
| `christmas.png`           | Home, 24–25 December                                           |
| `new-year.png`            | Home, 31 December – 1 January                                  |
| `easter.png`              | Home, Easter Sunday and Monday                                 |
| `fasching.png`            | Home, Faschingsdienstag (47 days before Easter)                |
| `halloween.png`           | Home, 31 October                                               |
| `valentines.png`          | Home, 14 February                                              |
| `sleeping.png`            | Home, 22:00–05:00 on an ordinary day without a chore on you    |
| `midnight.png`            | Home, 00:00–02:00, one night in three, each member's own       |
| `beach.png`               | Home, everyday, summer                                         |
| `garden.png`              | Home, everyday, spring, summer (in a sun hat)                  |
| `fishing.png`             | Home, everyday, spring, summer, autumn                         |
| `snow.png`                | Home, everyday, winter                                         |
| `cold.png`                | Home, everyday, winter                                         |
| `tea.png`                 | Home, everyday, autumn, winter                                 |
| `reading.png`             | Home, everyday, all year                                       |
| `sports.png`              | Home, everyday, all year                                       |
| `skiing.png`              | Home, everyday, winter                                         |
| `tennis.png`              | Home, everyday, spring, summer, autumn                         |
| `painting.png`            | Home, everyday, all year                                       |
| `phone.png`               | Home, everyday, all year                                       |
| `call.png`                | Home, everyday, all year                                       |
| `music.png`               | Home, everyday, all year                                       |
| `singing.png`             | Home, everyday, all year                                       |
| `arcade.png`              | Home, everyday, all year                                       |
| `writing.png`             | Home, everyday, all year                                       |
| `camera.png`              | Home, everyday, all year                                       |
| `cards.png`               | Home, everyday, all year                                       |
| `watering.png`            | Home, everyday, all year                                       |
| `flower.png`              | Home, everyday, spring, summer                                 |
| `water-pistol.png`        | Home, everyday, summer                                         |
| `knitting.png`            | Home, everyday, autumn, winter                                 |
| `snowman.png`             | Home, everyday, winter                                         |
| `snowflake.png`           | Home, everyday, winter                                         |
| `coffee.png`              | Home, everyday, all year, mornings only                        |
| `laptop.png`              | Home, everyday, all year, Mon–Fri only                         |
| `fruit.png`               | Home, everyday, all year                                       |
| `juggling.png`            | Home, everyday, all year                                       |
| `bath.png`                | Home, everyday, all year                                       |
| `mushrooms.png`           | Home, everyday, autumn                                         |
| `friday.png`              | Home, everyday, all year, Fridays only, 3× odds                |
| `snooze.png`              | Home, everyday, all year, mornings only                        |
| `socks.png`               | Home, everyday, all year                                       |
| `skates.png`              | Home, everyday, winter                                         |
| `sweets.png`              | Home, everyday, all year                                       |
| `trash.png`               | Home, everyday, all year                                       |
| `butterfly.png`           | Home, everyday, spring, summer                                 |
| `lemonade.png`            | Home, everyday, summer                                         |
| `settings.png`            | Settings, on the profile card                                  |
| `move-out.png`            | Settings, on the sign-out / leave group                        |

**Home's raccoons look left or straight out**, toward the greeting and the card: they sit at the
right edge, and one looking right looks off the screen. A master that looked right was mirrored
in place, not flagged (→ DECISIONS #234); the original is in git history.

The two app icon masters are a 1024² **bust** (head and shoulders ending in a flat cut): the
opaque one on exactly #74A585, the other the same art on transparent. Where the art sits on the
canvas doesn't matter: `npm run icons` trims it and stands the cut on each icon's bottom edge;
the favicons and the badge take the top 72% (the head) only (→ DECISIONS #235).

Masters are trimmed to the artwork (the app icons keep their 1024² canvas) and losslessly
recompressed. A raccoon that sits on a card (Home's poses, Settings') must end in a straight cut
at the waist: `npm run raccoons` cuts a new one flat where the curve starts, and
`tests/conventions/mascot-perch.test.ts` fails on any that isn't (→ DECISIONS #218). Poses the
app doesn't use don't live in the repo.
