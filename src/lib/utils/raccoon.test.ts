/**
 * `npm test` — which raccoon Home shows, and the birthday it may be showing it
 * for (→ docs/TESTING.md). The interesting cases are the collisions: a
 * birthday on Christmas, a holiday with a chore overdue, a chore at midnight.
 * Waiting for 24 December to find out is not a test plan.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { birthdayFrom, isBirthday, isBirthdayOn } from './birthday.ts';
import { homeRaccoon, specialDay } from './raccoon.ts';

/** An ordinary afternoon with nothing on: the baseline every case varies. */
const plain = { today: '2036-06-18', hour: 14, birthday: null, nextChoreDue: null };

describe('isBirthday', () => {
	it('takes a real day of the year, 29 February included', () => {
		assert.ok(isBirthday('01-01'));
		assert.ok(isBirthday('02-29'));
		assert.ok(isBirthday('12-31'));
	});

	it('refuses days a month does not have and anything else', () => {
		for (const value of [
			'02-30',
			'04-31',
			'13-01',
			'00-10',
			'01-00',
			'1-1',
			'2036-01-01',
			5,
			null
		]) {
			assert.equal(isBirthday(value), false, String(value));
		}
	});
});

describe('birthdayFrom', () => {
	it('builds MM-DD from the two selects', () => {
		assert.equal(birthdayFrom('7', '3'), '03-07');
		assert.equal(birthdayFrom('29', '2'), '02-29');
	});

	it('clears on both empty, refuses half or an impossible day', () => {
		assert.equal(birthdayFrom('', ''), null);
		assert.equal(birthdayFrom('7', ''), undefined);
		assert.equal(birthdayFrom('', '3'), undefined);
		assert.equal(birthdayFrom('31', '4'), undefined);
	});
});

describe('isBirthdayOn', () => {
	it('matches day and month in any year', () => {
		assert.ok(isBirthdayOn('06-18', '2036-06-18'));
		assert.ok(isBirthdayOn('06-18', '2041-06-18'));
		assert.equal(isBirthdayOn('06-18', '2036-06-19'), false);
		assert.equal(isBirthdayOn(null, '2036-06-18'), false);
	});

	it('keeps a 29 February birthday on the 28th when there is no 29th', () => {
		assert.ok(isBirthdayOn('02-29', '2027-02-28'));
		assert.ok(isBirthdayOn('02-29', '2028-02-29'));
		// A leap year has the real day, so the 28th is just the 28th.
		assert.equal(isBirthdayOn('02-29', '2028-02-28'), false);
		assert.equal(isBirthdayOn('02-29', '2100-02-28'), true);
	});
});

describe('specialDay', () => {
	it('knows the fixed ones, and only their days', () => {
		assert.equal(specialDay('2036-12-23'), null);
		assert.equal(specialDay('2036-12-24'), 'christmas');
		assert.equal(specialDay('2036-12-25'), 'christmas');
		assert.equal(specialDay('2036-12-26'), null);
		assert.equal(specialDay('2036-12-31'), 'new-year');
		assert.equal(specialDay('2037-01-01'), 'new-year');
		assert.equal(specialDay('2037-01-02'), null);
		assert.equal(specialDay('2036-10-31'), 'halloween');
		assert.equal(specialDay('2036-02-14'), 'valentines');
	});

	it('moves Easter with the calendar: Sunday and Monday only', () => {
		// 2026: Easter Sunday 5 April.
		assert.equal(specialDay('2026-04-04'), null);
		assert.equal(specialDay('2026-04-05'), 'easter');
		assert.equal(specialDay('2026-04-06'), 'easter');
		assert.equal(specialDay('2026-04-07'), null);
		// 2027: 28 March, and Monday the 29th.
		assert.equal(specialDay('2027-03-28'), 'easter');
		assert.equal(specialDay('2027-03-29'), 'easter');
		assert.equal(specialDay('2026-03-29'), null);
	});
});

describe('homeRaccoon', () => {
	it('greets with A on even days and B on odd ones', () => {
		assert.equal(homeRaccoon(plain), 'welcome-a');
		assert.equal(homeRaccoon({ ...plain, today: '2036-06-19' }), 'welcome-b');
	});

	it('follows the next chore: a bell before it is due, the alarm once late', () => {
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-18' }), 'reminder-upcoming');
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-20' }), 'reminder-upcoming');
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-17' }), 'reminder-overdue');
	});

	it('sleeps from 22:00 until 05:00', () => {
		assert.equal(homeRaccoon({ ...plain, hour: 21 }), 'welcome-a');
		assert.equal(homeRaccoon({ ...plain, hour: 22 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 23 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 0 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 4 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 5 }), 'welcome-a');
	});

	it('stays awake for a chore on you, even at night', () => {
		assert.equal(
			homeRaccoon({ ...plain, hour: 23, nextChoreDue: '2036-06-17' }),
			'reminder-overdue'
		);
	});

	it('lets a special day beat the reminder and the bedtime', () => {
		const christmasEve = { ...plain, today: '2036-12-24' };
		assert.equal(homeRaccoon({ ...christmasEve, nextChoreDue: '2036-12-20' }), 'christmas');
		assert.equal(homeRaccoon({ ...christmasEve, hour: 23 }), 'christmas');
		assert.equal(homeRaccoon({ ...plain, today: '2036-10-31', hour: 22 }), 'halloween');
	});

	it('puts your birthday above everything, Christmas included', () => {
		assert.equal(homeRaccoon({ ...plain, birthday: '06-18' }), 'birthday');
		assert.equal(homeRaccoon({ ...plain, today: '2036-12-25', birthday: '12-25' }), 'birthday');
		assert.equal(
			homeRaccoon({ ...plain, birthday: '06-18', hour: 23, nextChoreDue: '2036-06-01' }),
			'birthday'
		);
		// Someone else's day is just a day.
		assert.equal(homeRaccoon({ ...plain, birthday: '06-19' }), 'welcome-a');
	});
});
