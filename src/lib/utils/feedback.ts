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
