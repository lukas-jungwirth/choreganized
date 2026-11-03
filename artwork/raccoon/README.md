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
  `gardening`, `hot-drink`, `ball-sport`, `talking`): the rotation never shows two of a group back to back.

The everyday poses' **order is the rotation's**: each slot of the day takes the next one that's
in season, wrapping round at the end, so neighbours should differ in every season they share.
`src/lib/utils/raccoon.test.ts` walks two years and fails, naming the date, if two look-alikes or
the same pose ever meet. The app icons aren't listed — they have their own steps in the script.

| File                      | Where it shows up                                              |
| ------------------------- | -------------------------------------------------------------- |
| `app-icon.png`            | launcher icon, apple-touch-icon — opaque, background #74A585   |
| `app-icon-foreground.png` | maskable icon, favicons, notification badge (transparent head) |
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
| `halloween.png`           | Home, 31 October                                               |
| `valentines.png`          | Home, 14 February                                              |
| `sleeping.png`            | Home, 22:00–05:00 on an ordinary day without a chore on you    |
| `beach.png`               | Home, everyday, summer                                         |
| `summer-garden.png`       | Home, everyday, summer                                         |
| `garden.png`              | Home, everyday, spring, summer, autumn                         |
| `fishing.png`             | Home, everyday, spring, summer, autumn                         |
| `snow.png`                | Home, everyday, winter                                         |
| `cold.png`                | Home, everyday, winter                                         |
| `tea.png`                 | Home, everyday, autumn, winter                                 |
| `reading.png`             | Home, everyday, all year                                       |
| `sports.png`              | Home, everyday, all year                                       |
| `skiing.png`              | Home, everyday, winter                                         |
| `tennis.png`              | Home, everyday, spring, summer, autumn                         |
| `handball.png`            | Home, everyday, autumn, winter, spring                         |
| `painting.png`            | Home, everyday, all year                                       |
| `phone.png`               | Home, everyday, all year                                       |
| `call.png`                | Home, everyday, all year                                       |
| `music.png`               | Home, everyday, all year                                       |
| `singing.png`             | Home, everyday, all year                                       |
| `arcade.png`              | Home, everyday, all year                                       |
| `writing.png`             | Home, everyday, all year                                       |
| `settings.png`            | Settings, on the profile card                                  |
| `move-out.png`            | Settings, on the sign-out / leave group                        |

Masters are trimmed to the artwork (the app icons keep their 1024² canvas) and losslessly
recompressed. A raccoon that sits on a card (Home's poses, Settings') must end in a straight cut
at the waist: `npm run raccoons` cuts a new one flat where the curve starts, and
`tests/conventions/mascot-perch.test.ts` fails on any that isn't (→ DECISIONS #218). Poses the
app doesn't use don't live in the repo.
