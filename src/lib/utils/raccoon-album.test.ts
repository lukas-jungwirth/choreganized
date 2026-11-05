/**
 * `npm test` — what the raccoon album works out from each pose (→ plan 35):
 * its rarity, when you can meet it, its frame, and the order a blend of seasons
 * runs in. Nothing here is typed in per raccoon, so these are the rules.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { de } from '../i18n/messages/de.ts';
import { en } from '../i18n/messages/en.ts';
import { formatDayRange, formatMonthSpan } from './dates.ts';
import {
	ALBUM_ENTRIES,
	ALBUM_SIZE,
	albumEntry,
	albumNumber,
	behindFront,
	countMissing,
	cardView,
	filterAlbum,
	frameFill,
	frameInk,
	seasonRun,
	tierOf
} from './raccoon-album.ts';
import { homeSlot } from './raccoon.ts';

describe('tier', () => {
	it('is Common for 40% of the year or more: every season, the laptop, the reminders', () => {
		for (const name of [
			'reading',
			'tennis',
			'laptop',
			'reminder-upcoming',
			'reminder-overdue'
		] as const)
			assert.equal(albumEntry(name).tier, 1, name);
	});

	it('is Rare in between: a season or two, coffee in the mornings, sleeping at night', () => {
		for (const name of ['snowman', 'tea', 'garden', 'mushrooms', 'coffee', 'sleeping'] as const)
			assert.equal(albumEntry(name).tier, 2, name);
	});

	it('is Legendary under 3%: the special days and your birthday', () => {
		for (const name of [
			'christmas',
			'new-year',
			'easter',
			'fasching',
			'halloween',
			'valentines',
			'birthday'
		] as const)
			assert.equal(albumEntry(name).tier, 3, name);
	});

	it('works out the share from the months, the weekdays and the hours', () => {
		const close = (actual: number, expected: number) =>
			assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
		// Awake 17 hours a day: 05:00 to 22:00.
		close(albumEntry('reading').availability, 17 / 24);
		close(albumEntry('snowman').availability, (1 / 4) * (17 / 24));
		close(albumEntry('laptop').availability, (5 / 7) * (17 / 24));
		close(albumEntry('coffee').availability, 6 / 24);
		close(albumEntry('sleeping').availability, 7 / 24);
		close(albumEntry('christmas').availability, 2 / 365);
		close(albumEntry('reminder-overdue').availability, 1);
	});

	it('draws the lines at 40% and 3%', () => {
		assert.equal(tierOf(0.4), 1);
		assert.equal(tierOf(0.399), 2);
		assert.equal(tierOf(0.03), 2);
		assert.equal(tierOf(0.029), 3);
	});
});

describe('rule', () => {
	it('carries the days and slots a pose keeps to, and the night for sleeping', () => {
		assert.deepEqual(albumEntry('coffee').rule, { days: null, slots: ['morning'] });
		assert.deepEqual(albumEntry('laptop').rule, {
			days: ['mon', 'tue', 'wed', 'thu', 'fri'],
			slots: null
		});
		assert.deepEqual(albumEntry('sleeping').rule, { days: null, slots: ['night'] });
		assert.equal(albumEntry('reading').rule, null);
		assert.equal(albumEntry('christmas').rule, null);
	});

	it('reads as days and times of day in both languages', async () => {
		const { en } = await import('$lib/i18n/messages/en');
		const { de } = await import('$lib/i18n/messages/de');
		const workdays = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
		assert.equal(en.album.rule(workdays, null), 'Mon – Fri');
		assert.equal(de.album.rule(workdays, null), 'Mo – Fr');
		assert.equal(en.album.rule(['sat', 'sun'], null), 'Weekends');
		assert.equal(de.album.rule(['sat', 'sun'], null), 'Am Wochenende');
		assert.equal(en.album.rule(['fri'], null), 'Fridays');
		assert.equal(de.album.rule(['fri'], null), 'Freitags');
		assert.equal(en.album.rule(['mon', 'wed'], null), 'Mon and Wed');
		assert.equal(en.album.rule(null, ['morning']), 'Mornings');
		assert.equal(de.album.rule(null, ['night']), 'Nachts');
		assert.equal(
			en.album.rule(workdays, ['morning', 'evening']),
			'Mon – Fri, mornings and evenings'
		);
		assert.equal(de.album.rule(['fri'], ['evening']), 'Freitags, abends');
	});
});

describe('seasonRun', () => {
	it('starts where the run begins, going round the year', () => {
		assert.deepEqual(seasonRun(['winter', 'autumn']), ['autumn', 'winter']);
		assert.deepEqual(seasonRun(['spring', 'winter', 'autumn']), ['autumn', 'winter', 'spring']);
		assert.deepEqual(seasonRun(['summer', 'spring']), ['spring', 'summer']);
		assert.deepEqual(seasonRun(['summer']), ['summer']);
	});

	it('refuses seasons that are not one run', () => {
		assert.throws(() => seasonRun(['winter', 'summer']));
	});
});

describe('window', () => {
	it('names the months of a season, and of a run of them', () => {
		assert.deepEqual(albumEntry('snowman').window, {
			kind: 'months',
			from: 12,
			to: 2,
			season: 'winter'
		});
		assert.deepEqual(albumEntry('tea').window, { kind: 'months', from: 9, to: 2, season: null });
		assert.deepEqual(albumEntry('handball').window, {
			kind: 'months',
			from: 9,
			to: 5,
			season: null
		});
		assert.deepEqual(albumEntry('beach').window, {
			kind: 'months',
			from: 6,
			to: 8,
			season: 'summer'
		});
	});

	it('names the days of a special day, through the turn of the year', () => {
		assert.deepEqual(albumEntry('christmas').window, { kind: 'days', from: '12-24', to: '12-25' });
		assert.deepEqual(albumEntry('new-year').window, { kind: 'days', from: '12-31', to: '01-01' });
		assert.deepEqual(albumEntry('halloween').window, { kind: 'days', from: '10-31', to: '10-31' });
	});

	it('says Easter and your birthday rather than a date', () => {
		assert.equal(albumEntry('easter').window.kind, 'easter');
		assert.equal(albumEntry('fasching').window.kind, 'fasching');
		assert.equal(albumEntry('birthday').window.kind, 'birthday');
		assert.equal(albumEntry('sleeping').window.kind, 'all-year');
	});

	it('reads as months and days in both languages', () => {
		// Intl puts thin spaces around a range's dash; the words are what matter.
		const plain = (text: string) => text.replace(/\s/g, ' ');
		assert.equal(formatMonthSpan(12, 2, 'en'), 'Dec – Feb');
		assert.equal(formatMonthSpan(9, 5, 'en'), 'Sep – May');
		assert.equal(formatMonthSpan(6, 8, 'de'), 'Jun – Aug');
		assert.equal(plain(formatDayRange('12-24', '12-25', 'en')), 'Dec 24 – 25');
		assert.equal(formatDayRange('12-31', '01-01', 'en'), 'Dec 31 – Jan 1');
		assert.equal(formatDayRange('10-31', '10-31', 'de'), '31. Okt.');
	});
});

describe('frame', () => {
	it('is sage all year, a season, a blend first to last, holo on a special day', () => {
		assert.equal(frameFill(albumEntry('reading').frame), 'var(--season-any)');
		assert.equal(frameFill(albumEntry('snowman').frame), 'var(--season-winter)');
		assert.equal(
			frameFill(albumEntry('handball').frame),
			'linear-gradient(135deg, var(--season-autumn), var(--season-winter), var(--season-spring))'
		);
		assert.equal(frameFill(albumEntry('birthday').frame), 'var(--holo)');
	});

	it('inks a blend in its first season', () => {
		assert.equal(frameInk(albumEntry('tea').frame), 'var(--season-autumn-ink)');
		assert.equal(frameInk(albumEntry('halloween').frame), 'var(--holo-ink)');
	});
});

describe('numbering', () => {
	it('runs from 001 in album order', () => {
		assert.deepEqual(
			ALBUM_ENTRIES.map((entry) => entry.number),
			ALBUM_ENTRIES.map((_, index) => index + 1)
		);
		assert.equal(albumNumber(9), '009');
		assert.equal(albumNumber(39), '039');
	});
});

describe("Home's several-new line", () => {
	it('names two, or two and how many more, in each language', () => {
		assert.equal(en.album.home.names(['A', 'B'], 20, 53), 'A and B · 20 of 53');
		assert.equal(en.album.home.names(['A', 'B', 'C', 'D'], 20, 53), 'A, B and 2 more · 20 of 53');
		assert.equal(de.album.home.names(['A', 'B'], 20, 53), 'A und B · 20 von 53');
		assert.equal(de.album.home.names(['A', 'B', 'C'], 20, 53), 'A, B und 1 weitere · 20 von 53');
	});
});

describe('countMissing', () => {
	it('counts one rarity, less the ones met', () => {
		const rare = ALBUM_ENTRIES.filter((entry) => entry.tier === 2);
		assert.equal(countMissing(2, []), rare.length);
		assert.equal(countMissing(2, [rare[0].name]), rare.length - 1);
		assert.equal(countMissing(3, [rare[0].name]), countMissing(3, []));
	});
});

describe('behindFront', () => {
	const names = ALBUM_ENTRIES.map((entry) => entry.name);

	it('takes the first two still unmet, so they hold still until you meet one', () => {
		const [first, second, third] = names;
		assert.deepEqual(behindFront([], null), [first, second]);
		assert.deepEqual(behindFront([first], first), [second, third]);
		assert.deepEqual(behindFront([third], third), [first, second]);
	});

	it('never puts the front card behind itself', () => {
		const front = names[0];
		assert.ok(!behindFront(names.slice(0, 5), front).includes(front));
	});

	it('keeps two when one is left to find, and when the album is full', () => {
		const last = names[names.length - 1];
		const allButLast = names.slice(0, -1);
		const nearly = behindFront(allButLast, names[0]);
		assert.equal(nearly.length, 2);
		assert.equal(nearly[0], last);

		const full = behindFront(names, last);
		assert.equal(full.length, 2);
		assert.ok(!full.includes(last));
	});
});

describe('filterAlbum', () => {
	it('picks one rarity', () => {
		const rare = filterAlbum(ALBUM_ENTRIES, 2);
		assert.ok(rare.length > 0 && rare.every((entry) => entry.tier === 2));
		assert.ok(rare.some((entry) => entry.name === 'snowman'));
	});

	it('shows everything unfiltered', () => {
		assert.equal(filterAlbum(ALBUM_ENTRIES, null).length, ALBUM_SIZE);
	});
});

describe('cardView', () => {
	it('shows a met raccoon, reveals an unmet one only in admin mode, else locks it', async () => {
		assert.equal(cardView(true, false), 'met');
		assert.equal(cardView(true, true), 'met');
		assert.equal(cardView(false, true), 'revealed');
		assert.equal(cardView(false, false), 'locked');
		// A revealed tile is named, but still says it isn't met.
		const { en } = await import('$lib/i18n/messages/en');
		const { de } = await import('$lib/i18n/messages/de');
		assert.equal(
			en.album.tile('042', 'Christmas Baker', false, true),
			'No. 042, Christmas Baker, not met yet'
		);
		assert.equal(
			de.album.tile('042', 'Weihnachtsbäckerin', false, true),
			'Nr. 042, Weihnachtsbäckerin, noch nicht getroffen'
		);
		assert.equal(en.album.tile('042', 'Christmas Baker', true), 'No. 042, Christmas Baker, new');
	});
});

describe('homeSlot', () => {
	it('splits the awake day in three, as the rotation does', () => {
		assert.equal(homeSlot('2036-06-18', 5), '2036-06-18#0');
		assert.equal(homeSlot('2036-06-18', 10), '2036-06-18#0');
		assert.equal(homeSlot('2036-06-18', 11), '2036-06-18#1');
		assert.equal(homeSlot('2036-06-18', 17), '2036-06-18#2');
		assert.equal(homeSlot('2036-06-18', 21), '2036-06-18#2');
	});

	it('makes one slot of a night, dated by its evening', () => {
		assert.equal(homeSlot('2036-06-18', 22), '2036-06-18#n');
		assert.equal(homeSlot('2036-06-19', 2), '2036-06-18#n');
		assert.equal(homeSlot('2037-01-01', 4), '2036-12-31#n');
	});
});
