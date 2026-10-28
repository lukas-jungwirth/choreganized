/**
 * All activity's time presets (→ utils/expense-history.ts, SPEC §11.12): the
 * dates each covers and whether it groups by day.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { historyPeriod, parseHistoryCategories } from './expense-history';

describe('historyPeriod', () => {
	const today = '2026-03-10';

	it('covers whole calendar months and years, grouping a month by day', () => {
		assert.deepEqual(historyPeriod('all', today), { from: null, to: null, byDay: false });
		assert.deepEqual(historyPeriod('thisMonth', today), {
			from: '2026-03-01',
			to: '2026-03-31',
			byDay: true
		});
		assert.deepEqual(historyPeriod('lastMonth', today), {
			from: '2026-02-01',
			to: '2026-02-28',
			byDay: true
		});
		assert.deepEqual(historyPeriod('last3Months', today), {
			from: '2026-01-01',
			to: '2026-03-31',
			byDay: false
		});
		assert.deepEqual(historyPeriod('thisYear', today), {
			from: '2026-01-01',
			to: '2026-12-31',
			byDay: false
		});
	});

	it('crosses the turn of the year', () => {
		assert.deepEqual(historyPeriod('lastMonth', '2026-01-15'), {
			from: '2025-12-01',
			to: '2025-12-31',
			byDay: true
		});
		assert.equal(historyPeriod('last3Months', '2026-01-15').from, '2025-11-01');
	});

	it('takes picked dates in either order, by day up to a month', () => {
		assert.deepEqual(historyPeriod('custom', today, '2026-02-20', '2026-02-01'), {
			from: '2026-02-01',
			to: '2026-02-20',
			byDay: true
		});
		assert.equal(historyPeriod('custom', today, '2026-01-01', '2026-01-31').byDay, true);
		assert.equal(historyPeriod('custom', today, '2026-01-01', '2026-02-01').byDay, false);
		assert.deepEqual(historyPeriod('custom', today, '2026-02-01', null), {
			from: '2026-02-01',
			to: null,
			byDay: false
		});
	});
});

describe('parseHistoryCategories', () => {
	it('keeps the known ones once each, in the sheet’s order', () => {
		assert.deepEqual(parseHistoryCategories(['payments', 'bogus', 'groceries', 'groceries']), [
			'groceries',
			'payments'
		]);
		assert.deepEqual(parseHistoryCategories([]), []);
	});
});
