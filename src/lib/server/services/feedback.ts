/**
 * Feedback: a bug or an idea, written inside the app (→ SPEC §6, plan 16).
 *
 * **The row is the receipt; the issue is a copy of it** (→ DECISIONS #136). One
 * synchronous insert is the whole of what the member's tap depends on, and the
 * GitHub call happens afterwards — fired and forgotten from the action, the way
 * a push send is (→ ARCHITECTURE "Notifications"), with the minute cron sweep as
 * the restart-safe catch-up. The two mechanisms are the same shape as a cook
 * timer's `setTimeout` and its sweep (→ DECISIONS #15), and for the same reason:
 * the fast path is the common one, and the slow one is what makes losing it
 * harmless.
 *
 * So a GitHub outage, a token nobody has configured yet, or a deploy landing
 * mid-request costs a *sync*, never a report. Nothing here throws out of the
 * mirror path: an unhandled rejection from a `void`-ed promise takes the Node
 * process down, which is why `push.ts` opens with the same rule.
 *
 * The member's words are household content — stored and posted byte-for-byte,
 * never translated (→ SPEC §9). The envelope around them is English on purpose:
 * it is a triage instrument read by one person on GitHub, not copy read by a
 * member in the app, so it does *not* come from `$lib/i18n`. A report whose
 * field labels change language depending on who filed it is worse to triage,
 * not better.
 */
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import type { Locale } from '$lib/i18n';
import type { Theme } from '$lib/theme';
import {
	codeFenceFor,
	feedbackTitle,
	FEEDBACK_BODY_MAX,
	type FeedbackKind
} from '$lib/utils/feedback';
import { db } from '../db';
import { feedback, members, type Feedback } from '../db/schema';
import {
	createIssue,
	findIssueByMarker,
	githubConfigured,
	GitHubError,
	type NewIssue
} from '../github';
import { appVersion } from '../version';

export type NewFeedback = {
	kind: FeedbackKind;
	/** As typed — trimmed and length-checked by the action, never rewritten here. */
	body: string;
	/** The language it was written in (→ `event.locals.locale`). */
	locale: Locale;
	/** The appearance it was written on, or null for "follow the device". */
	theme: Theme | null;
	/** Verbatim request header, or null when the browser sent none. */
	userAgent: string | null;
};

export type FeedbackErrorCode =
	/** Removed from the household between opening the sheet and sending it. */
	'not-member';

export class FeedbackError extends Error {
	constructor(readonly code: FeedbackErrorCode) {
		super(code);
		this.name = 'FeedbackError';
	}
}

/**
 * How many times a report may fail to mirror before it is parked.
 *
 * With the backoff below that is a bit over a day of trying, which comfortably
 * outlasts an outage and stops well short of a row that retries forever. A
 * parked row is not lost — it is still the receipt, still readable in the
 * database, and the next deploy requeues it (→ `sweepFeedback`).
 */
const MAX_ATTEMPTS = 8;

/** First retry five minutes out; doubling, capped at six hours. */
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_CAP_MS = 6 * 60 * 60 * 1000;

/* ── Writing ──────────────────────────────────────────────────────────────── */

/**
 * Write the report. One insert, synchronous, and the only thing the member's
 * tap depends on.
 *
 * The display name is snapshotted here rather than passed in: a snapshot is a
 * data concern and belongs next to the write, and reading the membership is
 * also what proves the member is still in this household.
 */
export function submitFeedback(
	householdId: string,
	memberId: string,
	input: NewFeedback,
	now: Date = new Date()
): Feedback {
	const member = db
		.select({ displayName: members.displayName })
		.from(members)
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.get();

	if (!member) throw new FeedbackError('not-member');

	return db
		.insert(feedback)
		.values({
			householdId,
			memberId,
			memberName: member.displayName,
			kind: input.kind,
			// Capped here as well as in the action, the way `startTimer` repairs its
			// own label: a body past GitHub's 65536-character issue limit comes back
			// 422 → `rejected` → not retryable, i.e. a report that never lands.
			body: input.body.slice(0, FEEDBACK_BODY_MAX),
			locale: input.locale,
			theme: input.theme,
			appVersion: appVersion().label,
			userAgent: input.userAgent,
			createdAt: now,
			// Due immediately: the fire-and-forget call is about to claim it, and
			// if that never happens the next sweep finds it already eligible.
			nextAttemptAt: now
		})
		.returning()
		.get();
}

/* ── Mirroring ────────────────────────────────────────────────────────────── */

/**
 * Mirror one report to GitHub. Household-scoped like everything else — a
 * feedback id from another household must find nothing — and never throws: the
 * row is the receipt, and a failure is a `lastError` plus a later attempt.
 *
 * @returns the issue number, or `null` when it didn't land this time.
 */
export async function syncFeedback(
	householdId: string,
	feedbackId: string,
	now: Date = new Date()
): Promise<number | null> {
	// The belt that keeps this file's "nothing here throws" contract true, and
	// the reason the action can say `void syncFeedback(…)` (→ `push.ts`, which
	// carries the same one). `mirror` handles the API; what this catches is the
	// database refusing a read or a write — SQLITE_BUSY behind the nightly
	// backup, a full disk — which would otherwise become an unhandled rejection
	// and, under Node's default, take the whole process down.
	try {
		if (!githubConfigured()) return null;

		const row = db
			.select()
			.from(feedback)
			.where(and(eq(feedback.id, feedbackId), eq(feedback.householdId, householdId)))
			.get();

		if (!row) return null;

		return await mirror(row, now);
	} catch (error) {
		console.error('[feedback] could not mirror a report:', error);
		return null;
	}
}

export type FeedbackSweep = {
	/** Reports that got an issue this pass — normally 0. */
	synced: number;
	/** Reports whose attempt failed and will be tried again, or parked. */
	failed: number;
};

/**
 * The restart-safe half, on the minute tick (→ `cron.ts`).
 *
 * Deliberately **not** per household, for the same reason `sweepCookTimers`
 * isn't: "GitHub was down" is not a time of day, so there is no household clock
 * to consult — and the rows carry their own household anyway.
 *
 * On the first pass of a process it also un-parks whatever gave up earlier. A
 * report parks on a permanent refusal — a bad token, a repository the token
 * can't see, a label that doesn't exist — and every one of those is fixed by
 * changing configuration and redeploying. A redeploy is exactly this moment, so
 * it is the one moment worth trying again.
 */
export async function sweepFeedback(now: Date = new Date()): Promise<FeedbackSweep> {
	if (!githubConfigured()) return { synced: 0, failed: 0 };

	let synced = 0;
	let failed = 0;

	// The same belt `syncFeedback` carries. `mirror` already swallows an
	// attempt's own failure; this is for the reads and writes around it, so the
	// counts collected before a database error still come back. `cron.ts`'s
	// guard would catch a throw, but the contract belongs to this file rather
	// than to its one caller.
	try {
		if (!requeuedOnBoot) {
			requeuedOnBoot = true;
			requeueParked(now);
		}

		const due = db
			.select()
			.from(feedback)
			.where(
				and(
					isNull(feedback.issueNumber),
					lte(feedback.nextAttemptAt, now),
					// Keeps parked rows out of the scan; `claim` enforces the same cap
					// as the actual guarantee. Nothing ages out on time — a report from
					// last week is still worth filing — so there is deliberately no
					// lower bound on `nextAttemptAt` to pair with the one above.
					lte(feedback.attempts, MAX_ATTEMPTS - 1)
				)
			)
			.orderBy(asc(feedback.nextAttemptAt))
			.all();

		// **One at a time, not `Promise.all`.** GitHub meters content creation
		// separately from the ordinary rate limit and asks for it serially; firing
		// a backlog at it concurrently is how an outage that has just ended becomes
		// a secondary rate limit, with every row backing off together. A sweep is
		// not in anybody's way, so it can afford to be patient.
		for (const row of due) {
			if ((await mirror(row, now)) === null) failed++;
			else synced++;
		}
	} catch (error) {
		console.error('[feedback] sweep failed:', error);
	}

	return { synced, failed };
}

/** Set once per process — see `sweepFeedback`. */
let requeuedOnBoot = false;

/**
 * One attempt at one row: claim it, then call. Returns the issue number, or
 * `null` for both "somebody else has it" and "that didn't work" — neither is
 * something a caller can act on differently.
 */
async function mirror(row: Feedback, now: Date): Promise<number | null> {
	if (!claim(row, now)) return null;

	try {
		// A previous attempt may have created the issue and lost the response on
		// the way back. Ask before writing a second one — best effort, because
		// GitHub's search index lags (→ `github.ts`).
		const existing = row.attempts > 0 ? await findIssueByMarker(marker(row.id)) : null;
		const issue = existing ?? (await createIssue(issueFor(row)));

		db.update(feedback)
			.set({ issueNumber: issue.number, syncedAt: now, lastError: null })
			.where(eq(feedback.id, row.id))
			.run();

		return issue.number;
	} catch (cause) {
		park(row, cause, now);
		return null;
	}
}

/**
 * Take ownership of this attempt, *before* the call rather than after.
 *
 * Conditional on the row still being unmirrored and still being due, so the
 * fire-and-forget call and a sweep tick landing together cost one attempt
 * rather than two issues. Whoever loses sees `changes === 0` and stops — the
 * same shape `cook-timers.ts` and `reminders.ts` use.
 *
 * The next slot is booked here too, so a call that hangs until the timeout
 * doesn't leave the row eligible for the tick a minute later.
 */
function claim(row: Feedback, now: Date): boolean {
	const spent = row.attempts + 1;

	const result = db
		.update(feedback)
		.set({
			attempts: sql`${feedback.attempts} + 1`,
			nextAttemptAt: new Date(now.getTime() + backoffMs(spent))
		})
		.where(
			and(
				eq(feedback.id, row.id),
				isNull(feedback.issueNumber),
				lte(feedback.nextAttemptAt, now),
				// The cap lives here rather than only in the sweep's query, because
				// this is the one line every path goes through: `syncFeedback` is
				// exported and reaches `mirror` directly, so a caller that isn't the
				// sweep must not be able to keep retrying a parked row for ever.
				lte(feedback.attempts, MAX_ATTEMPTS - 1)
			)
		)
		.run();

	return result.changes === 1;
}

/**
 * Record why an attempt failed, and stop early when trying again cannot help.
 *
 * A permanent refusal jumps straight to the cap rather than spending a day
 * proving the point — a token the repository has refused will refuse the next
 * seven calls too. Anything else keeps the slot `claim` already booked, unless
 * GitHub named its own (a rate limit's `retry-after`), which outranks ours.
 *
 * Only the error *code* is stored. A response body can quote the request that
 * produced it, token and all (→ `github.ts`).
 */
function park(row: Feedback, cause: unknown, now: Date): void {
	const failure = cause instanceof GitHubError ? cause : null;
	const permanent = failure !== null && !failure.retryable;

	// `github.ts` only ever throws `GitHubError`, so anything else came from this
	// file — a bad assembly, or the database refusing the write that records
	// success. Calling that 'unreachable' would point the next person at the
	// network, and swallowing it entirely would leave a real bug retrying three
	// times a day in silence.
	if (!failure) console.error('[feedback] mirror failed unexpectedly:', cause);

	db.update(feedback)
		.set({
			lastError: failure ? failure.code : 'internal',
			...(permanent ? { attempts: MAX_ATTEMPTS } : {}),
			...(failure?.retryAfterMs
				? { nextAttemptAt: new Date(now.getTime() + failure.retryAfterMs) }
				: {})
		})
		.where(eq(feedback.id, row.id))
		.run();
}

/** Give every parked report one more go — see `sweepFeedback`. */
function requeueParked(now: Date): void {
	const revived = db
		.update(feedback)
		.set({ attempts: 0, nextAttemptAt: now })
		.where(and(isNull(feedback.issueNumber), gte(feedback.attempts, MAX_ATTEMPTS)))
		.run();

	if (revived.changes > 0) {
		console.log(`[feedback] requeued ${revived.changes} parked report(s) after a restart`);
	}
}

/** Five minutes, doubling, capped — `spent` is the attempt just used. */
function backoffMs(spent: number): number {
	return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, spent - 1), RETRY_CAP_MS);
}

/* ── The issue ────────────────────────────────────────────────────────────── */

/**
 * What GitHub receives. English scaffolding around a report that is never
 * translated — see this file's header for why the two differ.
 *
 * Only labels that already exist on the repository (→ `github.ts`).
 */
function issueFor(row: Feedback): NewIssue {
	return {
		title: `${row.kind === 'bug' ? 'Bug' : 'Idea'}: ${feedbackTitle(row.body)}`,
		body: bodyFor(row),
		labels: [row.kind]
	};
}

function bodyFor(row: Feedback): string {
	const fence = codeFenceFor(row.body);

	return [
		`**${row.memberName}** sent this from Choreganized.`,
		'',
		`${fence}text`,
		row.body,
		fence,
		'',
		`- **Reported by** ${row.memberName}`,
		`- **When** ${row.createdAt.toISOString()}`,
		`- **Language** ${row.locale}`,
		`- **Appearance** ${row.theme ?? 'system'}`,
		`- **App version** ${row.appVersion}`,
		`- **User agent** ${row.userAgent ? `\`${row.userAgent}\`` : '—'}`,
		'',
		`<!-- ${marker(row.id)} -->`
	].join('\n');
}

/**
 * The needle `findIssueByMarker` searches for — this report's id, in an HTML
 * comment so it is invisible in the rendered issue.
 */
function marker(feedbackId: string): string {
	return `choreganized:${feedbackId}`;
}
