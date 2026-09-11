# 18 · Build agent: from a triaged issue to a pull request

**Status: todo.** A design, not yet built. Depends on: 16 (triage), 17 (the test workflow).

**Goal:** let a small, well-understood fix go from a GitHub issue to a reviewed pull request
without a desk session. Plan 16 stopped at triage because "this repo's definition of done is a
walk in the running dev server and CI has no dev server" (→ DECISIONS #136). Plan 17 changed
that half: CI now runs the production build with a seeded database and a browser, so a change
can prove itself where it was written. What remains human is the decision to merge.

## Shape

- **Trigger: a label, never the issue itself.** A maintainer adds `agent:build` to an issue
  that triage has already sized `size:s` and located. `on: issues: types: [labeled]` fires
  only for that label. The issue body is untrusted text (→ plan 16); the label is the one
  signal that a person with write access read it and wants it built.
- **Workflow `.github/workflows/build.yml`**: `anthropics/claude-code-action@v1` with a prompt
  `/build-issue N`, `permissions: contents: write, pull-requests: write, issues: write`,
  `--max-turns` around 80, and `--allowedTools` widened to `Edit,Write,Bash(npm run *),
Bash(npx playwright *),Bash(git *),Bash(gh pr create *),Bash(gh issue comment *)`. Playwright's
  browsers are installed first (`npx playwright install --with-deps chromium`), or the job runs in
  the Playwright container the `e2e` job uses.
- **Command `.claude/commands/build-issue.md`**: read the issue and triage's comment; branch
  `agent/issue-N` off `dev`; build the fix **with a test that fails without it** in the layer
  `docs/TESTING.md` prescribes; update `en.ts` + `de.ts` when copy changes; `npm run verify`;
  refresh visual baselines only when a screen changed on purpose, and say so in the PR; commit
  with the repo's message style; `gh pr create --base dev` with the triage plan as the body and
  the checklist from `docs/TESTING.md` "Definition of done"; comment on the issue with the PR
  link. **Never merge, never push to `dev` or `main`, never edit a workflow, never touch
  `schema.ts` without saying so in the PR title.**
- **Then the ordinary flow** (→ `docs/TESTING.md` "The flow"): CI on the PR, a human merge to
  `dev`, the test environment, the smoke test, a PR to `main`.

## Guardrails to decide before building

- Which labels qualify (`bug` + `size:s` only, at first — an `idea` is a plan, not a fix).
- A spend ceiling per run and per month; the action reports `total_cost_usd`.
- `concurrency: build-${issue}` so a re-label can't race a running build.
- Whether a `size:s` bug fix with green CI may ever auto-merge to `dev` (recommendation: not
  until a dozen PRs have been reviewed and the failure modes are known).
- What the agent does when `npm run verify` stays red after N attempts: push the branch
  anyway with a `WIP:` title and a comment naming the failing test, so nothing is lost.

## Acceptance

- [ ] Labelling a triaged `size:s` bug with `agent:build` produces a PR against `dev` within
      the turn budget, with a test that fails on `dev` and passes on the branch.
- [ ] CI on that PR is green, or the PR says which job is red and why.
- [ ] The PR body carries the triage plan and the definition-of-done checklist, ticked.
- [ ] Nothing reaches `dev` or `main` without a human merge.
- [ ] DECISIONS.md gets the entry; `docs/plans/README.md` the row; this file the verification.
