# 18 · Build agent: from an issue to code on `dev`

**Status: in progress (2026-09-14).** Depends on: 16 (triage), 17 (the test workflow).

**Goal:** close the loop plan 16 opened. The household reports a bug or pitches an idea from
inside the app; triage reads it; and from there the fix or the feature reaches the test
environment without a desk session. Plan 16 stopped at triage because CI had no browser
(→ DECISIONS #136); plan 17 gave it one (→ #141). What this plan decides is which changes may go
all the way on their own, and where the brakes are (→ DECISIONS #143).

## Shape

- **Trigger: the `agent:build` label, never the issue itself.** Triage adds it for one shape
  only — a `bug`, `size:s`, cause _found_ — and a person adds it for anything else that is
  `size:s` or `size:m`. `size:l` is a desk session, and `size:l` means one thing: a screen, a tab
  or a navigation surface with no frame in `design/Hearth.dc.html`. Everything that can be matched
  to the existing kit is `s` or `m`, and the builder makes the small design calls itself.
- **`.github/workflows/build.yml`** — `on: issues: [labeled]` plus `workflow_dispatch` for a
  retry; one build at a time, never cancelled; the job's `if` lets a bot start only `bug` +
  `size:s`; `contents` / `pull-requests` / `issues: write`; Node 22, `npm ci`, Playwright's
  Chromium; `anthropics/claude-code-action@v1` with `allowed_bots: claude`, `--max-turns 200`,
  and an allow-list in which `gh pr merge --auto` is the only command that merges.
- **`.claude/commands/build-issue.md`** — read the issue and triage's draft (untrusted text);
  branch `agent/issue-N` off `dev`; an idea becomes `docs/plans/NN-slug.md` first; build from
  the kit and the frames, listing the design calls in the PR; a test that fails without the
  change; `npm run verify`; docs in the same pass; review the diff; rebase on `dev`; a PR with
  `Closes #N` and the definition-of-done checklist; `gh pr merge --auto --merge`; one comment.
  Three red rounds end in a `WIP:` draft.
- **Then the ordinary flow** (→ `docs/TESTING.md` "The flow"): CI on the PR merges it, Coolify
  deploys `dev`, the smoke test checks it, Lukas tries it, a PR `dev → main`.
- **Repository settings, applied 2026-09-14** — plan 17's "for the owner" box: the three CI
  checks required on `dev` and `main` (strict, admins exempt), `allow_auto_merge`,
  `allow_update_branch`, and the `agent:build` label. Without the first two, `gh pr merge --auto`
  has nothing to wait for.
- **`/triage-issue`** sizes by Lukas's rule and hands on with the label; **`/inbox`** lists the
  agent's PRs (waiting · `BEHIND` · `WIP:`) and `agent:build` issues that have no PR.

## Guardrails, decided

| Question from the design | Answer                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Which labels qualify     | Bot-added: `bug` + `size:s`, enforced in the job's `if`. Person-added: `size:s`, `size:m`. `size:l` is a desk session.          |
| Spend ceiling            | `--max-turns 200`, `timeout-minutes: 90`, one build at a time. Subscription usage through `CLAUDE_CODE_OAUTH_TOKEN`.            |
| Concurrency              | `group: build`, `cancel-in-progress: false` — serial, each build from the `dev` the previous one left.                          |
| Auto-merge to `dev`      | **Yes, every agent PR**, on green CI — that is what the test environment is for. `dev → main` is always a person.               |
| Verify stays red         | A draft PR titled `WIP:`, the failing test named in the comment. A draft cannot auto-merge; a desk session picks the branch up. |

## Acceptance

- [ ] Adding `agent:build` to a triaged `size:s` / `size:m` issue produces a PR against `dev`
      within the budget, with a test that fails on `dev` and passes on the branch.
- [ ] CI on that PR is green and it merges itself — or it is a `WIP:` draft that names the
      failing test.
- [ ] The PR body carries the plan and the definition-of-done checklist, ticked only where
      true; an idea's PR adds `docs/plans/NN-slug.md` and its README row.
- [ ] Nothing reaches `dev` without green CI and nothing reaches `main` without a person — from
      the repository settings, not from the prompt.
- [ ] A bot-added label on anything but `bug` + `size:s` does not start a run.
- [ ] `tests/conventions/ci.test.ts` fails when `build.yml` loses its guard, its allow-list
      shape, its concurrency or its prompt.
- [ ] DECISIONS #143; the README row; this file's verification section.
