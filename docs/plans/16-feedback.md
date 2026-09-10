# 16 · In-app feedback → a GitHub issue

**Goal:** give the household a way to report a bug or suggest an idea from inside the app, and
give the repository a way to receive it. Until now the only queue was `docs/plans/README.md`,
fed solely by Lukas sitting down and describing something — a bug noticed on the phone at 19:00
didn't survive until the next desk session, and the other member of the household had no route at
all. A sheet in Settings writes the report to SQLite and mirrors it to a GitHub issue; one
read-only GitHub Action triages every new issue and drafts the plan a local session builds from.

Depends on: 10, 11. SPEC: §6 + §9. Design: reuses the existing BottomSheet; no new frame.

> **Numbering, and a merge this plan has not done.** Built in parallel with plan 15
> (live shopping), which was in flight in the main checkout at the time — hence 16 rather than 15. That session also appends to `docs/DECISIONS.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md`
> and both message catalogs. **DECISIONS is the one that bites**: an ordered numbered list where
> two branches both append at "the next number" merges _without_ a conflict and silently
> duplicates. Whichever branch merges second keeps the number already on `main`, renumbers its
> own, and repoints its references — `grep -rn 'DECISIONS #135' src docs`. This plan's entries
> are **#135–#136** as written, and neither branch was merged when it was committed.

## Build

- `src/lib/utils/feedback.ts` — `FEEDBACK_KINDS` (`bug` | `idea`), `isFeedbackKind`,
  `FEEDBACK_BODY_MAX` (2000), `FEEDBACK_TITLE_MAX` (72). Shared by the textarea's `maxlength` and
  the action's guard, the way `utils/household.ts` is. The kind enum is duplicated in `schema.ts`
  (the `meals.slot` precedent); both sides carry a comment saying they must agree.
- `src/lib/server/db/schema.ts` — the `feedback` table: household + member (`ON DELETE SET NULL`)
  with a `memberName` snapshot, `kind`, `body` (verbatim), the diagnostic envelope
  (`locale`, `theme`, `appVersion`, `userAgent`), and the mirror's state (`issueNumber`,
  `syncedAt`, `attempts`, `nextAttemptAt`, `lastError`). Two indexes: the sweep's range scan and
  the household read. `npm run db:generate` → `0012_purple_smasher.sql` + snapshot + journal.
- `src/lib/server/version.ts` — `appVersion()`, read per call because `$env/dynamic/private` is
  empty during the build. `dev` outside a container.
- `src/lib/server/github.ts` — a sibling of `push.ts`, not a service. `createIssue`,
  `findIssueByMarker`, `githubConfigured`, and a `GitHubError` carrying a code and a `retryable`
  flag. Only rate limits and 5xx/transport failures retry.
- `src/lib/server/services/feedback.ts` — `submitFeedback` (one insert, the whole of what the tap
  depends on), `syncFeedback` (never throws), `sweepFeedback` (household-blind, requeues parked
  rows on the first pass of a process). Claim-before-call, 5 min → 6 h backoff, park at 8.
- `src/lib/server/cron.ts` — `['feedback-sync', catchUpFeedback]` on the minute tick.
- `src/routes/(app)/settings/+page.server.ts` — `sendFeedback` action (`requireMember`, guards,
  `submitFeedback`, then `void syncFeedback`), and `appVersion().label` on the load.
- `src/lib/components/settings/FeedbackSheet.svelte` + a new **About** `RowGroup` in
  `settings/+page.svelte` holding the feedback row and the version.
- `src/lib/i18n/messages/en.ts` + `de.ts` — `settings.about`, `settings.version`,
  `settings.feedback.*`. `attached(version)` is a function because it carries a value.
- `.env.example`, `Dockerfile` — `GITHUB_FEEDBACK_TOKEN` / `GITHUB_FEEDBACK_REPO`, and
  `APP_VERSION` / `SOURCE_COMMIT` build args baked into `ENV` in both stages.
- `.github/workflows/triage.yml`, `.claude/commands/triage-issue.md`,
  `.github/ISSUE_TEMPLATE/{bug,idea}.yml`, `.claude/commands/inbox.md`, and a `.gitignore`
  negation so `.claude/commands/` ships — the action's checkout needs the prompt.
- Docs: SPEC §6 + §9, DATA-MODEL (`feedback` + the sweep line), DECISIONS #135–#136,
  ARCHITECTURE (layout + env), DESIGN-SYSTEM (no new primitive), this file and a README row.

## Acceptance

- [x] A member can send a bug or an idea from Settings → About, in either language.
- [x] The report is stored verbatim — no translation, no tidying, umlauts and code fences intact.
- [x] With no token configured the report still saves, and **does not burn a retry attempt**.
- [x] A permanent GitHub refusal parks the row with its error code and no response body.
- [x] The first sweep after a restart un-parks whatever gave up earlier.
- [x] The action's guards (empty body, unknown kind, over-length) answer in the reader's language.
- [x] `npm run check && npm run build` clean; `npm test` 159/159 (8 new).

## What was verified (session 2026-09-10)

Walked in a dev server on `127.0.0.1:5181` against a copy of the dev database
(`data/verify15.db`), on its own host and port so the parallel `live-shopping` session's server
was untouched. Sign-in via the documented TEMP-VERIFY `emailAndPassword` route, reverted after.

- **Migration + registration.** `0012` applied on boot (`feedback` table present) and the cron
  registry went from 6 jobs to 7.
- **English bug report.** The sheet rendered in dark mode; the switch changed the placeholder and
  the hidden `kind` input together; `maxlength` 2000. A report containing a ` ```js ` fence,
  `@octocat` and `#1` was stored byte-for-byte, with `attempts 0`, `issue_number NULL` and
  `next_attempt_at == created_at` — i.e. an unconfigured server does not spend a retry.
- **German idea, explicit dark.** All copy German, `data-theme="dark"`; the row recorded
  `locale de`, `theme dark`, umlauts intact.
- **The mirror's failure path**, with a deliberately invalid token: the action still returned
  `feedbackSent` immediately (fire-and-forget), and the row parked at `attempts 8` with
  `last_error 'bad-token'` and the 5-minute slot already booked by `claim`. That the API answered
  401 rather than 403 also confirms the request shape — GitHub refuses a request with no
  `User-Agent`.
- **The sweep and the requeue.** On the next minute tick the log read
  `[feedback] requeued 1 parked report(s) after a restart`, then all three rows were claimed,
  attempted and parked.
- **Guards.** Empty body, unknown kind and a 2001-character body each returned the right German
  sentence, and created no row.

### Review pass (same session)

`/code-review` at extra-high effort turned up seven findings in this plan's own code; all were
fixed before shipping and re-verified in the running app:

- **`syncFeedback` could take the process down.** The header promised "nothing here throws" and
  the action leaned on it with `void syncFeedback(…)`, but three better-sqlite3 calls inside
  could throw — the last from inside the catch block. Under SQLITE_BUSY behind the nightly
  backup that becomes an unhandled rejection and, on Node's default, an exit. Both exported
  entry points now carry the belt `push.ts` documents.
- **The attempts cap lived in the sweep's query, not in `claim`** — so the exported
  `syncFeedback` could retry a parked row for ever. Moved to the one line every path goes
  through.
- **`Promise.all` filed issues concurrently**, which is what trips GitHub's secondary rate limit
  on content creation. The sweep is serial now (→ DECISIONS #135).
- **`createIssue` could throw a SyntaxError** from `response.json()`, breaking its own
  "GitHubError and nothing else" contract. A non-JSON body is now a retryable `unreachable`.
- **`fenceFor` / `titleFrom` were pure but untestable**, stranded in a db-importing module — and
  the fence is the guarantee that a `@name` in a report doesn't ping a stranger. They moved to
  `utils/feedback.ts` as `codeFenceFor` / `feedbackTitle` with **8 unit tests**, which is where
  the rest of this repo's tests live.
- **The body cap lived only in the action.** `submitFeedback` now clamps too, the way
  `startTimer` repairs its own label.

Re-verified after the fixes on `127.0.0.1:5182` against a fresh copy: an over-length body still
refused with the right sentence; a report with a fenced code block, an `@mention` and a `#1`
stored byte-for-byte and parked at `bad-token`; and — the interaction the cap fix could have
broken — a row hard-parked at `attempts 8` with `next_attempt_at` **a year out** was rescued by
requeue-on-boot after a restart, re-attempted through the new `claim` cap, and re-parked with a
fresh error and a 5-minute slot.

**Not verified, and it needs a human:** no issue was actually created on GitHub. That needs a
real `GITHUB_FEEDBACK_TOKEN`, which this session had no way to mint — everything up to and
including the authenticated 401 from `api.github.com` is exercised, but the 201 path, the body as
GitHub renders it, and the marker search are not. Likewise `.github/workflows/triage.yml` cannot
run until it is on `main`: GitHub reads `issues`-event workflows from the default branch only.
The one-time setup (`gh auth login`, the Claude GitHub App, `CLAUDE_CODE_OAUTH_TOKEN`, the PAT,
the label bootstrap) is listed in the handoff.
