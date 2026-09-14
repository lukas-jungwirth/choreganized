# 18 · Build agent: from an issue to code on `dev`

**Status: done (2026-09-14).** Depends on: 16 (triage), 17 (the test workflow).

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
  agent's PRs (waiting · `BEHIND` · `WIP:`), `agent:build` issues that have no PR, and the
  `fixed-on-dev` ones the next promotion closes — `Closes #N` only acts on the default branch.

## Guardrails, decided

| Question from the design | Answer                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Which labels qualify     | Bot-added: `bug` + `size:s`, enforced in the job's `if`. Person-added: `size:s`, `size:m`. `size:l` is a desk session.          |
| Spend ceiling            | `--max-turns 200`, `timeout-minutes: 90`, one build at a time. Subscription usage through `CLAUDE_CODE_OAUTH_TOKEN`.            |
| Concurrency              | `group: build`, `cancel-in-progress: false` — serial, each build from the `dev` the previous one left.                          |
| Auto-merge to `dev`      | **Yes, every agent PR**, on green CI — that is what the test environment is for. `dev → main` is always a person.               |
| Verify stays red         | A draft PR titled `WIP:`, the failing test named in the comment. A draft cannot auto-merge; a desk session picks the branch up. |

## Acceptance

- [x] Adding `agent:build` to a triaged `size:s` / `size:m` issue produces a PR against `dev`
      within the budget, with a test that fails on `dev` and passes on the branch — issue #7,
      PR #13, below.
- [x] CI on that PR is green and it merges itself — or it is a `WIP:` draft that names the
      failing test. (#13 merged itself; the draft path is designed, not yet seen.)
- [x] The PR body carries the plan and the definition-of-done checklist, ticked only where
      true; an idea's PR adds `docs/plans/NN-slug.md` and its README row — plan 19.
- [x] Nothing reaches `dev` without green CI and nothing reaches `main` without a person — from
      the repository settings, not from the prompt. The gate refused PR #11 while its browser
      job was red.
- [x] A bot-added label on anything but `bug` + `size:s` does not start a run — the `if` is
      pinned by the convention test; the bot path itself ran unattended on issue #18 (below).
- [x] `tests/conventions/ci.test.ts` fails when `build.yml` loses its guard, its allow-list
      shape, its concurrency or its prompt.
- [x] DECISIONS #143; the README row; this file's verification section.

## What was verified (session 2026-09-14)

- **Repository settings**, read back with `gh api`: `dev` and `main` require the three CI
  contexts (`strict: true`, `enforce_admins: false`); the repository has `allow_auto_merge` and
  `allow_update_branch`; the `agent:build` label exists. A push to `dev` from a non-admin is now
  refused — stated from the settings, and the App token is not an admin. Relaxing `main`'s
  up-to-date rule was refused by the session's permission classifier as a CI bypass, so both
  branches stay strict and a `dev → main` promotion that opens `BEHIND` takes
  `gh pr update-branch` (PR #12 did, then merged green).
- **The gate bit on its first PR, for the right reason.** PR #11 (this plan) failed the browser
  job on four visual screens nobody had touched; a control run of CI on untouched `dev`
  (34872933954) failed identically. The suite was date-dependent (→ DECISIONS #144): fixed in
  the same PR, the three Home baselines regenerated in the container, two runs compared
  identical, CI green, merged.
- **The convention test bites**: with `build.yml` moved aside, `ci.test.ts` fails 5 of 7 with
  `.github/workflows/build.yml exists`; back in place, 7 of 7.
- **Live, the human path** — `gh issue edit 7 --add-label agent:build` on the copyable-version
  idea (`size:s`, settings). Run 34874354309: 9 min 51 s wall-clock, `success`. The agent
  branched `agent/issue-7`, wrote `docs/plans/19-copy-version.md` and its README row, made the
  version row a `<button>`, added `settings.version.{row,copied}` to both catalogs, DECISIONS
  #145 (numbered after #144 — it rebased on the `dev` it found), SPEC §6, and a Playwright test
  that grants clipboard permission, taps, reads the clipboard back and waits for the revert.
  One design call of its own, named in its comment: no toast, the value swaps to "Copied" in
  place. PR #13 opened with `Closes #7` and the checklist, ticked honestly (its last
  `npm run verify` failed on cleanup, and it said so); auto-merge enabled by `app/claude`;
  **CI started on the PR** — the App token does trigger workflows, the fallback in #143 stays
  unused; all three checks green; merged by `app/claude` at 17:34:01, 1 min 54 s after opening.
  Reviewed by this session against the source: nothing to change.
- **Two things the run taught**, fixed in the close-out: `Closes #N` only fires on the default
  branch, so an issue whose PR merged into `dev` stays open — the agent now adds
  `fixed-on-dev`, and the promotion PR carries the `Closes` lines (→ #143). And the Dockerized
  `npm run test:visual` leaves root-owned `test-results/`, `playwright-report/` and `data/e2e/`
  behind on Linux, which made the agent's final `npm run verify` fail on cleanup after every
  layer had passed — `scripts/visual.ts` now hands the files back after the container exits.
- **Live, the bot path — unattended, 18:34 to 18:41.** Issue #18 was sent from inside the app
  by a household member (a German title on Home reading "Zuletzt passiert" instead of "Zuletzt
  erledigt"), which also proves plan 16's last unverified step: `GITHUB_FEEDBACK_TOKEN` is set
  and the app files issues. Triage found the cause at `de.ts:432`, labelled `bug` ·
  `area:home` · `size:s`, and added `agent:build` itself. The Build run (34881670252) took
  4 min 49 s: the one-line fix, a new `tests/e2e/home.spec.ts` that switches to German and
  asserts the card's title, PR #19, CI green, merged by `app/claude` at 18:41:21,
  `fixed-on-dev` set. Nobody touched it. **One thing it showed**: every `labeled` event
  creates a run, and a workflow-level `concurrency` group counted the runs the job's `if`
  skips — GitHub cancels the previously pending run in a group when another queues, so two
  label-noise runs were cancelled and the real one survived by order of arrival.
  `concurrency` now sits on the job, which a skipped job never enters.
