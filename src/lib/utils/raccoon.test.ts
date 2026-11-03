/**
 * `npm test` — which raccoon Home shows, and the birthday it may be showing it
 * for (→ docs/TESTING.md). The interesting cases are the collisions: a
 * birthday on Christmas, a holiday with a chore overdue, a chore at midnight.
 * Waiting for 24 December to find out is not a test plan.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { birthdayFrom, isBirthday, isBirthdayOn } from './birthday.ts';
import { addDays } from './dates.ts';
import type { MascotName } from '$lib/assets/mascot';
import { EVERYDAY } from '$lib/assets/mascot/everyday';
import {
	everydayRaccoon,
	HOME_RACCOONS,
	homeRaccoon,
	isHomeRaccoon,
	specialDay
} from './raccoon.ts';

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
	it('on an ordinary afternoon, shows an everyday pose', () => {
		assert.equal(homeRaccoon(plain), everydayRaccoon(plain.today, plain.hour));
	});

	it('follows the next chore: a bell before it is due, the alarm once late', () => {
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-18' }), 'reminder-upcoming');
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-20' }), 'reminder-upcoming');
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-17' }), 'reminder-overdue');
	});

	it('sleeps from 22:00 until 05:00', () => {
		assert.notEqual(homeRaccoon({ ...plain, hour: 21 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 22 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 23 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 0 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 4 }), 'sleeping');
		assert.notEqual(homeRaccoon({ ...plain, hour: 5 }), 'sleeping');
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
		assert.notEqual(homeRaccoon({ ...plain, birthday: '06-19' }), 'birthday');
	});
});

/** Every pose `everydayRaccoon` shows in one round from `date`: three slots a day, as many days
 * as the longest season needs (23 winter poses → 8 days), so a batch of new poses doesn't have
 * to edit this. */
function posesFrom(date: string): string[] {
	const longest = Math.max(
		...['winter', 'spring', 'summer', 'autumn'].map((season) => listedFor(season).length)
	);
	const seen = new Set<string>();
	for (let day = 0; day < Math.ceil(longest / 3); day++) {
		for (const hour of [8, 14, 20]) seen.add(everydayRaccoon(addDays(date, day), hour));
	}
	return [...seen].sort();
}

/** What mascots.json says a season's poses are — what the rotation must show, no more, no less. */
const listedFor = (season: string) =>
	EVERYDAY.filter((pose) => (pose.seasons as readonly string[]).includes(season))
		.map((pose) => pose.name as string)
		.sort();

/** The first morning of a season, when its poses take over from the last's. */
const seasonStarts = (date: string) => /-(03|06|09|12)-01$/.test(date);

describe('everydayRaccoon', () => {
	it('shows each season exactly the poses listed for it, all of them within one round', () => {
		assert.deepEqual(posesFrom('2036-01-10'), listedFor('winter'));
		assert.deepEqual(posesFrom('2036-04-10'), listedFor('spring'));
		assert.deepEqual(posesFrom('2036-07-10'), listedFor('summer'));
		assert.deepEqual(posesFrom('2036-10-10'), listedFor('autumn'));
	});

	it('goes by the meteorological seasons: December is winter, March spring', () => {
		assert.ok(posesFrom('2036-12-01').includes('snow'));
		assert.ok(!posesFrom('2036-11-23').includes('snow'));
		assert.ok(posesFrom('2036-02-22').includes('snow'));
		assert.ok(!posesFrom('2036-03-01').includes('snow'));
		assert.ok(posesFrom('2036-06-01').includes('beach'));
		assert.ok(!posesFrom('2036-09-01').includes('beach'));
	});

	it('changes at 11:00 and 17:00, and holds still in between', () => {
		const day = '2036-06-18';
		assert.equal(everydayRaccoon(day, 5), everydayRaccoon(day, 10));
		assert.notEqual(everydayRaccoon(day, 10), everydayRaccoon(day, 11));
		assert.equal(everydayRaccoon(day, 11), everydayRaccoon(day, 16));
		assert.notEqual(everydayRaccoon(day, 16), everydayRaccoon(day, 17));
		assert.equal(everydayRaccoon(day, 17), everydayRaccoon(day, 21));
	});

	it('never shows the same pose, or two look-alikes, twice in a row', () => {
		// The groups come from mascots.json, so a pose added there is held to this too.
		const group = new Map(EVERYDAY.map((pose) => [pose.name, pose.lookAlike]));
		let previous = '';
		let date = '2036-01-01';
		for (let day = 0; day < 366 * 2; day++, date = addDays(date, 1)) {
			for (const hour of [8, 14, 20]) {
				const pose = everydayRaccoon(date, hour);
				if (!(seasonStarts(date) && hour === 8)) {
					const at = `${date} ${hour}:00: ${previous} → ${pose}`;
					assert.notEqual(pose, previous, at);
					const shared = group.get(pose);
					assert.ok(!shared || shared !== group.get(previous as MascotName), at);
				}
				previous = pose;
			}
		}
	});
});

describe('HOME_RACCOONS', () => {
	/** Drawn for the tabs, Settings and the login screen; never Home's (→ plan 34). */
	const SECTIONS = ['shopping', 'cooking', 'tasks', 'expenses', 'head', 'settings', 'move-out'];

	it('holds everything homeRaccoon can return, in any year, at any hour', () => {
		const seen = new Set<MascotName>();
		for (let day = 0; day < 366 * 2; day += 1) {
			const today = addDays('2035-01-01', day);
			for (let hour = 0; hour < 24; hour += 1) {
				for (const extra of [
					{},
					{ birthday: today.slice(5) },
					{ nextChoreDue: addDays(today, -1) },
					{ nextChoreDue: addDays(today, 1) }
				]) {
					seen.add(homeRaccoon({ ...plain, today, hour, ...extra }));
				}
			}
		}
		const missing = [...seen].filter((name) => !HOME_RACCOONS.includes(name));
		assert.deepEqual(missing, []);
		// And nothing extra: every listed raccoon really turns up on some day.
		assert.deepEqual([...HOME_RACCOONS].sort(), [...seen].sort());
	});

	it('leaves out the section raccoons, so the picker and ?raccoon= never offer them', () => {
		for (const name of SECTIONS) {
			assert.equal(HOME_RACCOONS.includes(name as MascotName), false, name);
			assert.equal(isHomeRaccoon(name), false, name);
		}
		assert.equal(isHomeRaccoon('not-a-raccoon'), false);
		assert.equal(isHomeRaccoon('christmas'), true);
	});
});
