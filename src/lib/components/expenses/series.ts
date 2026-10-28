/**
 * How a recurring series is said [9h] [9h-stop] (→ SPEC §11.9): its rule —
 * "Monthly on the 1st", "Every Monday", "Every 2 months on the 15th", "Yearly
 * on Mar 12" — and the short form a list row uses, "Monthly · next Dec 1". The
 * words are the catalog's; this only picks which ones, from the series' unit,
 * interval and anchor.
 */
import type { Messages } from '$lib/i18n';
import type { SeriesItem } from '$lib/server/services/expense-recurrences';
import type { CalendarDate } from '$lib/utils/dates';

type Series = Pick<SeriesItem, 'unit' | 'interval' | 'anchorDay' | 'nextDate'>;

export function seriesRule(m: Messages, series: Series): string {
	const { rule } = m.expenses.recurring;
	if (series.unit === 'week')
		return rule.week(m.date.weekdayLong(series.nextDate), series.interval);
	// The anchor, not the next date's day: a series of the 31st parked on 30 Nov
	// is still "on the 31st".
	if (series.unit === 'month')
		return rule.month(series.anchorDay ?? Number(series.nextDate.slice(8)), series.interval);
	// Named on a leap year, so a series of 29 Feb says so even while it is
	// parked on the 28th.
	const day = String(series.anchorDay ?? Number(series.nextDate.slice(8))).padStart(2, '0');
	return rule.year(m.date.short(`2000-${series.nextDate.slice(5, 7)}-${day}`), series.interval);
}

export function seriesSchedule(m: Messages, series: Series, today: CalendarDate): string {
	return m.expenses.recurring.schedule(
		m.expenses.form.repeat(series.unit, series.interval),
		m.date.shortAuto(series.nextDate, today)
	);
}
