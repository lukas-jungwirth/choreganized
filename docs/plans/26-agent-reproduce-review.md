# 26 · Agent lane: reproduce first, review second

**Status: todo.** Depends on: 25.

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

## Acceptance

- [ ] A small bug with a probe-reproduced symptom builds without a person. A small bug that is
      only "found" from source waits, and the comment says why.
- [ ] An agent PR for a bug starts with a "Reproduce #N" commit that fails on `dev` (output in the
      PR body), then the fix.
- [ ] The PR body has a "Review" section: the reviewer's findings and the builder's decision on
      each.
- [ ] `fixed-on-dev` appears when the PR merges, not when it opens. A PR closed unmerged leaves
      the issue unlabelled.
- [ ] Replayed on #31's original report against the commit before #33, the lane produces #33's
      fix, not #32's. If that replay is too costly, a recorded walk-through states which step
      catches the wrong hypothesis.
- [ ] `ci.test.ts` bites on each rule above. `npm run verify` clean.
