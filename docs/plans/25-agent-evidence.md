# 25 · Agent lane: no silent refusals, runs you can check

**Status: in progress — built 2026-10-25; the four live-run boxes wait for the `dev → main`
promotion** (workflows for `issues` events run from `main`). Depends on: 18 (the build agent).

**Goal:** the agents fix what the reporter saw, not what they guess, and every run's claims can be
checked afterwards. Issue #31 showed the gap. The report linked an einfachkochen.de recipe, but
neither agent could open it. Their `--allowedTools` lists have no `WebFetch` and no `curl`, and
headless Claude Code refuses an unlisted tool without asking anyone: the triage run logged 2
denials and the build run 9. Both agents guessed at the page's shape. PR #32 fixed the guess,
passed CI and merged. The real cause was found by fetching the page: each `HowToStep.text` is an
_array_ of comma-split fragments, and `asString` kept the first (→ PR #33). Nothing in the run
showed any of this.

Most of this plan applies to **every** issue: fewer silent refusals, pinned models, and a receipt
for each run. One small part is for reports that link a page, which today means recipe import.

Background and sources: the 2026-10-24 audit,
[Choreganized — Agentic Workflow Audit](https://claude.ai/artifact/MW3C3jvVVwjbwwv5irQUCz). This
plan covers its items 2–7; item 1 was #33.

## Build — for every issue

- **Permissions that don't fail silently.**
  - **Build** moves to `--permission-mode auto`. A classifier then allows ordinary work, such as
    read-only HTTP, instead of a hand-kept list silently refusing it. The real boundary stays
    outside the prompt: the App token without `workflows`, branch protection, and the job's `if`.
    `--disallowedTools` keeps the hard nos: `WebFetch`, `WebSearch`, `Bash(gh api:*)`,
    `Bash(gh workflow:*)`, `Bash(gh pr merge --admin:*)`, `Bash(git push --force:*)`, and edits
    under `.github/`.
  - **Triage** additionally gets `WebFetch`, so it can read any page an issue links to. The job
    stays `contents: read`.
- **Pinned models.** Triage runs `--model claude-sonnet-5-5`, because it is fast and cheap. Build
  runs `--model claude-opus-5-5`, because it has the hardest job in the lane. Today neither job
  names a model, so the action's default decides, and a Claude Code update can change it
  unnoticed.
- **A receipt for every run**: `scripts/agent-run-summary.ts`, run in an `if: always()` step after
  each action. It reads the action's execution file and writes `$GITHUB_STEP_SUMMARY`:
  - the model, turns, duration and cost;
  - **every denied tool call**, as the tool plus the first 80 characters of its input;
  - every Bash command run, de-duplicated, with the first 120 characters each;
  - whether `npm run verify` ran, and its exit code.

  It writes no message text and no raw transcript, because the repository is public. A PR that
  ticks "`npm run verify` clean" can now be checked against the run that opened it.

- **Honest checklist.** `/build-issue` ticks "`npm run verify` clean" only if its _last_ verify
  exited 0, and pastes that run's closing summary lines into the PR body.
- **Readable titles.** The app files an issue under the first line of the report (#31: a cut-off
  German sentence). Triage sets a short title in the reporter's language, at most 70 characters,
  keeping the `Bug:` / `Idea:` prefix, with `gh issue edit --title`. This is safe: the app finds
  its issues by the `<!-- choreganized:… -->` marker in the body, never by title
  (`services/feedback.ts`).

## Build — for reports that link a page

Kept small on purpose. Recipe import is the one area whose bugs live in someone else's page, and
`WebFetch` is not enough there: it hands the model a summary, and the summary drops the raw
JSON-LD the importer reads.

- **One import probe**: `scripts/import-probe.ts`, run as `npm run import:probe -- <url> [--save <name>]`.
  - It calls `readRecipePage(url)` (`src/lib/server/recipe-import.ts:111`), the app's own fetch
    with the app's own guards, so the probe sees exactly what an import sees.
  - It prints which reader matched (JSON-LD, Microdata or none), then the steps and ingredients it
    produced, and `--save` writes the raw HTML as a fixture next to the reader tests (where #33
    put the einfachkochen page).
  - Both agents may run it: `Bash(npm run import:probe:*)`.
  - **No other probes now.** Another area gets one only when a real bug shows it was needed.
- **The issue body is never interpolated into `run:`.** A workflow step that reads the issue
  passes it through an environment variable, never as `${{ github.event.issue.body }}`. That
  interpolation is the s1ngularity injection. This applies to any step this plan adds.

## Tests and docs

- `tests/conventions/ci.test.ts` changes on purpose. The build test that wants an explicit
  allow-list without `WebFetch` becomes "auto mode plus a deny list that names `WebFetch`,
  `WebSearch`, `gh api` and `gh workflow`, and auto-merge is still the one merge command".
- New convention tests: both agent jobs pin a `--model` and run the summary step, and no `run:`
  step interpolates `github.event.issue.body` or `.title`.
- Unit tests for the summary script, against a recorded execution-file fixture, and for the
  probe's report text.
- Docs: TESTING.md "The flow" (the agent lane), a note in plan 18, and one DECISIONS entry (auto
  mode with a deny list for build; pinned models; the run summary).

## Acceptance

- [ ] The run summary appears on both workflows and lists denials, commands, model and the verify
      exit code. It contains no message text. _Proven offline against two real recordings (below);
      the first live run of each workflow is the box._
- [ ] A small `agent:build` issue builds green under auto mode, and its summary shows no
      unexpected denials. _Live only._
- [ ] Triage reads a page an issue links to, and its summary shows no denied fetch. _Live only._
- [ ] Triage retitles a new issue. A second sync of the same report still finds that issue. _The
      second half is pinned by `src/lib/server/github.test.ts` (the retry searches `in:body`); the
      retitle is live only._
- [x] `npm run import:probe -- https://www.einfachkochen.de/rezepte/quiche-mit-lachs-genial-einfach-so-lecker`
      prints the JSON-LD reader and six whole steps.
- [x] `ci.test.ts` fails when a model pin, the summary step or the deny list is removed, and when
      a `run:` step interpolates the issue body.
- [x] `npm run verify` clean.

## What was built, and where it differs from the plan

- `scripts/agent-run-summary.ts` (+ test, + `scripts/fixtures/agent-run.json`), the `Run summary`
  step in both workflows, `id: claude` on both actions. Tests for `scripts/` now run in Vitest
  (`scripts/**/*.test.ts`, TESTING.md "The layers").
- Denials come from **three** places, not one: the result's `permission_denials`, the
  `permission_denied` system message, and — found while verifying — a path rule's refusal
  (`Write(.github/**)`), which Claude Code reports only as an error tool result. Without the third,
  the summary would have missed exactly the refusal this plan is about.
- A verify run whose exit code another command decides (`| tail` without `pipefail`, `|| true`,
  `;`, a second line) is listed but never called clean. `/build-issue` runs
  `set -o pipefail && npm run verify 2>&1 | tail -60` so its code is verify's own.
- The deny list uses mid-pattern wildcards where the plan wrote prefixes:
  `Bash(gh pr merge *--admin*)`, `Bash(git push *--force*)`, `Bash(git push -f*)`,
  `Bash(git push * -f*)` — a prefix rule misses `gh pr merge 5 --admin`.
- **Triage's checkout sets `persist-credentials: false`** — not in the plan. Once triage may
  `WebFetch` a URL an untrusted issue names, a job token in `.git/config` is one `Read` away from
  being sent there. Triage never pushes, so it needs none.
- `readRecipePage` is split into `fetchRecipePage` + `readFetchedPage`, and `RecipePage` gains
  `reader`, so the probe keeps the raw HTML for `--save` and still reads it the import's way. The
  probe loads the importer through a middleware-mode Vite server, because it imports `$lib` and
  `$env`.
- `--save` never overwrites a fixture, and takes only a kebab-case name.

## What was verified (session 2026-10-25)

- **The execution file's shape**, from the action's source (`base-action/src/run-claude-sdk.ts`,
  `execution-file.ts`): a JSON array of Agent SDK messages, written to
  `$RUNNER_TEMP/claude-execution-output.json`, cut after the result message; `execution_file` is
  set only when the file exists, so the script falls back to that path.
- **A real recording as the fixture**: `claude -p --output-format stream-json` (the same SDK
  messages) in a throwaway package whose `verify` failed once, with `WebFetch` unlisted. The
  summary read model, 7 turns, cost, the denied fetch, three distinct commands and verify codes
  1 → 0 → 0, and no prose: the test checks every text, thinking and tool-output line of the
  fixture against the rendered summary.
- **Auto mode and the deny list, headless** (Sonnet 5.5, `--permission-mode auto`, `echo`
  stand-ins in a scratch directory): `echo merge --admin now` and `echo push -f origin x` were
  denied, `echo push -u origin agent/issue-12-fix` and `echo merge now` ran, `.github/x.txt` was
  refused and `notes.txt` written, and `WebFetch` was not offered at all. The summary listed all
  three refusals.
- **The probe, live**: the einfachkochen URL printed `Reader: JSON-LD` and six whole steps (step 4
  ends "…einen Rand formen."); `http://127.0.0.1/x` printed `Refused: blocked`; a gutekueche.at
  link showed its redirect; `--save` wrote a fixture with the doctype first, then refused to
  overwrite it (the test file was deleted afterwards).
- **The convention tests bite**: each of these mutations to the real workflows failed
  `ci.test.ts` — deleting triage's `--model`, renaming build's summary step, `if: success()` on
  the summary, deleting `--disallowedTools`, dropping `WebFetch` from it, deleting
  `--permission-mode auto`, and `run: echo "${{ github.event.issue.body }}"` (two failures: the
  workflow scan and the summary step).
- **Not verified**: anything that needs the workflows to run on GitHub — they run from `main`,
  and promoting `dev → main` is Lukas's call. Whether auto mode's classifier lets
  `gh pr merge --auto` and `npm run test:visual` (Docker) through is exactly what the first
  build run's summary will show.
