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

	it('moves Fasching with Easter: Faschingsdienstag only, 47 days before', () => {
		// 2026: Easter 5 April, so Faschingsdienstag is 17 February.
		assert.equal(specialDay('2026-02-16'), null);
		assert.equal(specialDay('2026-02-17'), 'fasching');
		assert.equal(specialDay('2026-02-18'), null);
		// 2027: Easter 28 March → 9 February; 2029: Easter 1 April → 13 February.
		assert.equal(specialDay('2027-02-09'), 'fasching');
		assert.equal(specialDay('2029-02-13'), 'fasching');
		assert.equal(specialDay('2027-02-17'), null);
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

/** What mascots.json says a season's poses are — what the draw may show, no more, no less. */
const listedFor = (season: string) =>
	EVERYDAY.filter((pose) => (pose.seasons as readonly string[]).includes(season))
		.map((pose) => pose.name as string)
		.sort();

/** A season's days in 2036: winter is the one that starts in December 2035. */
const SEASON_DAYS = {
	winter: ['2035-12-01', 91],
	spring: ['2036-03-01', 92],
	summer: ['2036-06-01', 92],
	autumn: ['2036-09-01', 91]
} as const;

/** Every pose `seed` meets in a season, looking in every slot (or only at `hours`). */
function metIn(season: keyof typeof SEASON_DAYS, seed: string, hours = [8, 14, 20]): string[] {
	const [first, days] = SEASON_DAYS[season];
	const seen = new Set<string>();
	for (let day = 0; day < days; day++) {
		for (const hour of hours) seen.add(everydayRaccoon(addDays(first, day), hour, seed));
	}
	return [...seen].sort();
}

/** Stand-ins for member ids: what the seed is in the app. */
const MEMBERS = Array.from({ length: 200 }, (_, index) => `member-${index}`);

describe('everydayRaccoon', () => {
	it('draws only the poses listed for the season', () => {
		for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) {
			for (const seed of MEMBERS.slice(0, 20)) {
				const met = metIn(season, seed);
				const listed = listedFor(season);
				assert.deepEqual(
					met.filter((name) => !listed.includes(name)),
					[],
					`${season}, ${seed}`
				);
			}
		}
	});

	it('meets every pose of a season within it, for anyone looking in every slot', () => {
		// No hard guarantee by design (→ DECISIONS #232), but three a day for a
		// season must be plenty: a draw that leaves gaps here is a broken draw.
		for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) {
			for (const seed of MEMBERS) {
				assert.deepEqual(metIn(season, seed), listedFor(season), `${season}, ${seed}`);
			}
		}
	});

	it('meets nearly every pose even for someone who only ever looks in the evening', () => {
		// The fixed rotation's trap: an evening-only visitor saw a third of summer.
		for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) {
			const shares = MEMBERS.map(
				(seed) => metIn(season, seed, [20]).length / listedFor(season).length
			);
			const mean = shares.reduce((sum, share) => sum + share, 0) / shares.length;
			assert.ok(mean > 0.95, `${season}: an evening-only visitor meets ${mean.toFixed(2)}`);
			assert.ok(Math.min(...shares) > 0.75, `${season}: worst ${Math.min(...shares).toFixed(2)}`);
		}
	});

	it('changes at 11:00 and 17:00, and holds still in between', () => {
		const day = '2036-06-18';
		assert.equal(everydayRaccoon(day, 5, 'm'), everydayRaccoon(day, 10, 'm'));
		assert.notEqual(everydayRaccoon(day, 10, 'm'), everydayRaccoon(day, 11, 'm'));
		assert.equal(everydayRaccoon(day, 11, 'm'), everydayRaccoon(day, 16, 'm'));
		assert.notEqual(everydayRaccoon(day, 16, 'm'), everydayRaccoon(day, 17, 'm'));
		assert.equal(everydayRaccoon(day, 17, 'm'), everydayRaccoon(day, 21, 'm'));
	});

	it('never shows the same pose, or two look-alikes, twice in one day', () => {
		// The groups come from mascots.json, so a pose added there is held to this too.
		const group = new Map(EVERYDAY.map((pose) => [pose.name as string, pose.lookAlike]));
		for (const seed of MEMBERS.slice(0, 20)) {
			let date = '2036-01-01';
			for (let day = 0; day < 366 * 2; day++, date = addDays(date, 1)) {
				const three = [8, 14, 20].map((hour) => everydayRaccoon(date, hour, seed));
				const at = `${seed} ${date}: ${three.join(', ')}`;
				assert.equal(new Set(three).size, 3, at);
				const groups = three.map((name) => group.get(name)).filter(Boolean);
				assert.equal(new Set(groups).size, groups.length, at);
			}
		}
	});

	it('is the same draw for the same member and day, and its own for each member', () => {
		const day = '2036-06-18';
		assert.equal(everydayRaccoon(day, 14, 'alice'), everydayRaccoon(day, 14, 'alice'));
		// Over a season two members' days are mostly different.
		let same = 0;
		for (let offset = 0; offset < 92; offset++) {
			const date = addDays('2036-06-01', offset);
			if (everydayRaccoon(date, 14, 'alice') === everydayRaccoon(date, 14, 'bob')) same++;
		}
		assert.ok(same < 20, `alice and bob shared ${same} of 92 afternoons`);
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
