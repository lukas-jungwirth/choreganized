---
description: Bring a folder of new raccoon art into the app — check and cut it, decide where each one goes, ask Lukas once, ship it to dev
argument-hint: '[folder, default design/new-raccoons]'
---

Bring the new raccoons in **`$1`** (no argument: `design/new-raccoons/`) into the app.

Lukas generates raccoon art, drops the PNGs in a folder and runs this. Everything mechanical is
`npm run raccoons` (checks, flat cut, masters, contact sheet) and `npm run icons` (the AVIFs the
app ships); your part is what needs eyes: naming each raccoon, deciding where it goes, and
making sure it looks right. **You decide, then show him and wait for his OK** before anything is
listed or shipped (→ DECISIONS #220). The house rules are in `CLAUDE.md`.

## What a raccoon can be

The list is `artwork/raccoon/mascots.json`; its order and fields are explained in
`artwork/raccoon/README.md`. A new raccoon is almost always an **everyday pose** on Home: it
sits on the first card when nothing else applies (no birthday, special day, chore on you or
bedtime), three slots a day take the season's poses in turn (→ SPEC §2, `lib/utils/raccoon.ts`).
For those, everything is data:

- `seasons` — one or more of `winter` (Dec–Feb), `spring` (Mar–May), `summer` (Jun–Aug),
  `autumn` (Sep–Nov); all four for an all-year pose. Go by what the raccoon is doing or wearing
  in Austria: a scarf is winter, a sun hat is summer, a book is any time.
- `lookAlike` — a group name shared with poses that look nearly the same (existing groups:
  `greeting`, `gardening`, `hot-drink`), so the rotation never shows them back to back. Make a
  new group only when two poses really read as the same picture.
- its **place in the list** — the rotation takes poses in list order, so put a new one where
  its neighbours in every season it's in are unlike it.

Anything else needs code, not just data, and is out of this command's reach — say so and stop
for that file: a raccoon for a **new special day** or rule (a new entry in `SPECIAL_DAYS` or a new
step in `homeRaccoon`), a raccoon for **another screen**, or a **replacement** for an existing
pose (only with Lukas's explicit say-so, then `--replace`).

## Steps

1. **Branch off `dev`** (`git switch dev && git pull && git switch -c feat/raccoons-<short-name>`).
   Nothing else in progress in the checkout? If there is, stop and say so.
2. **Look at every image** (Read each PNG). For each, decide:
   - a **name**: short, English, kebab-case, what the raccoon is doing (`painting`, `kite`,
     `phone`) — not taken in `mascots.json`;
   - **everyday or not** (above); for everyday, its **seasons** and **look-alikes** among the
     existing poses (`npm run icons` doesn't show you those — look at
     `artwork/raccoon/<name>.png` of any you suspect).
3. **Rename the files in the folder** to `<name>.png` (`mv`), then run
   `npm run raccoons -- <folder>`. If it refuses a file (painted background, art running off the
   canvas, too small, too round to cut), nothing was written: tell Lukas which file and why, in
   his words ("regenerate with a transparent background", "the ears are cut off"), and go on with
   the others only if he says so (move the refused file out first).
4. **Look at the contact sheet** (`<folder>/_sheet.png`): same style as the others, nothing
   important cut off by the flat cut (a cut through a prop is fine, through a face is not), the
   bottom sits straight on the card. Anything off → say so before the next step.
5. **Ask once** — AskUserQuestion, one question per raccoon (at most four per call; more →
   several calls), your pick first with "(Recommended)":
   "**painting**: all year, no look-alike?" with your pick and one or two realistic
   alternatives (other seasons). In the question text, add what the script reported (cut or
   already flat) and anything you noticed. Say "look-alike" only with what it means, in plain
   words — "never right after tennis, they strike the same pose" — never as a bare group name.
   Then **wait**. His answers are the spec.
6. **List them** in `mascots.json` with `"height": 408, "perched": true` plus `seasons` and
   `lookAlike`, each at the place you chose; then `npm run icons` (it validates the list) and
   `npm test`. If `icons` can't find a pose's body (both overall buttons hidden by a prop), look
   at the picture and add `"body"` — where the middle of the body is across its width, 0–1. The rotation test fails if two look-alikes or the same pose meet back to back
   anywhere in the year, naming the date — move entries and run again until it passes.
7. **Update the docs**:
   - SPEC §2, the everyday raccoon table — one row per new pose;
   - `artwork/raccoon/README.md` — a table row per file;
   - DECISIONS — one numbered entry for the batch: what came in, where each went and why,
     anything cut, the extra download size (sum of the new AVIFs in
     `src/lib/assets/mascot/`);
   - raise the version if it isn't already ahead of the last `v*` tag (feature → next minor;
     `CLAUDE.md`, step 1).
8. **Verify**: `npm run verify`; `npm run test:visual` (Home's baselines use a fixed clock with
   a chore on it, so they normally don't change — if one does, look at why before refreshing).
   Then look at one new pose on Home in the running app (`verify` in `.claude/launch.json`).
9. **Ship** (`CLAUDE.md`, step 4): commit (masters, AVIFs, `index.ts`, `everyday.ts`,
   `mascots.json`, docs), push, PR against `dev` with the table of new poses in the body,
   `gh pr merge --auto --merge`. Then delete the source folder — the masters are in
   `artwork/raccoon/` — and, after the merge, clean up the branch (`CLAUDE.md`, step 5).

Report back with the table (name · seasons · look-alike · cut), the PR link, and anything you
had to refuse or couldn't verify.
