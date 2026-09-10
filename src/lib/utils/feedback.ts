/**
 * What a feedback report is made of (→ SPEC §6, plan 16).
 *
 * The kinds and the field limits live here rather than on the screen that
 * writes them, so the `maxlength` attribute and the action's guard are the same
 * number — the way `utils/household.ts` and `utils/tasks.ts` do it.
 */

/** The two things [6a] asks: something broken, or something wished for. */
export const FEEDBACK_KINDS = ['bug', 'idea'] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export function isFeedbackKind(value: unknown): value is FeedbackKind {
	return typeof value === 'string' && (FEEDBACK_KINDS as readonly string[]).includes(value);
}

/**
 * Long enough for a real bug report — what happened, what was expected, what
 * was on screen — and short enough that a mis-paste doesn't become an issue
 * body nobody can read.
 *
 * Duplicated as a comment on `feedback.body` in `server/db/schema.ts`: the
 * column is TEXT and enforces nothing, so this is the only limit there is.
 */
export const FEEDBACK_BODY_MAX = 2000;

/**
 * How much of the first line becomes the issue title. GitHub's own cap is 256;
 * this is what still reads as a title in a list rather than as a paragraph that
 * ran out of room.
 */
export const FEEDBACK_TITLE_MAX = 72;

/**
 * The issue title a report becomes: its first line, whitespace collapsed, cut
 * to `FEEDBACK_TITLE_MAX` — a title in a list, not a paragraph that ran out of
 * room. The `Bug:` / `Idea:` prefix is the caller's (→ `services/feedback.ts`).
 *
 * Total, rather than trusting its caller: the form action guarantees a trimmed,
 * non-empty body today, but an empty title is a 422 from GitHub, which is not
 * retryable, which is a report that never lands.
 */
export function feedbackTitle(body: string): string {
	const line = body.split('\n')[0].replace(/\s+/g, ' ').trim();
	if (!line) return 'No description';

	return line.length > FEEDBACK_TITLE_MAX
		? `${line.slice(0, FEEDBACK_TITLE_MAX - 1).trimEnd()}…`
		: line;
}

/**
 * The fence a report is quoted inside — always longer than the longest run of
 * backticks in it, so nothing in the body can close it early.
 *
 * Not cosmetic, which is why it lives out here with a test rather than inside
 * the service: a `@name` in a bug report must not ping a stranger, a stray
 * `#12` must not cross-link somebody else's issue, and markdown or HTML in the
 * text must not rearrange the envelope around it (→ DECISIONS #135).
 */
export function codeFenceFor(body: string): string {
	const longest = [...body.matchAll(/`+/g)].reduce((max, run) => Math.max(max, run[0].length), 0);

	return '`'.repeat(Math.max(3, longest + 1));
}
