/**
 * All activity's time filter [9f] (→ SPEC §11.12): which dates a preset covers,
 * and whether the list under it is grouped by day or by month. Shared by the
 * service that filters and the sheet that says "November · grouped by day",
 * so the two can't disagree.
 */
import { addDays, addInterval, daysBetween, startOfMonth, type CalendarDate } from './dates';

/** In the order the Time sheet lists them; `custom` is "Pick dates…". */
export const HISTORY_RANGES = [
	'all',
	'thisMonth',
	'lastMonth',
	'last3Months',
	'thisYear',
	'custom'
] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number];

export function isHistoryRange(value: unknown): value is HistoryRange {
	return HISTORY_RANGES.includes(value as HistoryRange);
}

/** "Payments only" sits at the end of the category list, as if it were one. */
export const PAYMENTS_ONLY = 'payments';

export type HistoryPeriod = {
	/** Inclusive; null is open-ended. */
	from: CalendarDate | null;
	to: CalendarDate | null;
	/** A month or less reads best a day at a time; anything longer, a month at a time. */
	byDay: boolean;
};

/** Longest span still grouped by day: the longest month. */
const DAY_GROUPING_MAX_DAYS = 31;

function endOfMonth(date: CalendarDate): CalendarDate {
	return addDays(addInterval(startOfMonth(date), 1, 'month'), -1);
}

/**
 * The dates `range` covers on `today`. Calendar presets run to the end of their
 * month or year, so an expense logged with a date later this month still counts
 * as this month's. `custom` takes `start`/`end` in either order, and either may
 * be missing.
 */
export function historyPeriod(
	range: HistoryRange,
	today: CalendarDate,
	start: CalendarDate | null = null,
	end: CalendarDate | null = null
): HistoryPeriod {
	const month = startOfMonth(today);
	switch (range) {
		case 'all':
			return { from: null, to: null, byDay: false };
		case 'thisMonth':
			return { from: month, to: endOfMonth(month), byDay: true };
		case 'lastMonth': {
			const last = addInterval(month, -1, 'month');
			return { from: last, to: endOfMonth(last), byDay: true };
		}
		case 'last3Months':
			return { from: addInterval(month, -2, 'month'), to: endOfMonth(month), byDay: false };
		case 'thisYear':
			return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31`, byDay: false };
		case 'custom': {
			const [from, to] = start && end && start > end ? [end, start] : [start, end];
			const byDay = from !== null && to !== null && daysBetween(from, to) < DAY_GROUPING_MAX_DAYS;
			return { from, to, byDay };
		}
	}
}
