---
description: What's waiting in the feedback inbox — open bugs first, then ideas, then what the agent is doing
---

Show me what has come in. GitHub issues are the **inbox**; `docs/plans/README.md` is the
**queue**. They are deliberately not the same list and are never synced (→ DECISIONS #136).
Since plan 18 the build agent works the inbox too, so show what it is doing as well.

1. Open bugs, newest first, with their triage labels:
   `gh issue list --state open --label bug --json number,title,labels,createdAt,comments`
2. Open ideas, **oldest first** — an idea that has been sitting for months is either worth
   doing or worth closing, and either answer is better than another month:
   `gh issue list --state open --label idea --json number,title,labels,createdAt`
3. Anything still labelled `needs-info`, so I can answer it myself.
4. Anything labelled `fixed-on-dev` — built and merged into `dev`, waiting on the promotion.
   `Closes #N` only acts on the default branch, so these stay open until the `dev → main` PR
   whose body lists them merges.
5. **The agent's pull requests** —
   `gh pr list --state open --json number,title,isDraft,headRefName,mergeStateStatus,autoMergeRequest`,
   the ones whose `headRefName` starts with `agent/`, in three groups:
   - waiting for CI (`autoMergeRequest` set, not a draft) — nothing to do;
   - **stale** (`mergeStateStatus` is `BEHIND`) — `dev` moved under it; `gh pr update-branch <n>`
     re-runs CI and auto-merge follows;
   - **draft `WIP:`** — the agent gave up; its comment names the failing test. A desk session
     picks the branch up.
6. Issues labelled `agent:build` with no pull request, open or merged — a run that died. Retry
   with `gh workflow run build.yml -f issue=<n>` (Actions → Build → Run workflow).
7. What `dev` has that `main` doesn't (`git log --oneline origin/main..origin/dev`) — the test
   environment is ahead; try it there and promote with a PR `dev → main` whose body carries one
   `Closes #N` line per issue from item 4. It usually opens `BEHIND` (`main` is merge commits of
   `dev`): `gh pr update-branch <n>`, wait for CI, merge.

Present it as a short list, most actionable first: number, title, size, area, and the triage
verdict in a handful of words. Say plainly which ones look ready to build and which are still
questions. Do not start building anything — this is a reading command.

When I accept an idea of `size:s` or `size:m`, I add `agent:build` and the agent writes the plan
file, builds it, and opens the PR that closes the issue. A `size:l` idea — a screen with no frame
— becomes `docs/plans/NN-slug.md` at the desk, and the issue is closed with a link to the plan.
