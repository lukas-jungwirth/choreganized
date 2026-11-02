# Raccoon masters

The original artwork for every raccoon the app shows and for its icons — and only the pieces the
app uses. Nothing here is shipped: `npm run icons` (`scripts/icons.ts`) turns these into
`static/icons/*.png` and `src/lib/assets/mascot/*.avif` (+ the generated `index.ts` with their
sizes). Change a master, re-run, commit both (→ DECISIONS #211, #215).

| File                      | Where it shows up                                              |
| ------------------------- | -------------------------------------------------------------- |
| `app-icon.png`            | launcher icon, apple-touch-icon — opaque, background #74A585   |
| `app-icon-foreground.png` | maskable icon, favicons, notification badge (transparent head) |
| `shopping.png`            | Shopping title                                                 |
| `cooking.png`             | Cooking title                                                  |
| `tasks.png`               | Tasks + History titles                                         |
| `expenses.png`            | Expenses title                                                 |
| `head.png`                | login, join, invite link                                       |
| `welcome-a.png` / `-b`    | Home greeting, A on even days, B on odd (→ `utils/raccoon`)    |
| `reminder-upcoming.png`   | Home, on the next-chore card while it's coming up              |
| `reminder-overdue.png`    | Home, on the next-chore card once it's overdue                 |
| `birthday.png`            | Home, on your birthday (set in your profile)                   |
| `christmas.png`           | Home, 24–25 December                                           |
| `new-year.png`            | Home, 31 December – 1 January                                  |
| `easter.png`              | Home, Easter Sunday and Monday                                 |
| `halloween.png`           | Home, 31 October                                               |
| `valentines.png`          | Home, 14 February                                              |
| `sleeping.png`            | Home, 22:00–05:00 on an ordinary day without a chore on you    |
| `settings.png`            | Settings, on the profile card                                  |
| `move-out.png`            | Settings, on the sign-out / leave group                        |

Masters are trimmed to the artwork (the app icons keep their 1024² canvas) and losslessly
recompressed. Poses the app doesn't use don't live in the repo.
