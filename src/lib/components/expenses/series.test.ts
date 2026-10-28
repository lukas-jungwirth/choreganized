/**
 * How a series' rule is said [9h-stop] (→ series.ts): by its anchor day, not
 * by the date it happens to be parked on in a short month or a common year.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { catalog } from '$lib/i18n';
import { seriesRule } from './series';

const en = catalog('en');

describe('seriesRule', () => {
	it('a 29 Feb yearly series is "on Feb 29" while it waits on the 28th', () => {
		assert.equal(
			seriesRule(en, { unit: 'year', interval: 1, anchorDay: 29, nextDate: '2029-02-28' }),
			'Yearly on Feb 29'
		);
	});

	it('a monthly series of the 31st is "on the 31st" in November', () => {
		assert.equal(
			seriesRule(en, { unit: 'month', interval: 1, anchorDay: 31, nextDate: '2026-11-30' }),
			'Monthly on the 31st'
		);
	});

	it('a weekly series names its weekday', () => {
		assert.equal(
			seriesRule(en, { unit: 'week', interval: 1, anchorDay: null, nextDate: '2026-11-30' }),
			'Every Monday'
		);
	});

	it('counts an interval, and calls three months a quarter', () => {
		const rule = (unit: 'week' | 'month' | 'year', interval: number) =>
			seriesRule(en, {
				unit,
				interval,
				anchorDay: unit === 'week' ? null : 1,
				nextDate: '2026-11-30'
			});
		assert.equal(rule('week', 2), 'Every 2 weeks on Monday');
		assert.equal(rule('month', 2), 'Every 2 months on the 1st');
		assert.equal(rule('month', 3), 'Quarterly on the 1st');
		assert.equal(rule('year', 2), 'Every 2 years on Nov 1');
		assert.equal(
			seriesRule(catalog('de'), {
				unit: 'month',
				interval: 6,
				anchorDay: 1,
				nextDate: '2026-11-30'
			}),
			'Alle 6 Monate am 1.'
		);
	});
});
