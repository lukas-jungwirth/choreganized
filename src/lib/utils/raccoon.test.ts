/**
 * `npm test` — which raccoon Home shows, and the birthday it may be showing it
 * for (→ docs/TESTING.md). The interesting cases are the collisions: a
 * birthday on Christmas, a holiday with a chore overdue, a chore at midnight.
 * Waiting for 24 December to find out is not a test plan.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { birthdayFrom, isBirthday, isBirthdayOn } from './birthday.ts';
import { addDays, weekdayIndex } from './dates.ts';
import type { MascotName } from '$lib/assets/mascot';
import { EVERYDAY, type DaySlot } from '$lib/assets/mascot/everyday';
import {
	DAY_SLOTS,
	everydayRaccoon,
	WEEKDAYS,
	HOME_RACCOONS,
	homeRaccoon,
	isHomeRaccoon,
	MIDNIGHT_CHANCE,
	MIDNIGHT_RACCOON,
	specialDay,
	WELCOME_RACCOON
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

	it('follows the next chore: a bell on the day it is due, the alarm once late', () => {
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-18' }), 'reminder-upcoming');
		assert.equal(homeRaccoon({ ...plain, nextChoreDue: '2036-06-17' }), 'reminder-overdue');
	});

	it('leaves a chore still coming up to the everyday pose: nobody is late yet', () => {
		for (const due of ['2036-06-19', '2036-06-20', '2036-06-21']) {
			assert.equal(
				homeRaccoon({ ...plain, nextChoreDue: due }),
				everydayRaccoon(plain.today, plain.hour)
			);
		}
		// …and to bedtime, like any evening.
		assert.equal(homeRaccoon({ ...plain, hour: 23, nextChoreDue: '2036-06-19' }), 'sleeping');
	});

	it('sleeps from 22:00 until 05:00', () => {
		assert.notEqual(homeRaccoon({ ...plain, hour: 21 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 22 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 23 }), 'sleeping');
		assert.equal(homeRaccoon({ ...plain, hour: 2 }), 'sleeping');
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

	it('waves at a first visit, over a chore and bedtime, under a birthday and a special day', () => {
		const first = { ...plain, firstVisit: true };
		assert.equal(homeRaccoon(first), WELCOME_RACCOON);
		assert.equal(homeRaccoon({ ...first, nextChoreDue: '2036-06-10' }), WELCOME_RACCOON);
		assert.equal(homeRaccoon({ ...first, hour: 23 }), WELCOME_RACCOON);
		assert.equal(homeRaccoon({ ...first, birthday: '06-18' }), 'birthday');
		assert.equal(homeRaccoon({ ...first, today: '2036-12-24' }), 'christmas');
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

describe('the midnight raccoon', () => {
	const nights = Array.from({ length: 366 }, (_, day) => addDays('2036-01-01', day)).filter(
		(today) => !specialDay(today)
	);
	const visits = (seed: string, hour = 0) =>
		nights.filter((today) => homeRaccoon({ ...plain, today, hour, seed }) === MIDNIGHT_RACCOON);
	const members = Array.from({ length: 50 }, (_, index) => `member-${index}`);
	/** A night it does show on, for the tests of what beats what. */
	const [night] = visits('member-0');
	const midnight = { ...plain, today: night, hour: 0, seed: 'member-0' };

	it('shows from 00:00 to 02:00, the same both hours, and is asleep the rest of that night', () => {
		for (const seed of members) {
			const mine = visits(seed);
			assert.deepEqual(visits(seed, 1), mine, seed);
			for (const hour of [2, 3, 4, 22, 23]) assert.deepEqual(visits(seed, hour), [], `${hour}:00`);
		}
	});

	it('comes on about one night in three, and otherwise it is the sleeping raccoon', () => {
		const counts = members.map((seed) => visits(seed).length / nights.length);
		const mean = counts.reduce((sum, share) => sum + share, 0) / counts.length;
		assert.ok(Math.abs(mean - MIDNIGHT_CHANCE) < 0.03, `came on ${mean.toFixed(3)} of nights`);
		assert.ok(Math.min(...counts) > 0.2, `least often: ${Math.min(...counts).toFixed(3)}`);

		const quiet = nights.find((today) => !visits('member-0').includes(today))!;
		assert.equal(homeRaccoon({ ...midnight, today: quiet }), 'sleeping');
	});

	it('is each member’s own night', () => {
		assert.notDeepEqual(visits('member-0'), visits('member-1'));
	});

	it('beats a chore on you, or someone with chores would never meet it', () => {
		const due = { nextChoreDue: addDays(night, -1) };
		assert.equal(homeRaccoon(midnight), MIDNIGHT_RACCOON);
		assert.equal(homeRaccoon({ ...midnight, ...due }), MIDNIGHT_RACCOON);
		// Outside its two hours the reminder is back.
		assert.equal(homeRaccoon({ ...midnight, ...due, hour: 2 }), 'reminder-overdue');
	});

	it('gives way to a birthday, a special day and a first visit', () => {
		assert.equal(homeRaccoon({ ...midnight, birthday: night.slice(5) }), 'birthday');
		assert.equal(homeRaccoon({ ...midnight, firstVisit: true }), WELCOME_RACCOON);
		// Every member's New Year's Eve stays New Year's, whatever the night's draw.
		for (const seed of members) {
			assert.equal(homeRaccoon({ ...plain, today: '2036-12-31', hour: 0, seed }), 'new-year');
		}
	});
});

/**
 * What mascots.json says a season's poses are — what the draw may show, no more,
 * no less — or only those allowed in one slot (coffee is never an evening's).
 */
const listedFor = (season: string, slot?: DaySlot) =>
	EVERYDAY.filter(
		(pose) =>
			(pose.seasons as readonly string[]).includes(season) &&
			(!slot || !pose.slots || pose.slots.includes(slot))
	)
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
		// season must be plenty: one left over is the luck the draw is meant to
		// have, more than that is a broken draw.
		// A pose with a time rule is rarer on purpose (one slot of three, or some
		// days), so it is held to a year instead, in the next test.
		const ruled = new Set<string>(
			EVERYDAY.filter((pose) => pose.days || pose.slots).map((pose) => pose.name)
		);
		for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) {
			for (const seed of MEMBERS) {
				const met = metIn(season, seed);
				const missed = listedFor(season).filter((name) => !ruled.has(name) && !met.includes(name));
				assert.ok(missed.length <= 1, `${season}, ${seed} missed ${missed.join(', ')}`);
			}
		}
	});

	it('meets nearly every pose even for someone who only ever looks in the evening', () => {
		// The fixed rotation's trap: an evening-only visitor saw a third of summer.
		for (const season of ['winter', 'spring', 'summer', 'autumn'] as const) {
			const listed = listedFor(season, 'evening');
			const shares = MEMBERS.map((seed) => metIn(season, seed, [20]).length / listed.length);
			const mean = shares.reduce((sum, share) => sum + share, 0) / shares.length;
			// What one look a day at a pool this size should meet in a season, less a
			// margin for the poses with a time rule. It falls a little with each new
			// pose, so it is worked out rather than typed in.
			const expected = 1 - (1 - 1 / listed.length) ** SEASON_DAYS[season][1];
			assert.ok(
				mean > expected - 0.03,
				`${season}: an evening-only visitor meets ${mean.toFixed(2)}, expected ${expected.toFixed(2)}`
			);
			assert.ok(Math.min(...shares) > 0.75, `${season}: worst ${Math.min(...shares).toFixed(2)}`);
		}
	});

	it('keeps a pose to its days and slots, and still meets it there', () => {
		// The rules come from mascots.json (coffee mornings, the laptop on
		// workdays, → DECISIONS #237), so a rule added there is held to this too.
		const ruled = EVERYDAY.filter((pose) => pose.days || pose.slots);
		assert.ok(ruled.length > 0, 'some pose has a time rule');
		for (const seed of MEMBERS) {
			const met = new Set<string>();
			let date = '2036-01-01';
			for (let day = 0; day < 366; day++, date = addDays(date, 1)) {
				const weekday = WEEKDAYS[weekdayIndex(date)];
				[8, 14, 20].forEach((hour, slot) => {
					const name = everydayRaccoon(date, hour, seed);
					const pose = ruled.find((each) => each.name === name);
					if (!pose) return;
					met.add(name);
					const at = `${name} on ${weekday} ${date} at ${hour}:00`;
					assert.ok(!pose.days || pose.days.includes(weekday), at);
					assert.ok(!pose.slots || pose.slots.includes(DAY_SLOTS[slot]), at);
				});
			}
			// Within a year, everyone looking in every slot meets each of them.
			assert.deepEqual([...met].sort(), ruled.map((pose) => pose.name as string).sort(), seed);
		}
	});

	it('gives a pose its weight in the draw, on the days it is allowed', () => {
		const weighted = EVERYDAY.filter((pose) => pose.weight);
		assert.ok(weighted.length > 0, 'some pose has a weight');
		// An all-year pose with no rule of its own, to measure against.
		const plainPose = EVERYDAY.find(
			(pose) => pose.seasons.length === 4 && !pose.days && !pose.slots
		)!;
		for (const pose of weighted) {
			let own = 0;
			let other = 0;
			for (const seed of MEMBERS) {
				let date = '2036-01-01';
				for (let day = 0; day < 366; day++, date = addDays(date, 1)) {
					if (pose.days && !pose.days.includes(WEEKDAYS[weekdayIndex(date)])) continue;
					for (const hour of [8, 14, 20]) {
						const name = everydayRaccoon(date, hour, seed);
						if (name === pose.name) own++;
						if (name === plainPose.name) other++;
					}
				}
			}
			const ratio = own / other;
			assert.ok(
				Math.abs(ratio - pose.weight!) < 0.5,
				`${pose.name} came up ${ratio.toFixed(2)}× as often, not ${pose.weight}×`
			);
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
					{ nextChoreDue: today }
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
