# 16 · In-app feedback → a GitHub issue

**Goal:** give the household a way to report a bug or suggest an idea from inside the app, and
give the repository a way to receive it. Until now the only queue was `docs/plans/README.md`,
fed solely by Lukas sitting down and describing something — a bug noticed on the phone at 19:00
didn't survive until the next desk session, and the other member of the household had no route at
all. A sheet in Settings writes the report to SQLite and mirrors it to a GitHub issue; one
read-only GitHub Action triages every new issue and drafts the plan a local session builds from.

Depends on: 10, 11. SPEC: §6 + §9. Design: reuses the existing BottomSheet; no new frame.

> **Numbering.** Built in parallel with plan 15 (live shopping), which was in flight in the main
> checkout at the time — hence 16 rather than 15. Both branches also appended to
> `docs/DECISIONS.md`, and both took "the next number". Resolved on merge in the flow's
> direction (`dev` merged into this branch, then fast-forwarded): plan 15 keeps **#135**, and
> this plan's entries became **#136–#137**, with every citation in `src`, `docs`, `.env.example`,
> the Dockerfile and `.claude/commands/` repointed line by line — the live-shopping files' own
> `#135` references are correct and were left alone.

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
- Docs: SPEC §6 + §9, DATA-MODEL (`feedback` + the sweep line), DECISIONS #136–#137,
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
  on content creation. The sweep is serial now (→ DECISIONS #136).
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

### The triage agent, verified live (2026-09-11)

Issue [#7](https://github.com/lukas-jungwirth/choreganized/issues/7) — a real idea, not a
throwaway — was filed and triaged end to end. The agent labelled it `idea` · `area:settings` ·
`size:s`, found the version row at `settings/+page.svelte:305` as a plain `<div class="row">`
next to a `<button class="row">`, **found a reuse precedent nobody had pointed it at**
(`copyLink()` in `onboarding/invite/+page.svelte:32-44`, try/catch and all), named the two i18n
keys, and noticed that the row's own comment — "A fact, not a control" — would stop being true.
Every claim was checked against the source and every one held. 54 s, 15 turns, about $0.19.

Three things cost a run each, and are written down so they don't cost another:

- **`--max-turns 20` was too tight.** The first successful-auth run spent all twenty reading the
  issue, deduping, grepping, and setting labels, and died before the comment — which is the
  entire output. Forty, plus a line in the prompt saying the comment is the point, brought it
  down to fifteen.
- **A `#` inside a `claude_args: |` block is not a comment.** It is literal text handed to the
  CLI as an argument. Explanatory comments go above `claude_args:`, never inside it.
- **`CLAUDE_CODE_OAUTH_TOKEN` fails silently on stray whitespace.** A token with a trailing
  newline or a copied space fails in ~1.9 s with `total_cost_usd: 0` and `modelUsage: {}` — no
  model call, no useful error, and the action hides the detail. That signature _is_ the
  diagnosis. Set it with `gh secret set CLAUDE_CODE_OAUTH_TOKEN --body "$(pbpaste | tr -d '\r\n ')"`,
  which also keeps the token out of shell history.

`workflow_dispatch` with an issue number exists so a prompt change can be retried on a real
issue instead of filing a throwaway one.

**Still not verified:** the app has never actually created an issue. That needs
`GITHUB_FEEDBACK_TOKEN` set in Coolify and a deploy; everything up to an authenticated 401 from
`api.github.com` is exercised, but the 201 path, the body as GitHub renders it, and the marker
search are not. Note also that **the repository is public**, so issues opened by people without
write access are not triaged — the action refuses non-write actors by default, which keeps
drive-by issues from spending subscription usage.
