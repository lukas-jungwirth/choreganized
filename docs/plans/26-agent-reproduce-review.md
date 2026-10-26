# 26 · Agent lane: reproduce first, review second

**Status: done (2026-10-26) — built and replayed on #31; the live-run boxes wait for the release
PR** (workflows for `issues` events run from `main`). Depends on: 25.

**Goal:** a fix proves it fixes _the report_, and the lane's rules live in YAML, not in a
prompt. Issue #31 passed every gate with the wrong fix. Its test "failed without the change", but
the test encoded the agent's guess, not what the reporter saw. Triage's open question ("JSON-LD or
Microdata, and what do its steps look like?") was the key to the bug, and nothing required an
answer. `fixed-on-dev` went on the issue when the PR _opened_. The research behind this plan
points the same way: reproduction tests written from the issue raise fix rates, a fresh-context
reviewer catches what the writer can't, and a chain of planning agents does not help. See the
audit, "One agent or several?":
[Choreganized — Agentic Workflow Audit](https://claude.ai/artifact/MW3C3jvVVwjbwwv5irQUCz).

## Build

- **Triage reproduces when it can.** With `WebFetch` and the import probe (plan 25), triage states one of
  **reproduced** (a probe shows the reported symptom on `dev`), **found the cause**, **plausible
  cause** or **cannot tell**. "Found" from reading code alone is no longer enough for an automatic
  hand-off.
- **Structured triage, labels by the workflow.** This is the "agent decides, workflow acts"
  pattern.
  - The action runs with `--json-schema`, and its verdict comes back as `structured_output`:
    `kind` (bug · idea · duplicate), `area`, `size`, `confidence`, `reproduced`,
    `open_questions[]`, `fixed_on_dev_commit`, `title`.
  - The agent still posts its one comment. It loses `Bash(gh issue edit:*)`.
  - A second job, **`apply`** (`needs: triage`, no Claude, `issues: write` + `actions: write`),
    sets the labels and the title from the verdict.
  - It starts a build with `gh workflow run build.yml -f issue=N` **only if** `kind == bug`,
    `size == s`, `reproduced`, `confidence == found` and `open_questions` is empty. A label added
    with `GITHUB_TOKEN` would not start a workflow, but a dispatch does.
  - That condition replaces the build job's "a bot may start only `bug` + `size:s`" rule as the
    guard on the automatic path. A person adding `agent:build` works as today.
- **`/build-issue` reproduces before it fixes.**
  - The first commit is **"Reproduce #N: …"** and holds only the regression test. The test is
    built from the reporter's artefact: a probe's saved page, the reporter's own input, or seeded
    data driven by Playwright for a screen. It asserts the reporter's observation in their own
    terms, for example "Schritt 4 contains 'glattrühren'".
  - The agent runs it on the untouched branch and confirms it fails _for the reported reason_.
    Only then does it fix.
  - The PR body shows the red output, then the green one.
  - **No reproduction, no fix on a guess:** a `WIP:` draft, or `needs-info` with one specific
    question.
- **Open questions block.** Every question in triage's verdict is answered in the PR body with
  evidence (a probe's output, a `path:line`, a test). If one can't be answered, the build stops
  with `needs-info`.
- **A reviewer subagent**: `.claude/agents/reviewer.md`, `model: opus`, read-only tools (`Read`,
  `Grep`, `Glob`, `Bash(git diff:*)`, `Bash(npx vitest run:*)`).
  - It gets the issue number, the reproduction test's name and `git diff origin/dev`, and none
    of the builder's reasoning.
  - It answers three things: does the test assert what the reporter saw? Does the diff fix that
    cause, or a neighbour of it? Are there correctness bugs in the diff?
  - House rules are CI's job, so it skips style. It reports at most five findings with
    `path:line`, and "no findings" is a valid answer.
  - `/build-issue` runs it before the PR. The builder **decides per finding** (fix it, or reject
    it with a reason) instead of obeying every one, which keeps the pair from looping. The
    decisions go into a "Review" section of the PR body.
  - Desk sessions can use the same agent.
- **`fixed-on-dev` by the workflow.** A new `.github/workflows/merged.yml` runs on
  `pull_request: closed` into `dev`, and only when it merged. It reads the `Closes #N` lines and
  adds the label. `/build-issue` stops setting it. Desk PRs get the label the same way.
- **Tests** (`tests/conventions/ci.test.ts`):
  - triage has no `gh issue edit`;
  - the `apply` job's dispatch condition names `bug`, `size`, `reproduced`, `found` and the empty
    questions;
  - `merged.yml` fires only on a merged PR into `dev` and only labels;
  - `.claude/agents/reviewer.md` exists, and `/build-issue` names it and the "Reproduce" commit.
- **Docs**: TESTING.md "The flow" and "Writing tests" (the reproduction rule for bugs), a note in
  plan 18, and one DECISIONS entry.

## Built (2026-10-26)

Deviations, each in DECISIONS #164:

- **Triage still has no web.** PR #51 (DECISIONS #163) took `WebFetch` and the probe away from
  triage the same day, before this plan was built. Reproduction moves into a **`probe` job ahead
  of triage**. It has no Claude and no secret but the read-only job token. It runs
  `scripts/issue-probe.ts`: the issue's links (at most three, GitHub's own skipped) go into
  `npm run import:probe`, the report goes up as an artifact, and triage reads it from
  `$RUNNER_TEMP/probe/report.md`. That path is passed as the slash command's second argument, and
  it sits outside `/tmp`, so the agent can't rewrite its own evidence. The links come from the
  issue, never from the agent.
- **The schema is a file**, `scripts/triage-verdict.schema.json`. A step compacts it with `jq`
  into `--json-schema '…'`, and `scripts/triage-apply.ts` validates the verdict against the same
  file before it labels anything. Every label is built from an enum, so a steered verdict can't
  name `agent:build`. `confidence` gained `not-a-bug` for ideas and duplicates. The verdict
  reaches every script through `env`, never `${{ }}` in a `run:`.
- **`apply` adds `agent:build` before it dispatches**, so the issue shows what is happening and
  `/build-issue`'s "is `agent:build` there?" check holds. A label added with `GITHUB_TOKEN`
  starts no workflow, and `build.yml` refuses a bot's label anyway. `build.yml` now lists
  `allowed_bots: github-actions`, the dispatching actor, instead of `claude`.
- **The reviewer's tools are `Read, Grep, Glob, Bash`.** A subagent's `tools:` takes tool names
  only. `Bash(git diff:*)` there would remove Bash entirely, not scope it, per the Claude Code
  docs on subagents. So the reviewer has no Edit or Write, and its prompt limits Bash to
  `git diff`/`log`/`show`, `gh issue view` and `npx vitest run`. In the build job, the deny list
  and auto mode apply to it as well. `.gitignore` now lets `.claude/agents/` into the checkout.
- **Found in review:** `apply` runs `if: !cancelled() && needs.triage.result == 'success'`.
  Without that, a failed probe job (an ancestor) would skip the labels. The hand-on step skips
  an issue that already carries `agent:build`, so a re-triage by hand never starts a second
  build. Triage gets `--add-dir` for the report, because a read outside the checkout could be
  refused without a word.
- `merged.yml` checks out `dev`, not the PR's merge ref, which GitHub may drop once the PR has
  merged. A `#N` that can't be labelled (a PR, a deleted issue) is a warning, not a failure.

**Replayed on #31** (the recorded walk-through). The probe ran against `b109b10` (`dev` before
#32), `48407df` (#32 merged) and this branch, through the current probe with a one-line
adapter: the old `RecipePage` has no `reader` field.

| `dev` at       | Step 4 as the importer reads it                       |
| -------------- | ----------------------------------------------------- |
| before #32     | `4. Eier`                                             |
| after #32      | `4. Eier`                                             |
| now (with #33) | `4. Eier, Sahne, Crème fraîche und Senf glattrühren…` |

1. The `probe` job hands triage `4. Eier` beside the reporter's "Schritt 4 ist nach Import nur:
   Eier". That is a reproduction. The probe's step 1 (`… Mit Butter`) shows every step ends at
   its first comma. That is the array-of-fragments cause, and it answers #31's open question
   ("JSON-LD or Microdata, and what do its steps look like?").
2. `/build-issue` saves the page with `--save` and writes `Reproduce #31` from it: step 4
   contains "glattrühren". #32's change, an ingredient-line join for a shape the page never
   sends, leaves the probe at `4. Eier`. That test stays red, so the PR never goes green. This
   is the step that catches the wrong hypothesis: #32's own test was built from a guessed shape,
   not from the saved page.
3. Had the builder written a guessed test anyway, the reviewer's first question (does the test
   assert what the reporter saw?) compares that test with the saved page.
4. #32 also set `fixed-on-dev` when it opened. Now `merged.yml` sets it at merge, which doesn't
   prevent a wrong fix by itself. With the red reproduction, though, there is no merge.

## Acceptance

- [ ] A small bug with a probe-reproduced symptom builds without a person. A small bug that is
      only "found" from source waits, and the comment says why. _Live run after the release PR.
      Checked so far: the dispatch condition, `--json-schema` returning a verdict from the CLI,
      the schema surviving the action's own argument parsing (shell-quote), and the probe job's
      script on #31's real page._
- [ ] An agent PR for a bug starts with a "Reproduce #N" commit that fails on `dev` (output in the
      PR body), then the fix. _First live build after the release PR._
- [ ] The PR body has a "Review" section: the reviewer's findings and the builder's decision on
      each. _Same._
- [ ] `fixed-on-dev` appears when the PR merges, not when it opens. A PR closed unmerged leaves
      the issue unlabelled. _`merged.yml` runs from the PR, so it is live on `dev` from this
      merge; the first PR with a `Closes #N` shows it._
- [x] Replayed on #31's original report against the commit before #33, the lane produces #33's
      fix, not #32's. If that replay is too costly, a recorded walk-through states which step
      catches the wrong hypothesis. _Recorded walk-through above, probe output measured on
      both commits._
- [x] `ci.test.ts` bites on each rule above. `npm run verify` clean.
