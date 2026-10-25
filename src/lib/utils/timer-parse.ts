/**
 * "Sauté the mushrooms for 8 minutes" → 480 seconds.
 *
 * A step can carry a timer of its own, named and timed in the form [3c]
 * (→ DECISIONS #147, plan 21); cook mode uses that first. Every other step's
 * chip is whatever this can read out of the text someone typed. That makes this
 * a *lenient reader of prose*, not a parser of a format: it takes the first
 * duration it recognises and ignores everything else, because a step is a
 * sentence and the rest of the sentence is about food. It reads English and
 * German, because a household writes in both ("10 Minuten", "1 Std.").
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

/**
 * How many timers one person may have running at once (→ DECISIONS #102).
 *
 * Here rather than in the service for the same reason the bounds above are: the
 * chip that stands down and the transaction that refuses have to agree, and a
 * component cannot import from `$lib/server`.
 *
 * Three because that is what a kitchen watches — a pan, an oven and a kettle —
 * and because it is what the cook-mode column holds: one 220px ring plus two
 * compact bars above the Next button (→ DECISIONS #86).
 */
export const TIMERS_MAX = 3;

/**
 * How long a timer's name may be. Here rather than beside the service that
 * enforces it for the same reason `TIMERS_MAX` is: the sheet that offers the
 * field caps the input at the same number, and a component cannot import from
 * `$lib/server`. Long enough for the longest ingredient name the recipe form
 * accepts.
 */
export const TIMER_LABEL_MAX = 60;

/**
 * Where tapping a timer goes. The timer's own recipe, never the screen's — and
 * `/cooking` when that recipe has been deleted (`recipe_id` is ON DELETE set
 * null), which is the same fallback the push's `payloadFor` makes.
 *
 * `stepIndex` is 0-based in the column and 1-based in the URL.
 */
export function timerHref(recipeId: string | null, stepIndex: number | null): string {
	if (!recipeId) return '/cooking';

	return `/cooking/recipes/${recipeId}/cook` + (stepIndex === null ? '' : `?step=${stepIndex + 1}`);
}

/**
 * "400", "1.5", "1,5" — a comma is how half the world writes a decimal point —
 * and "1½", "1 ½", "½": German recipes write "1½ Std." as often as "1,5 Std.".
 */
const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?(?:\s?[½¼¾⅓⅔])?|[½¼¾⅓⅔])`;

const FRACTIONS: Record<string, number> = {
	'½': 0.5,
	'¼': 0.25,
	'¾': 0.75,
	'⅓': 1 / 3,
	'⅔': 2 / 3
};

/**
 * "8–10", "8-10", "8 to 10", "8 or 10", "8 bis 10" — recipes hedge, and the
 * design's own example does ("8–10 minutes"). The chip takes the *first* value:
 * the timer is when to come back and look, not when the pan is finished. The
 * second is captured too, for `stepDurations`.
 */
const RANGE_TAIL = String.raw`(?:\s*(?:[-–—]|to|or|bis|oder)\s*(${NUMBER}))?`;

/**
 * Longest spelling first, so "hours" doesn't match as "h" and leave "ours"
 * behind, and "Minuten" isn't read as "Minute" with an "n" left over. `\b`
 * after the group is what keeps "hand" and "second helping" out — and there is
 * deliberately no `\b` *before* it, because "8h" has no boundary between the
 * digit and the unit. Abbreviations match without their dot ("Min.", "Std."):
 * the boundary falls between the letter and the dot.
 *
 * Bare `m` and `s` are missing on purpose: "5 m of dough" and "2 s" are far more
 * likely to be a length or a typo than a duration anyone wants a chip for.
 */
const UNIT = String.raw`(stunden|stunde|std|hours?|hrs?|h|minuten|minute|minutes?|mins?|sekunden|sekunde|seconds?|secs?|sek)`;

/** Hours first: "Stunde" and "Std" start with an s, like the seconds do. */
const UNIT_SECONDS: [RegExp, number][] = [
	[/^(?:h|st)/i, 3600],
	[/^m/i, 60],
	[/^s/i, 1]
];

const DURATION = new RegExp(String.raw`(${NUMBER})${RANGE_TAIL}\s*${UNIT}\b`, 'i');

/**
 * "1 h 30 min", "1 hour and 30 minutes", "1 Std. 30 Min.", "1 Stunde und 30
 * Minuten" — the minutes have to follow the hours *immediately* for them to be
 * the same duration. A comma or another word means a second instruction
 * ("Chill 1 hour, then bake 30 minutes"), and adding those together would be a
 * 90-minute lie.
 */
const TRAILING_MINUTES = new RegExp(
	String.raw`^\.?\s*(?:(?:and|und)\s+)?(${NUMBER})\s*(?:minuten|minute|minutes?|mins?)\b`,
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

/**
 * Every duration a step states, in whole seconds, including **both** ends of a
 * range ("8–10 Minuten" → 480 and 600) — what an AI-made timer is checked
 * against before a draft keeps it (→ plan 22): a timer the text doesn't state
 * is a timer the model invented.
 */
export function stepDurations(text: string): number[] {
	const found = new Set<number>();
	const add = (seconds: number | null) => {
		const valid = seconds === null ? null : clamp(seconds);
		if (valid !== null) found.add(valid);
	};

	for (const match of text.matchAll(new RegExp(CLOCK.source, 'g'))) {
		add(Number(match[1]) * 60 + Number(match[2]));
	}

	// Minutes already counted as the tail of "1 Std. 30 Min." are not a second
	// duration of their own.
	let consumedUntil = 0;
	for (const match of text.matchAll(new RegExp(DURATION.source, 'gi'))) {
		if (match.index < consumedUntil) continue;
		add(spelledSeconds(match, text));
		if (match[2]) add(decimal(match[2]) * unitSeconds(match[3]));

		const tail = hoursTail(match, text);
		if (tail) consumedUntil = match.index + match[0].length + tail[0].length;
	}

	return [...found];
}

function unitSeconds(unit: string): number {
	return UNIT_SECONDS.find(([pattern]) => pattern.test(unit))?.[1] ?? 60;
}

function spelledSeconds(match: RegExpExecArray | RegExpMatchArray, text: string): number {
	const value = decimal(match[1]);
	const perUnit = unitSeconds(match[3]);
	const seconds = value * perUnit;

	const minutes = hoursTail(match, text);
	return minutes ? seconds + decimal(minutes[1]) * 60 : seconds;
}

/**
 * The minutes straight after an hours match, if any. Only hours take a tail:
 * "8 min 30 sec" is a precision no recipe needs, and reading it would mean
 * deciding whether "30" in "8 min 30 g" is seconds.
 */
function hoursTail(
	match: RegExpExecArray | RegExpMatchArray,
	text: string
): RegExpExecArray | null {
	if (unitSeconds(match[3]) !== 3600) return null;
	return TRAILING_MINUTES.exec(text.slice((match.index ?? 0) + match[0].length));
}

function decimal(value: string): number {
	const glyph = value.at(-1) ?? '';
	if (!(glyph in FRACTIONS)) return Number(value.replace(',', '.'));
	const whole = value.slice(0, -1).trim();
	return (whole ? Number(whole.replace(',', '.')) : 0) + FRACTIONS[glyph];
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
