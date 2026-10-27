/**
 * Calendar arithmetic for recurring expenses (→ utils/dates.ts `addRepeat`,
 * SPEC §11.9): a series keeps the day it started on, through short months and
 * leap years, instead of drifting to the shortest month's last day for good.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { addRepeat } from './dates';

function series(
	start: string,
	unit: 'week' | 'month' | 'year',
	count: number,
	anchorDay: number | null = null
): string[] {
	const dates = [start];
	while (dates.length < count) dates.push(addRepeat(dates.at(-1)!, unit, anchorDay));
	return dates;
}

describe('addRepeat', () => {
	it('a monthly series from the 31st clamps to short months and comes back', () => {
		assert.deepEqual(series('2026-01-31', 'month', 5, 31), [
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
			'2026-04-30',
			'2026-05-31'
		]);
	});

	it('crosses the year', () => {
		assert.deepEqual(series('2026-11-30', 'month', 4, 30), [
			'2026-11-30',
			'2026-12-30',
			'2027-01-30',
			'2027-02-28'
		]);
	});

	it('a yearly series from 29 Feb lands on 28 Feb, then on 29 Feb again in a leap year', () => {
		assert.deepEqual(series('2028-02-29', 'year', 6, 29), [
			'2028-02-29',
			'2029-02-28',
			'2030-02-28',
			'2031-02-28',
			'2032-02-29',
			'2033-02-28'
		]);
	});

	it('weekly is seven days, across a month and a DST change', () => {
		assert.deepEqual(series('2026-10-21', 'week', 3), ['2026-10-21', '2026-10-28', '2026-11-04']);
	});

	it('without an anchor, reads the day off the date', () => {
		assert.equal(addRepeat('2026-01-15', 'month', null), '2026-02-15');
		assert.equal(addRepeat('2026-01-31', 'month', null), '2026-02-28');
	});
});
