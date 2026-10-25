# 27 · Agent lane: ideas as proposals, and a hardened lane

**Status: todo.** Depends on: 26.

**Goal:** an idea reaches the agent the way a bug does, through a written decision. And the
jobs that read untrusted text can't leak what they hold. Today ideas stall after triage: #8,
#21, #23 and #24 have sat open since September. A feature has no ground truth until someone
decides what it should be, and that decision is Lukas's. So the agent drafts it, a merge
approves it, and the agent builds it. Separately, the agent jobs run with open egress on actions
pinned by moving tags. Plan 25 lets agents read web pages, which makes both worth closing. See
the audit: [Choreganized — Agentic Workflow Audit](https://claude.ai/artifact/MW3C3jvVVwjbwwv5irQUCz).

## Build

- **Idea → proposal PR.**
  - For an `idea` sized `s` or `m`, the `apply` job (plan 26) dispatches `build.yml` in
    **propose** mode. A person can ask for one too, with an `agent:propose` label. `size:l` stays
    a desk session.
  - The agent opens a **docs-only** PR titled `Proposal: …`. It holds a plan file
    `docs/plans/NN-slug.md` with status `proposed` (Goal · Build · Acceptance, in the shape of
    the existing plans), the SPEC sections it would change, written out as the change, and a
    README row.
  - The PR body lists the open questions as checkboxes and says what the idea would touch and
    roughly how big it is. It never auto-merges.
  - A CI step in the `static` job fails a proposal branch (`agent/propose-*`) that changes
    anything outside `docs/`.
- **Merging the proposal is the approval.** `merged.yml` (plan 26) sees a merged proposal, sets
  its plan to `todo`, and dispatches the build for the issue. The build reads the plan file as
  its spec and marks it `in progress`, then `done`. Lukas can edit the proposal before merging:
  answer a question, cut scope. Rejecting it means closing the PR and the issue with a reason.
  There is nothing to revert, because nothing reached `dev`.
- **README statuses** gain `proposed`.
- **Previews for prototypes**: optional, waiting on a decision (below).
  - Some ideas can't be judged on paper, like a gesture or a new view. A `prototype` label builds
    the idea on `agent/prototype-N` as a **draft** PR that never auto-merges. Coolify deploys it
    to `{{pr_id}}.<domain>`.
  - Coolify needs a GitHub App source with Preview Deployments on, a wildcard DNS record, and its
    own environment group with no production secrets. "Repository members only" must be on.
    Each preview starts with its own empty SQLite volume.
  - Approve: the PR's spec becomes the proposal. Reject: close it.
  - **Decision needed.** Google sign-in does not accept per-PR hosts, so a preview needs another
    way in. Option (a): allow `E2E_MODE` password sign-in on preview hosts only, with seeded demo
    data, and a boot guard that refuses `E2E_MODE` unless the host matches the preview pattern.
    That is a deliberate exception to "never set it on a deployed instance", recorded in
    DECISIONS. Option (b): no previews; prototypes go through `dev` and the test environment as
    today, and are reverted if rejected.
- **Egress firewall on agent jobs.**
  - `step-security/harden-runner` is the first step of the triage and build jobs, not of CI. It
    is free for public repositories on GitHub-hosted runners.
  - It starts in `egress-policy: audit` for about ten agent runs, then switches to `block`, with
    the endpoints those runs actually used: the npm registry, the Anthropic API, GitHub's hosts,
    the Playwright download CDN and `mcr.microsoft.com` for the visual suite.
  - Under `block`, triage's `WebFetch` and the import probe can no longer reach arbitrary
    pages. A small job with open egress and no secrets runs before the agent, fetches the pages
    the issue links to (with the probe), and hands them over as an artifact. The agent then never
    needs the open web, and a steered agent has nowhere to send anything.
- **Pinned actions.** Every `uses:` in `.github/workflows/` names a 40-character commit SHA,
  with the version in a comment. `.github/dependabot.yml` bumps `github-actions` weekly.
- **Tests** (`tests/conventions/ci.test.ts`):
  - every `uses:` is a SHA;
  - both agent jobs start with harden-runner in `block` mode;
  - the proposal guard step exists;
  - `merged.yml` dispatches a build only for a merged proposal.
- **Docs**: TESTING.md "The flow" (the idea road); SPEC §8 if the feedback screen should say what
  happens to an idea; and DECISIONS: the proposal gate, the preview decision, and the firewall.

## Acceptance

- [ ] A new `idea` issue (size `s`/`m`) gets a `Proposal: …` PR that changes only `docs/`. A
      proposal PR that touches `src/` fails CI.
- [ ] Merging the proposal starts a build that names the plan file. Closing it leaves `dev`
      untouched.
- [ ] Harden-runner runs in `block` mode on both agent jobs, and a build still goes green. A
      deliberate `curl` to an unlisted host from the agent is blocked, as seen in the run.
- [ ] Every action is pinned to a SHA, and Dependabot opens its first bump PR.
- [ ] Previews: built and walked per the decision, or marked "not doing" with the reason.
- [ ] `ci.test.ts` bites on each rule above. `npm run verify` clean.
