/**
 * "Sauté the mushrooms for 8 minutes" → 480 seconds.
 *
 * Recipes are plain text — [3c] has no timer fields and never will
 * (→ DECISIONS #14) — so cook mode's timer chip is whatever it can read out of
 * the step someone typed. That makes this a *lenient reader of prose*, not a
 * parser of a format: it takes the first duration it recognises and ignores
 * everything else, because a step is a sentence and the rest of the sentence is
 * about food.
 *
 * The bias is deliberately towards **saying nothing**. A missing chip costs one
 * tap on "Set timer"; a chip that reads "180 min" off an oven temperature is a
 * ruined dinner. So a bare number never becomes a duration, single-letter units
 * other than `h` are not units, and anything longer than half a day is a typo.
 */

/** Below this there is nothing worth walking away from. */
export const MIN_TIMER_SECONDS = 5;

/** No dish needs longer, and a mis-read "1200 min" must not book the evening. */
export const MAX_TIMER_SECONDS = 12 * 60 * 60;

/** "400", "1.5", "1,5" — a comma is how half the world writes a decimal point. */
const NUMBER = String.raw`\d+(?:[.,]\d+)?`;

/**
 * "8–10", "8-10", "8 to 10", "8 or 10" — recipes hedge, and the design's own
 * example does ("8–10 minutes"). We take the *first* value: the timer is when to
 * come back and look, not when the pan is finished.
 */
const RANGE_TAIL = String.raw`(?:\s*(?:[-–—]|to|or)\s*${NUMBER})?`;

/**
 * Longest spelling first, so "hours" doesn't match as "h" and leave "ours"
 * behind. `\b` after the group is what keeps "hand" and "second helping" out —
 * and there is deliberately no `\b` *before* it, because "8h" has no boundary
 * between the digit and the unit.
 *
 * Bare `m` and `s` are missing on purpose: "5 m of dough" and "2 s" are far more
 * likely to be a length or a typo than a duration anyone wants a chip for.
 */
const UNIT = String.raw`(hours?|hrs?|h|minutes?|mins?|seconds?|secs?)`;

const UNIT_SECONDS: [RegExp, number][] = [
	[/^h/i, 3600],
	[/^m/i, 60],
	[/^s/i, 1]
];

const DURATION = new RegExp(String.raw`(${NUMBER})${RANGE_TAIL}\s*${UNIT}\b`, 'i');

/**
 * "1 h 30 min", "1 hour and 30 minutes" — the minutes have to follow the hours
 * *immediately* for them to be the same duration. A comma or another word means
 * a second instruction ("Chill 1 hour, then bake 30 minutes"), and adding those
 * together would be a 90-minute lie.
 */
const TRAILING_MINUTES = new RegExp(
	String.raw`^\s*(?:and\s+)?(${NUMBER})\s*(?:minutes?|mins?)\b`,
	'i'
);

/**
 * "8:00", "12:30" — a clock face is how a timer is written down, and the design
 * writes the chip that way too ("Start 8:00 timer"). Seconds are `[0-5]\d` so a
 * "1:1 ratio" isn't a duration.
 */
const CLOCK = /(?<![\d:])(\d{1,3}):([0-5]\d)(?![\d:])/;

/**
 * The first duration in a step, in whole seconds — or `null` when the step is
 * just cooking instructions.
 *
 * "First" is by position in the text, not by which pattern matched: "Bake 20 min
 * (set a 20:00 timer)" and "Set 8:00, then rest 5 min" both answer with what a
 * person reading left to right would have found.
 */
export function parseStepDuration(text: string): number | null {
	const clock = CLOCK.exec(text);
	const spelled = DURATION.exec(text);

	// Both patterns can match the same sentence; the earlier one is the one the
	// step is actually about.
	const useClock = clock && (!spelled || clock.index < spelled.index);

	const seconds = useClock
		? Number(clock[1]) * 60 + Number(clock[2])
		: spelled
			? spelledSeconds(spelled, text)
			: null;

	return seconds === null ? null : clamp(seconds);
}

function spelledSeconds(match: RegExpExecArray, text: string): number {
	const value = decimal(match[1]);
	const perUnit = UNIT_SECONDS.find(([unit]) => unit.test(match[2]))?.[1] ?? 60;
	const seconds = value * perUnit;

	// Only hours take a tail: "8 min 30 sec" is a precision no recipe needs, and
	// reading it would mean deciding whether "30" in "8 min 30 g" is seconds.
	if (perUnit !== 3600) return seconds;

	const rest = text.slice(match.index + match[0].length);
	const minutes = TRAILING_MINUTES.exec(rest);

	return minutes ? seconds + decimal(minutes[1]) * 60 : seconds;
}

function decimal(value: string): number {
	return Number(value.replace(',', '.'));
}

/**
 * Out of range answers `null` rather than the nearest legal value: a step that
 * says "24 hours" means "come back tomorrow", and a 12-hour timer would be a
 * worse answer than no timer at all. Rounded because `Math.round(1.5 * 60)`
 * beats storing 89.99999.
 */
function clamp(seconds: number): number | null {
	const whole = Math.round(seconds);
	if (!Number.isFinite(whole) || whole < MIN_TIMER_SECONDS || whole > MAX_TIMER_SECONDS) {
		return null;
	}
	return whole;
}

/**
 * Seconds as a clock — "8:00", "0:07", "1:30:00". The chip, the ring's big
 * numeral and its "{label} · {total}" line all read this way [7b] [7h].
 *
 * Negative input clamps to zero: a countdown that overshoots between two
 * animation frames should read "0:00", not "-0:01".
 */
export function formatDuration(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const rest = total % 60;

	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}
