/**
 * `npm test` — plain `node --test`, like the parsers beside it.
 *
 * Worth having as tests rather than as a walkthrough for two reasons. The
 * movable holidays are computed, so "it works this year" says nothing about the
 * next one — the dates below are checked against real calendars a decade out.
 * And the interesting half of `closureAhead` is the days it must stay *quiet*
 * on: a holiday that falls on a Sunday, a Sunday on its own, a run already
 * under way. Waiting for 1 November 2026 to find out is not a test plan.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	austrianHolidays,
	closureAhead,
	easterSunday,
	holidayOn,
	isShopClosed,
	observesAustrianHolidays
} from './holidays.ts';

describe('easterSunday', () => {
	it('matches the published dates', () => {
		assert.equal(easterSunday(2024), '2024-03-31');
		assert.equal(easterSunday(2025), '2025-04-20');
		assert.equal(easterSunday(2026), '2026-04-05');
		assert.equal(easterSunday(2027), '2027-03-28');
		assert.equal(easterSunday(2028), '2028-04-16');
		assert.equal(easterSunday(2029), '2029-04-01');
		assert.equal(easterSunday(2030), '2030-04-21');
		assert.equal(easterSunday(2035), '2035-03-25');
	});

	it('handles the extremes of the date it can land on', () => {
		// The earliest and latest Easter can fall in this century.
		assert.equal(easterSunday(2038), '2038-04-25');
		assert.equal(easterSunday(2285), '2285-03-22');
	});

	it('always lands on a Sunday', () => {
		for (let year = 2020; year <= 2100; year++) {
			const easter = easterSunday(year);
			assert.equal(new Date(`${easter}T00:00:00Z`).getUTCDay(), 0, `${year} → ${easter}`);
		}
	});
});

describe('austrianHolidays', () => {
	it('gives the twelve shop-closing days, in order', () => {
		assert.deepEqual(
			austrianHolidays(2026).map((holiday) => `${holiday.date} ${holiday.key}`),
			[
				'2026-01-01 newYear',
				'2026-01-06 epiphany',
				'2026-04-06 easterMonday',
				'2026-05-01 labourDay',
				'2026-05-14 ascension',
				'2026-05-25 whitMonday',
				'2026-06-04 corpusChristi',
				'2026-08-15 assumption',
				'2026-10-26 nationalDay',
				'2026-11-01 allSaints',
				'2026-12-25 christmas',
				'2026-12-26 stStephen'
			]
		);
	});

	it('moves the four that follow Easter, and leaves the eight that do not', () => {
		const holidays = new Map(austrianHolidays(2027).map((h) => [h.key, h.date]));

		// Easter 2027 is 28 March.
		assert.equal(holidays.get('easterMonday'), '2027-03-29');
		assert.equal(holidays.get('ascension'), '2027-05-06');
		assert.equal(holidays.get('whitMonday'), '2027-05-17');
		assert.equal(holidays.get('corpusChristi'), '2027-05-27');

		assert.equal(holidays.get('nationalDay'), '2027-10-26');
		assert.equal(holidays.get('christmas'), '2027-12-25');
	});

	it('keeps Ascension and Corpus Christi on a Thursday, whatever the year', () => {
		for (let year = 2020; year <= 2060; year++) {
			for (const key of ['ascension', 'corpusChristi'] as const) {
				const date = austrianHolidays(year).find((holiday) => holiday.key === key)?.date ?? '';
				assert.equal(new Date(`${date}T00:00:00Z`).getUTCDay(), 4, `${key} ${year} → ${date}`);
			}
		}
	});

	it('leaves out the two that look like holidays but do not shut a shop', () => {
		// 8 December: a public holiday, but shops may open and do.
		assert.equal(holidayOn('2026-12-08'), null);
		// Good Friday (Easter 2026 is 5 April): shops open.
		assert.equal(holidayOn('2026-04-03'), null);
	});
});

describe('isShopClosed', () => {
	it('shuts on Sundays and on holidays', () => {
		assert.equal(isShopClosed('2026-08-16'), true, 'a Sunday');
		assert.equal(isShopClosed('2026-10-26'), true, 'Nationalfeiertag, a Monday');
		assert.equal(isShopClosed('2026-08-14'), false, 'an ordinary Friday');
		assert.equal(isShopClosed('2026-12-24'), false, 'Christmas Eve — shops open, if not for long');
	});
});

describe('closureAhead', () => {
	it('announces a Monday holiday from the Thursday, through the Saturday', () => {
		// 26 October 2026 (Nationalfeiertag) is a Monday: shut Sun 25 + Mon 26,
		// so the last shopping day is Saturday 24.
		for (const today of ['2026-10-22', '2026-10-23', '2026-10-24']) {
			const closure = closureAhead(today);
			assert.ok(closure, `expected a notice on ${today}`);
			assert.equal(closure.closureDate, '2026-10-25');
			assert.equal(closure.lastOpenDay, '2026-10-24');
			assert.equal(closure.closedDays, 2);
			assert.deepEqual(closure.holidays, ['nationalDay']);
		}
	});

	it('says nothing before the window opens, or once the shops have shut', () => {
		assert.equal(closureAhead('2026-10-21'), null, 'four days out — too early to be news');
		assert.equal(closureAhead('2026-10-25'), null, 'the Sunday: the last shopping day is past');
		assert.equal(closureAhead('2026-10-26'), null, 'the holiday itself');
	});

	it('says nothing about a holiday that falls on a Sunday', () => {
		// 1 November 2026 is a Sunday — the shops were shut anyway.
		assert.equal(closureAhead('2026-10-29'), null);
		assert.equal(closureAhead('2026-10-30'), null);
		assert.equal(closureAhead('2026-10-31'), null);
	});

	it('says nothing about an ordinary weekend', () => {
		assert.equal(closureAhead('2026-09-10'), null);
		assert.equal(closureAhead('2026-09-11'), null);
		assert.equal(closureAhead('2026-09-12'), null);
	});

	it('counts a Saturday holiday and its Sunday as two shut days', () => {
		// 15 August 2026 (Mariä Himmelfahrt) is a Saturday: a shopping day lost.
		const closure = closureAhead('2026-08-14');
		assert.ok(closure);
		assert.equal(closure.closureDate, '2026-08-15');
		assert.equal(closure.lastOpenDay, '2026-08-14');
		assert.equal(closure.closedDays, 2);
		assert.deepEqual(closure.holidays, ['assumption']);
	});

	it('reads Christmas as one run, and names both days', () => {
		// 2026: Fri 25th, Sat 26th, Sun 27th — three days shut, and the last
		// shopping day is Christmas Eve.
		const closure = closureAhead('2026-12-23');
		assert.ok(closure);
		assert.equal(closure.closureDate, '2026-12-25');
		assert.equal(closure.lastOpenDay, '2026-12-24');
		assert.equal(closure.closedDays, 3);
		assert.deepEqual(closure.holidays, ['christmas', 'stStephen']);
	});

	it('joins a Sunday to the holiday after it', () => {
		// 2027: Christmas Day is a Saturday, Boxing Day the Sunday, and the 27th
		// an ordinary Monday — two days, announced from the Wednesday.
		const closure = closureAhead('2027-12-22');
		assert.ok(closure);
		assert.equal(closure.closureDate, '2027-12-25');
		assert.equal(closure.lastOpenDay, '2027-12-24');
		assert.equal(closure.closedDays, 2);
		assert.deepEqual(closure.holidays, ['christmas', 'stStephen']);
	});

	it('reads New Year as its own closure, days after Christmas', () => {
		// 1 January 2027 is a Friday; Saturday the 2nd is an ordinary shopping day.
		const closure = closureAhead('2026-12-31');
		assert.ok(closure);
		assert.equal(closure.closureDate, '2027-01-01');
		assert.equal(closure.lastOpenDay, '2026-12-31');
		assert.equal(closure.closedDays, 1);
		assert.deepEqual(closure.holidays, ['newYear']);
	});

	it('crosses the turn of the year without losing the holiday', () => {
		// The lookahead from 30 December reaches into the next year's table.
		const closure = closureAhead('2026-12-30');
		assert.ok(closure);
		assert.equal(closure.closureDate, '2027-01-01');
	});

	it('never announces a run it is already inside', () => {
		// Every day of 2026 and 2027, three things hold: the run named is still
		// ahead, the shopping day it points at hasn't passed, and that day is one
		// the shops actually open.
		//
		// `today` itself may well be shut — a Sunday two days before Epiphany
		// carries the notice, because the Monday in between is the last chance to
		// shop and that is precisely worth saying.
		for (const year of [2026, 2027]) {
			for (let day = 0; day < 365; day++) {
				const today = new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10);
				const closure = closureAhead(today);
				if (!closure) continue;

				assert.ok(closure.closureDate > today, `${today} → ${closure.closureDate} has begun`);
				assert.ok(closure.lastOpenDay >= today, `${today} → ${closure.lastOpenDay} is in the past`);
				assert.equal(
					isShopClosed(closure.lastOpenDay),
					false,
					`${today} → ${closure.lastOpenDay} is shut`
				);
				assert.ok(closure.holidays.length > 0, `${today} → a notice about no holiday`);
			}
		}
	});

	it('warns across a Sunday when the holiday is the Tuesday', () => {
		// Epiphany 2026 is Tuesday the 6th; the 4th is a Sunday. The notice runs
		// Sat–Mon and names the Monday, which is the only day left to shop.
		const closure = closureAhead('2026-01-04');
		assert.ok(closure);
		assert.equal(closure.closureDate, '2026-01-06');
		assert.equal(closure.lastOpenDay, '2026-01-05');
		assert.equal(closure.closedDays, 1);
	});

	it('gives every holiday that shuts a shopping day its own notice', () => {
		// 2026 loses only All Saints' to a Sunday, so eleven of the twelve are
		// announced — each on the three days before its run.
		const announced = new Set<string>();
		for (let day = 0; day < 365; day++) {
			const today = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
			for (const key of closureAhead(today)?.holidays ?? []) announced.add(key);
		}

		assert.equal(announced.has('allSaints'), false, '1 Nov 2026 is a Sunday');
		assert.equal(announced.size, 11);
	});
});

describe('observesAustrianHolidays', () => {
	it('is Austria only', () => {
		assert.equal(observesAustrianHolidays('Europe/Vienna'), true);
		assert.equal(observesAustrianHolidays('Europe/Berlin'), false);
		assert.equal(observesAustrianHolidays('America/New_York'), false);
	});
});
