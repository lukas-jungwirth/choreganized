/**
 * Keeping to the schedule (→ utils/dates.ts `nextOnSchedule`, SPEC §5.2, plan
 * 39): a recurring task's next date comes from the calendar, not from the day
 * it was done. The example is the sketch's: "Deep clean the kitchen", first due
 * Sunday 6 December 2026, monthly on the first Sunday.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { nextOnSchedule, weekOfMonth, type ScheduleBy } from './dates';

/** The schedule's dates from the anchor on, `count` of them. */
function dates(
	anchor: string,
	unit: 'week' | 'month',
	count: number,
	by: ScheduleBy = 'day',
	interval = 1
): string[] {
	const out = [anchor];
	while (out.length < count) out.push(nextOnSchedule(anchor, unit, interval, by, out.at(-1)!));
	return out;
}

describe('weekOfMonth', () => {
	it('counts weeks from the 1st', () => {
		assert.equal(weekOfMonth('2026-12-06'), 0);
		assert.equal(weekOfMonth('2026-12-07'), 0);
		assert.equal(weekOfMonth('2026-12-08'), 1);
		assert.equal(weekOfMonth('2026-12-21'), 2);
		assert.equal(weekOfMonth('2026-12-22'), 3);
	});

	it('calls the month’s last seven days the last week, never a fifth', () => {
		assert.equal(weekOfMonth('2026-12-25'), 'last');
		assert.equal(weekOfMonth('2026-12-31'), 'last');
		// The 22nd–24th of a 31-day month are still the fourth…
		assert.equal(weekOfMonth('2026-12-24'), 3);
		// …but February's 22nd is already in its last seven days.
		assert.equal(weekOfMonth('2027-02-22'), 'last');
	});
});

describe('nextOnSchedule, monthly on a weekday', () => {
	const next = (after: string) => nextOnSchedule('2026-12-06', 'month', 1, 'weekday', after);

	it('keeps to the first Sunday', () => {
		assert.deepEqual(dates('2026-12-06', 'month', 4, 'weekday'), [
			'2026-12-06',
			'2027-01-03',
			'2027-02-07',
			'2027-03-07'
		]);
	});

	it('done on the day, late or early: the date after the one it was due', () => {
		assert.equal(next('2026-12-06'), '2027-01-03');
		assert.equal(next('2026-12-08'), '2027-01-03');
		assert.equal(next('2026-12-05'), '2026-12-06');
	});

	it('done very late: skips to the next date still ahead, nothing piles up', () => {
		assert.equal(next('2027-01-15'), '2027-02-07');
		assert.equal(next('2027-06-30'), '2027-07-04');
	});

	it('keeps the last Sunday in every month', () => {
		assert.deepEqual(dates('2027-01-31', 'month', 4, 'weekday'), [
			'2027-01-31',
			'2027-02-28',
			'2027-03-28',
			'2027-04-25'
		]);
	});

	it('every 3 months on the second Tuesday', () => {
		assert.deepEqual(dates('2026-12-08', 'month', 3, 'weekday', 3), [
			'2026-12-08',
			'2027-03-09',
			'2027-06-08'
		]);
	});
});

describe('nextOnSchedule, monthly on a day', () => {
	it('keeps the 31st, clamped to a shorter month and never moved', () => {
		assert.deepEqual(dates('2027-01-31', 'month', 4), [
			'2027-01-31',
			'2027-02-28',
			'2027-03-31',
			'2027-04-30'
		]);
	});

	it('finds 29 February in a leap year', () => {
		assert.equal(nextOnSchedule('2027-01-29', 'month', 1, 'day', '2028-01-29'), '2028-02-29');
	});

	it('every 2 months from the 6th', () => {
		assert.deepEqual(dates('2026-12-06', 'month', 3, 'day', 2), [
			'2026-12-06',
			'2027-02-06',
			'2027-04-06'
		]);
	});
});

describe('nextOnSchedule, weekly', () => {
	it('keeps the weekday, done late or early', () => {
		const sunday = '2026-12-06';
		assert.equal(nextOnSchedule(sunday, 'week', 1, 'day', '2026-12-08'), '2026-12-13');
		assert.equal(nextOnSchedule(sunday, 'week', 1, 'day', '2026-12-13'), '2026-12-20');
		assert.equal(nextOnSchedule(sunday, 'week', 1, 'day', '2026-12-05'), sunday);
	});

	it('every 2 weeks steps over the off week', () => {
		assert.deepEqual(dates('2026-12-06', 'week', 3, 'day', 2), [
			'2026-12-06',
			'2026-12-20',
			'2027-01-03'
		]);
		assert.equal(nextOnSchedule('2026-12-06', 'week', 2, 'day', '2026-12-14'), '2026-12-20');
	});
});

describe('the schedule in words', () => {
	it('names the week of the month in German in the nominative: "erster Sonntag"', async () => {
		const { de } = await import('../i18n/messages/de');
		const first = { anchor: '2026-12-06', by: 'weekday' as const };
		const last = { anchor: '2026-12-27', by: 'weekday' as const };
		assert.equal(de.task.repeat('month', 1, first), 'Monatlich, erster Sonntag');
		assert.equal(de.task.repeat('month', 1, last), 'Monatlich, letzter Sonntag');
		assert.equal(de.task.repeat('week', 1, first), 'Wöchentlich, sonntags');
		assert.equal(de.task.repeat('month', 1, { ...first, by: 'day' }), 'Monatlich, am 6.');
	});

	it('and in English: "first Sunday", "Sundays", "on the 6th"', async () => {
		const { en } = await import('../i18n/messages/en');
		const first = { anchor: '2026-12-06', by: 'weekday' as const };
		assert.equal(en.task.repeat('month', 1, first), 'Monthly, first Sunday');
		assert.equal(en.task.repeat('week', 2, first), 'Every 2 weeks, Sundays');
		assert.equal(en.task.repeat('month', 1, { ...first, by: 'day' }), 'Monthly, on the 6th');
		assert.equal(en.task.repeat('month', 1, null), 'Monthly');
	});
});
