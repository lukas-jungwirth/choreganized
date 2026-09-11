---
description: What's waiting in the feedback inbox — open bugs first, then ideas
---

Show me what has come in. GitHub issues are the **inbox**; `docs/plans/README.md` is the
**queue**. They are deliberately not the same list and are never synced (→ DECISIONS #136).

1. Open bugs, newest first, with their triage labels:
   `gh issue list --state open --label bug --json number,title,labels,createdAt,comments`
2. Open ideas, **oldest first** — an idea that has been sitting for months is either worth
   doing or worth closing, and either answer is better than another month:
   `gh issue list --state open --label idea --json number,title,labels,createdAt`
3. Anything still labelled `needs-info`, so I can answer it myself.
4. Anything labelled `fixed-on-dev` — that is built and just waiting on a deploy.

Present it as a short list, most actionable first: number, title, size, area, and the triage
verdict in a handful of words. Say plainly which ones look ready to build and which are still
questions. Do not start building anything — this is a reading command.

When I accept an idea, that is when it becomes `docs/plans/NN-slug.md`, and the issue is closed
with a link to the plan.
