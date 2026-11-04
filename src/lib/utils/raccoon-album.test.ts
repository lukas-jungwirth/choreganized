/**
 * `npm test` — what the raccoon album works out from each pose (→ plan 35):
 * its tier, when you can meet it, its frame, and the order a blend of seasons
 * runs in. Nothing here is typed in per raccoon, so these are the rules.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { formatDayRange, formatMonthSpan } from './dates.ts';
import {
	ALBUM_ENTRIES,
	ALBUM_SIZE,
	albumEntry,
	albumNumber,
	filterAlbum,
	frameFill,
	frameInk,
	seasonRun
} from './raccoon-album.ts';
import { homeSlot } from './raccoon.ts';

describe('tier', () => {
	it('is ★ for every season, sleeping and the reminders', () => {
		for (const name of ['reading', 'sleeping', 'reminder-upcoming', 'reminder-overdue'] as const)
			assert.equal(albumEntry(name).tier, 1, name);
	});

	it('is ★★ for one to three seasons', () => {
		for (const name of ['snowman', 'tea', 'garden'] as const)
			assert.equal(albumEntry(name).tier, 2);
	});

	it('is ★★★ for the special days and your birthday', () => {
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

	it('puts ★ first, then ★★, then ★★★', () => {
		const tiers = ALBUM_ENTRIES.map((entry) => entry.tier);
		assert.deepEqual(tiers, [...tiers].sort());
	});
});

describe('filterAlbum', () => {
	const met = new Set(['reading', 'snowman']);

	it('picks one tier, and Missing on top of it', () => {
		const seasonal = filterAlbum(ALBUM_ENTRIES, met, { tier: 2, missing: false });
		assert.ok(seasonal.every((entry) => entry.tier === 2));
		assert.ok(seasonal.some((entry) => entry.name === 'snowman'));

		const missing = filterAlbum(ALBUM_ENTRIES, met, { tier: 2, missing: true });
		assert.equal(missing.length, seasonal.length - 1);
		assert.ok(!missing.some((entry) => entry.name === 'snowman'));
	});

	it('shows everything unfiltered, and everything unmet with Missing alone', () => {
		assert.equal(
			filterAlbum(ALBUM_ENTRIES, met, { tier: null, missing: false }).length,
			ALBUM_SIZE
		);
		assert.equal(
			filterAlbum(ALBUM_ENTRIES, met, { tier: null, missing: true }).length,
			ALBUM_SIZE - met.size
		);
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
