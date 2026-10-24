# 25 · Agent lane: evidence before the agent, runs you can check

**Status: todo.** Depends on: 18 (the build agent).

**Goal:** the agents fix what the reporter saw, not what they guess. Issue #31 showed the gap.
The report linked an einfachkochen.de recipe, but neither agent could open it. Their
`--allowedTools` lists have no `WebFetch` and no `curl`, and headless Claude Code refuses an
unlisted tool without asking anyone: the triage run logged 2 denials and the build run 9. Both
agents guessed at the page's shape. PR #32 fixed the guess, passed CI and merged. The real cause
was found by fetching the page: each `HowToStep.text` is an _array_ of comma-split fragments, and
`asString` kept the first (→ PR #33). Nothing in the lane could have caught this. This plan gives
the agents the evidence, and it makes every run's claims checkable afterwards.

Background and sources: the 2026-10-24 audit,
[Choreganized — Agentic Workflow Audit](https://claude.ai/artifact/MW3C3jvVVwjbwwv5irQUCz). This
plan covers its items 2–7; item 1 was #33.

## Build

- **An import probe**: `scripts/import-probe.ts`, run as `npm run import:probe -- <url> [--save <name>]`.
  - It calls `readRecipePage(url)` (`src/lib/server/recipe-import.ts:111`), the app's own fetch
    with the app's own guards, so the probe sees exactly what an import sees.
  - It prints which reader matched (JSON-LD, Microdata or none), then the steps and ingredients
    that reader produced, as plain text.
  - `--save` writes the raw HTML as a fixture next to the reader tests, where #33 put the
    einfachkochen page. A regression test can then load the reporter's real page.
  - It is the first **probe**: a command that reproduces what a report describes, run by an agent
    or by hand. The next probe goes to whichever area next reports a bug that one would have
    caught. A probe is never written speculatively.
- **An evidence step** in `triage.yml` and `build.yml`, before the action. It runs before Claude
  and never reaches the agent's tools:
  - `setup-node` + `npm ci`. Triage needs this for the first time.
  - The issue body is read with `gh issue view --json body`, **passed through an environment
    variable** and never interpolated into `run:` as `${{ github.event.issue.body }}`. That
    interpolation is the s1ngularity injection.
  - At most three `http(s)` URLs are extracted. Each is probed with `--save`, and the output goes
    to `evidence/` (git-ignored) with an `index.md` that lists URL → reader → file.
  - Both prompts are told: "`evidence/` holds what the linked pages actually contain. Read it
    before you form a hypothesis."
- **Permissions.**
  - **Triage** additionally gets `WebFetch`, for summaries of ordinary pages, and
    `Bash(npm run import:probe:*)`. The job stays `contents: read`.
  - **Build** moves to `--permission-mode auto`. A classifier then allows ordinary work, such as
    read-only HTTP, instead of a hand-kept list silently refusing it. The real boundary stays
    outside the prompt: the App token without `workflows`, branch protection, and the job's `if`.
    `--disallowedTools` keeps the hard nos: `WebFetch`, `WebSearch`, `Bash(gh api:*)`,
    `Bash(gh workflow:*)`, `Bash(gh pr merge --admin:*)`, `Bash(git push --force:*)`, and edits
    under `.github/`. `Bash(npm run import:probe:*)` is allowed explicitly.
- **Pinned models.** Triage runs `--model claude-sonnet-5-5`; it is fast and cheap, and the
  evidence does the heavy lifting. Build runs `--model claude-opus-5-5`, because it has the
  hardest job in the lane. Today neither job names a model, so the action's default decides, and
  a Claude Code update can change it unnoticed.
- **A run summary**: `scripts/agent-run-summary.ts`, run in an `if: always()` step after each
  action. It reads the action's execution file and writes `$GITHUB_STEP_SUMMARY`:
  - the model, turns, duration and cost;
  - **every denied tool call**, as the tool plus the first 80 characters of its input;
  - every Bash command run, de-duplicated, with the first 120 characters each;
  - whether `npm run verify` ran, and its exit code.

  It writes no message text and no raw transcript, because the repository is public. A PR that
  ticks "`npm run verify` clean" can now be checked against the run that opened it.

- **Honest checklist.** `/build-issue` ticks "`npm run verify` clean" only if its _last_ verify
  exited 0, and pastes that run's closing summary lines into the PR body.
- **Triage retitles.** The app files an issue under the first line of the report (#31: a cut-off
  German sentence). Triage sets a short title in the reporter's language, at most 70 characters,
  keeping the `Bug:` / `Idea:` prefix, with `gh issue edit --title`. This is safe: the app finds
  its issues by the `<!-- choreganized:… -->` marker in the body, never by title
  (`services/feedback.ts`).
- **Tests.**
  - `tests/conventions/ci.test.ts` changes on purpose. The build test that wants an explicit
    allow-list without `WebFetch` becomes "auto mode plus a deny list that names `WebFetch`,
    `WebSearch`, `gh api` and `gh workflow`, and auto-merge is still the one merge command".
  - New convention tests: both agent jobs pin a `--model`, both have the evidence step, and no
    `run:` step interpolates `github.event.issue.body` or `.title`.
  - Unit tests for the probe's pure parts (URL extraction, the report text) and for the summary
    script, run against a recorded execution-file fixture.
- **Docs**: TESTING.md "The flow" (the agent lane), a note in plan 18, and one DECISIONS entry
  (evidence before the agent; auto mode with a deny list for build; pinned models).

## Acceptance

- [ ] A test issue that links a recipe page gets a triage comment that quotes the probe's result
      (reader, step count, the reporter's step as imported). Its run summary shows no denied
      fetch.
- [ ] `npm run import:probe -- https://www.einfachkochen.de/rezepte/quiche-mit-lachs-genial-einfach-so-lecker`
      prints the JSON-LD reader and six whole steps (after #33).
- [ ] The run summary appears on both workflows and lists denials, commands, model and the
      verify exit code. It contains no message text.
- [ ] A small `agent:build` issue builds green under auto mode, and its summary shows no
      unexpected denials.
- [ ] Triage retitles a new issue. A second sync of the same report still finds that issue.
- [ ] `ci.test.ts` fails when a model pin, the evidence step or the deny list is removed, and when
      a `run:` step interpolates the issue body.
- [ ] `npm run verify` clean.
