/**
 * Household-local calendar dates.
 *
 * Due dates, meal dates and away-until are *calendar* concepts ("dinner on
 * Thursday"), stored as 'YYYY-MM-DD' TEXT in `households.timezone` — they are
 * never round-tripped through a UTC `Date` (→ docs/DATA-MODEL.md "Core
 * principles"). Instants (completions, checks, reminders, timers) stay ms
 * timestamps. The two only meet in `zonedStartOfDay`.
 *
 * Everything here is `Intl`-based: no timezone database of our own, no
 * dependency. Plan 02 added the helpers Home needs; later plans extend the file
 * (recurrence math, short date formatting) rather than starting a second one.
 */

/** A household-local calendar date, 'YYYY-MM-DD'. Lexicographic order = chronological order. */
export type CalendarDate = string;

/**
 * `Intl.DateTimeFormat` construction resolves a locale and spins up an ICU
 * formatter — orders of magnitude more expensive than formatting with one. A
 * household has a single timezone, so this cache holds a handful of entries for
 * the process's lifetime.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(
	key: string,
	locale: string,
	options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
	let cached = formatters.get(key);
	if (!cached) {
		cached = new Intl.DateTimeFormat(locale, options);
		formatters.set(key, cached);
	}
	return cached;
}

/** The calendar date an instant falls on in `timezone`. 'en-CA' formats as YYYY-MM-DD. */
export function toCalendarDate(instant: Date, timezone: string): CalendarDate {
	return formatter(`date|${timezone}`, 'en-CA', { timeZone: timezone }).format(instant);
}

/** Today, in the household's timezone. */
export function todayIn(timezone: string, now: Date = new Date()): CalendarDate {
	return toCalendarDate(now, timezone);
}

/** The first of `date`'s month — the leaderboard's month boundary. */
export function startOfMonth(date: CalendarDate): CalendarDate {
	return `${date.slice(0, 7)}-01`;
}

/**
 * The first instant of `date` in `timezone` — i.e. the smallest instant that
 * still reads as `date` on the household's clock.
 *
 * Guess the offset at the same wall-clock time read as UTC, then re-read the
 * offset at that guess. Away from a DST switch the two agree and either is the
 * answer. Around one they don't, and neither is safe on its own:
 *
 * - **Fall back** (clocks repeat): both candidates land on `date`, and the
 *   *earlier* one is where the day begins.
 * - **Spring forward across midnight** (America/Santiago, Havana, Asuncion):
 *   local 00:00 never happens, so the refined candidate rewinds into the
 *   previous day and must be discarded — the day starts an hour late, at the
 *   transition. Trusting the second pass here is what made the leaderboard
 *   count the last hour of the previous month.
 *
 * So: apply every offset in play around that midnight — the one at the naive
 * guess, the one at the instant that produces, and the one a day earlier (the
 * pre-transition offset, which is the only way to catch a fall-back that lands
 * just after midnight, as Asia/Gaza's does) — keep the results that really fall
 * on `date`, and take the earliest. If none do, midnight was skipped and the
 * latest candidate is where the day begins.
 *
 * Checked exhaustively against Intl for 18 timezones × 2020–2030.
 */
export function zonedStartOfDay(date: CalendarDate, timezone: string): Date {
	const [year, month, day] = date.split('-').map(Number);
	const wallClock = Date.UTC(year, month - 1, day);
	const DAY_MS = 86_400_000;

	const naive = wallClock - zoneOffsetMs(new Date(wallClock), timezone);
	const candidates = [
		naive,
		wallClock - zoneOffsetMs(new Date(naive), timezone),
		wallClock - zoneOffsetMs(new Date(naive - DAY_MS), timezone)
	];

	const onDate = candidates.filter(
		(instant) => toCalendarDate(new Date(instant), timezone) === date
	);

	return new Date(onDate.length ? Math.min(...onDate) : Math.max(...candidates));
}

/** Hour of day (0–23) in `timezone` — drives the time-of-day greeting. */
export function hourIn(timezone: string, now: Date = new Date()): number {
	const hour = formatter(`hour|${timezone}`, 'en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		hourCycle: 'h23'
	}).format(now);

	return Number(hour);
}

/** Clock time of an instant in `timezone`, 24h without a leading zero ("8:20"). */
export function formatTimeIn(instant: Date, timezone: string): string {
	return formatter(`time|${timezone}`, 'en-GB', {
		timeZone: timezone,
		hour: 'numeric',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(instant);
}

/**
 * How far `timezone` is ahead of UTC at `at`, in ms (Vienna in July → +2 h).
 * Reading the zone's wall clock back as if it were UTC gives exactly that gap.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`, which resolves to h24 on some
 * ICU builds and renders midnight as "24" — the one hour where that would put
 * the offset a day out.
 */
function zoneOffsetMs(at: Date, timezone: string): number {
	const parts = formatter(`offset|${timezone}`, 'en-GB', {
		timeZone: timezone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(at);

	const field = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value ?? 0);

	const asIfUtc = Date.UTC(
		field('year'),
		field('month') - 1,
		field('day'),
		field('hour'),
		field('minute'),
		field('second')
	);

	// The parts carry second precision, so compare against whole seconds.
	return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}
