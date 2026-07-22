/**
 * Household-local calendar dates.
 *
 * Due dates, meal dates and away-until are *calendar* concepts ("dinner on
 * Thursday"), stored as 'YYYY-MM-DD' TEXT in `households.timezone` — they are
 * never round-tripped through a UTC `Date` (→ docs/DATA-MODEL.md "Core
 * principles"). Instants (completions, checks, reminders, timers) stay ms
 * timestamps. The two only meet in `zonedStartOfDay`.
 *
 * Reading the clock is `Intl`-based: no timezone database of our own. The
 * calendar arithmetic below is date-fns on a *detached* date — see `atNoon` —
 * so adding a month never consults a timezone at all. Plan 02 added the helpers
 * Home needs, plan 04 the recurrence math; extend this file rather than
 * starting a second one.
 */
import { addDays as shiftDays, addMonths, addWeeks } from 'date-fns';

/** A household-local calendar date, 'YYYY-MM-DD'. Lexicographic order = chronological order. */
export type CalendarDate = string;

/** What a recurring task repeats on. `'none'` (one-off) lives in `$lib/utils/tasks`. */
export type IntervalUnit = 'day' | 'week' | 'month';

const DAY_MS = 86_400_000;

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
 * Which day of the week `date` falls on, **Monday = 0** (→ SPEC §8: "weeks start
 * Monday"). Read off a UTC midnight, so no timezone gets a say in it — the day
 * of the week is a property of the calendar date itself.
 */
export function weekdayIndex(date: CalendarDate): number {
	return (atUtcMidnight(date).getUTCDay() + 6) % 7;
}

/** The Monday of `date`'s week — where the Cooking tab's 7-day strip starts. */
export function startOfWeek(date: CalendarDate): CalendarDate {
	return addDays(date, -weekdayIndex(date));
}

/* ── Calendar arithmetic ──────────────────────────────────────────────────── */

/**
 * `date` moved by `count` × `unit` — the recurrence step (→ docs/DATA-MODEL.md
 * "Completion algorithm"). Months clamp the way date-fns clamps them: a task
 * due on the 31st and repeating monthly lands on the 28th in February and on
 * the 31st again in March, rather than drifting three days earlier each spring.
 */
export function addInterval(date: CalendarDate, count: number, unit: IntervalUnit): CalendarDate {
	const at = atNoon(date);
	const moved =
		unit === 'day'
			? shiftDays(at, count)
			: unit === 'week'
				? addWeeks(at, count)
				: addMonths(at, count);

	return toCalendarString(moved);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
	return addInterval(date, days, 'day');
}

/**
 * Whole days from `from` to `to` — negative when `to` is in the past. Both are
 * read as UTC midnights, which have no DST to lose an hour to, so the division
 * is exact for any pair of calendar dates.
 */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
	return (atUtcMidnight(to).getTime() - atUtcMidnight(from).getTime()) / DAY_MS;
}

/* ── Rendering a calendar date ────────────────────────────────────────────── */

/** "Jul 14" — the design's date shorthand [3b] [4b] [4d]. */
export function formatShortDate(date: CalendarDate, withYear = false): string {
	return formatter(withYear ? 'short-year' : 'short', 'en-US', {
		timeZone: 'UTC',
		month: 'short',
		day: 'numeric',
		...(withYear ? { year: 'numeric' } : {})
	}).format(atUtcMidnight(date));
}

/** "Sat" — how a due date inside the coming week reads [4a]. */
export function formatWeekday(date: CalendarDate): string {
	return formatter('weekday', 'en-US', { timeZone: 'UTC', weekday: 'short' }).format(
		atUtcMidnight(date)
	);
}

/** "MON" — the Cooking tab's day strip and meal rows [04]. */
export function formatWeekdayShort(date: CalendarDate): string {
	return formatWeekday(date).toUpperCase();
}

/** "Thursday" — the plan-a-meal sheet's title [3d]. */
export function formatWeekdayLong(date: CalendarDate): string {
	return formatter('weekday-long', 'en-US', { timeZone: 'UTC', weekday: 'long' }).format(
		atUtcMidnight(date)
	);
}

/** The day of the month without its leading zero — "14", the strip's number [04]. */
export function dayOfMonth(date: CalendarDate): string {
	return String(Number(date.slice(8)));
}

/**
 * What month a span of days is in: "July" while it stays in one, "Jun – Jul"
 * when the week straddles two. The Cooking header shows this beside "This week"
 * [04], where a week that crosses the turn of the month would otherwise be
 * labelled with whichever end we happened to pick.
 */
export function formatMonthRange(from: CalendarDate, to: CalendarDate): string {
	const sameMonth = from.slice(0, 7) === to.slice(0, 7);
	const style = sameMonth ? 'long' : 'short';
	const month = (date: CalendarDate) =>
		formatter(`month-${style}`, 'en-US', { timeZone: 'UTC', month: style }).format(
			atUtcMidnight(date)
		);

	return sameMonth ? month(from) : `${month(from)} – ${month(to)}`;
}

/** "Mon 14 Jul" — the history feed's day stamp [05]. */
export function formatDayStamp(date: CalendarDate): string {
	return formatter('day-stamp', 'en-GB', {
		timeZone: 'UTC',
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(atUtcMidnight(date));
}

/**
 * The due half of a task's meta line (→ SPEC §5.1): "due today", "due
 * tomorrow", "in 2 days", "3 days overdue", "Sat", "Jul 14".
 *
 * [4a] draws both "in 2 days" (a task due in two) and "Sat" (one due in four),
 * so the switch from counting days to naming the day sits between them; past a
 * week a weekday name stops being unambiguous and the date takes over. The year
 * only appears when it isn't this one — "Jul 14" a year out would be a lie by
 * omission.
 */
export function formatDueMeta(dueDate: CalendarDate, today: CalendarDate): string {
	const days = daysBetween(today, dueDate);

	if (days < 0) return days === -1 ? '1 day overdue' : `${-days} days overdue`;
	if (days === 0) return 'due today';
	if (days === 1) return 'due tomorrow';
	if (days <= 3) return `in ${days} days`;
	if (days <= 6) return formatWeekday(dueDate);

	return formatShortDate(dueDate, dueDate.slice(0, 4) !== today.slice(0, 4));
}

/**
 * A date the way a picker labels it — "Today · Jul 17", "Tomorrow · Jul 17",
 * "Sat · Jul 19", "Jul 24" [3b] [4c]. Same near/far split as `formatDueMeta`,
 * but always carrying the date itself: this labels a value you are choosing,
 * where "in 2 days" alone would leave you counting.
 */
export function formatDateLabel(date: CalendarDate, today: CalendarDate): string {
	const days = daysBetween(today, date);
	const short = formatShortDate(date, date.slice(0, 4) !== today.slice(0, 4));

	if (days === 0) return `Today · ${short}`;
	if (days === 1) return `Tomorrow · ${short}`;
	if (days === -1) return `Yesterday · ${short}`;
	if (days > 1 && days <= 6) return `${formatWeekday(date)} · ${short}`;

	return short;
}

/** Is this a well-formed 'YYYY-MM-DD' that names a real day? */
export function isCalendarDate(value: unknown): value is CalendarDate {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	// Round-trips only if the day exists: '2026-02-31' comes back as '2026-03-03'.
	return toCalendarString(atNoon(value)) === value;
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
	const [year, month, day] = parseParts(date);
	const wallClock = Date.UTC(year, month - 1, day);

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

/**
 * The wall clock in `timezone` right now. Cron jobs gate on this: a household's
 * "03:30" is data, not a cron expression, so the sweep runs every minute and
 * asks each household what time it is (→ `lib/server/cron.ts`).
 */
export function clockIn(
	timezone: string,
	now: Date = new Date()
): { hour: number; minute: number } {
	const parts = formatter(`clock|${timezone}`, 'en-GB', {
		timeZone: timezone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(now);

	return { hour: numberPart(parts, 'hour'), minute: numberPart(parts, 'minute') };
}

/** Hour of day (0–23) in `timezone` — drives the time-of-day greeting. */
export function hourIn(timezone: string, now: Date = new Date()): number {
	return clockIn(timezone, now).hour;
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

	const asIfUtc = Date.UTC(
		numberPart(parts, 'year'),
		numberPart(parts, 'month') - 1,
		numberPart(parts, 'day'),
		numberPart(parts, 'hour'),
		numberPart(parts, 'minute'),
		numberPart(parts, 'second')
	);

	// The parts carry second precision, so compare against whole seconds.
	return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** One numeric field out of `formatToParts` — 0 when the format omitted it. */
function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
	return Number(parts.find((part) => part.type === type)?.value ?? 0);
}

/** '2026-07-17' → [2026, 7, 17]. NaNs for anything else; callers validate first. */
function parseParts(date: CalendarDate): [number, number, number] {
	const [year, month, day] = date.split('-').map(Number);
	return [year, month, day];
}

/**
 * `date` as a Date at the *runtime's* local noon — the value date-fns adds to.
 *
 * date-fns reads and writes its dates through `getMonth`/`setMonth`, i.e. in
 * whatever zone the process runs in, so the Date handed to it must be built the
 * same way (`new Date(y, m, d)`, never `Date.UTC`) or a server west of UTC
 * would read back the previous day. Noon rather than midnight because a handful
 * of zones skip midnight itself on the day they spring forward, and a date that
 * doesn't exist locally silently becomes 01:00 — harmless at noon, a day out at
 * midnight. Neither the household's timezone nor the server's ever reaches the
 * result: the day of the month goes in and comes back out.
 */
function atNoon(date: CalendarDate): Date {
	const [year, month, day] = parseParts(date);
	return new Date(year, month - 1, day, 12);
}

/** The inverse of `atNoon` — local Y/M/D back to 'YYYY-MM-DD'. */
function toCalendarString(at: Date): CalendarDate {
	const month = String(at.getMonth() + 1).padStart(2, '0');
	const day = String(at.getDate()).padStart(2, '0');
	return `${at.getFullYear()}-${month}-${day}`;
}

/** `date` pinned to UTC — for day counting and for `Intl` with `timeZone: 'UTC'`. */
function atUtcMidnight(date: CalendarDate): Date {
	const [year, month, day] = parseParts(date);
	return new Date(Date.UTC(year, month - 1, day));
}
