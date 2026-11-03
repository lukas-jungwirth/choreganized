/**
 * The raccoon album (→ plan 35, SPEC §6): every raccoon Home can show, as a
 * card you collect by meeting it there.
 *
 * Nothing here is typed in by hand except the number and the stats, which sit
 * beside the pose in `artwork/raccoon/mascots.json` (→ `assets/mascot/album`).
 * The rest is worked out from what `homeRaccoon` reads:
 *
 * - **Tier** (★ to ★★★): a special day or your birthday is ★★★; an everyday
 *   pose in one to three seasons is ★★; everything else Home shows (the poses
 *   of every season, sleeping, the reminders) is ★.
 * - **Window**, the card's one chip: when you can meet it.
 * - **Frame**, the card's colour: the season's, a blend of several, sage for
 *   all year, holo foil for a special day.
 */
import { ALBUM, type AlbumName, type Stat } from '$lib/assets/mascot/album';
import { EVERYDAY, type Season } from '$lib/assets/mascot/everyday';
import { addDays } from './dates.ts';
import { SEASON_OF_MONTH, SPECIAL_DAYS } from './raccoon.ts';

export type Tier = 1 | 2 | 3;

/** The year's order, which is also the order a blend runs in once it has found its start. */
export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

/** When you can meet one: the card's chip. Month numbers are 1–12, days `MM-DD`. */
export type Window =
	| { kind: 'all-year' }
	| { kind: 'months'; from: number; to: number; season: Season | null }
	| { kind: 'days'; from: string; to: string }
	| { kind: 'easter' }
	| { kind: 'birthday' };

export type Frame = { kind: 'any' } | { kind: 'seasons'; seasons: Season[] } | { kind: 'holo' };

export type AlbumEntry = {
	name: AlbumName;
	number: number;
	stats: Readonly<Record<Stat, number>>;
	tier: Tier;
	window: Window;
	frame: Frame;
};

/**
 * A pose's seasons as one run through the year, starting where it begins: tea
 * is autumn → winter, handball autumn → winter → spring. A pose whose seasons
 * aren't one unbroken run has no such order, and is refused (the convention
 * test holds `mascots.json` to that).
 */
export function seasonRun(seasons: readonly Season[]): Season[] {
	const held = new Set(seasons);
	if (held.size === SEASONS.length) return [...SEASONS];
	const index = (season: Season) => SEASONS.indexOf(season);
	const start = SEASONS.find(
		(season) => held.has(season) && !held.has(SEASONS[(index(season) + 3) % 4])
	);
	if (!start) throw new Error(`no start in ${seasons.join(', ')}`);

	const run: Season[] = [];
	for (let step = 0; step < SEASONS.length; step++) {
		const season = SEASONS[(index(start) + step) % 4];
		if (!held.has(season)) break;
		run.push(season);
	}
	if (run.length !== held.size) throw new Error(`${seasons.join(', ')} is not one run`);
	return run;
}

/** A season's months, 1–12, as `homeRaccoon` reads them. */
function monthsOf(season: Season): number[] {
	return SEASON_OF_MONTH.flatMap((each, index) => (each === season ? [index + 1] : []));
}

/** The first month of a season, going round the year: winter starts in December. */
function firstMonth(season: Season): number {
	const months = monthsOf(season);
	return months.find((month) => !months.includes(month === 1 ? 12 : month - 1))!;
}

function lastMonth(season: Season): number {
	const first = firstMonth(season);
	return ((first + monthsOf(season).length - 2) % 12) + 1;
}

/**
 * The fixed days a special raccoon shows on, as a first and last `MM-DD`. A run
 * starts on the day whose eve isn't in it, so New Year is 31 Dec to 1 Jan.
 */
function daysOf(name: AlbumName): { from: string; to: string } | null {
	const days = Object.entries(SPECIAL_DAYS)
		.filter(([, raccoon]) => raccoon === name)
		.map(([day]) => day);
	if (days.length === 0) return null;
	return {
		from: days.find((day) => !days.includes(shift(day, -1)))!,
		to: days.find((day) => !days.includes(shift(day, 1)))!
	};
}

/** `MM-DD` a day on or back, in a year that isn't a leap year. */
function shift(day: string, by: number): string {
	return addDays(`2001-${day}`, by).slice(5);
}

function describe({ name, number, stats }: (typeof ALBUM)[number]): AlbumEntry {
	const entry = { name, number, stats };

	if (name === 'birthday') {
		return { ...entry, tier: 3, window: { kind: 'birthday' }, frame: { kind: 'holo' } };
	}
	if (name === 'easter') {
		return { ...entry, tier: 3, window: { kind: 'easter' }, frame: { kind: 'holo' } };
	}
	const days = daysOf(name);
	if (days)
		return { ...entry, tier: 3, window: { kind: 'days', ...days }, frame: { kind: 'holo' } };

	const pose = EVERYDAY.find((each) => each.name === name);
	if (!pose || pose.seasons.length === SEASONS.length) {
		return { ...entry, tier: 1, window: { kind: 'all-year' }, frame: { kind: 'any' } };
	}

	const seasons = seasonRun(pose.seasons);
	const window: Window = {
		kind: 'months',
		from: firstMonth(seasons[0]),
		to: lastMonth(seasons[seasons.length - 1]),
		season: seasons.length === 1 ? seasons[0] : null
	};
	return { ...entry, tier: 2, window, frame: { kind: 'seasons', seasons } };
}

/** Every album raccoon, by number. */
export const ALBUM_ENTRIES: readonly AlbumEntry[] = ALBUM.map(describe);

export const ALBUM_SIZE = ALBUM_ENTRIES.length;

export function isAlbumName(value: string): value is AlbumName {
	return ALBUM_ENTRIES.some((entry) => entry.name === value);
}

export function albumEntry(name: AlbumName): AlbumEntry {
	return ALBUM_ENTRIES.find((entry) => entry.name === name)!;
}

/** "009" — a number in the album, three places so the grid lines up. */
export function albumNumber(number: number): string {
	return String(number).padStart(3, '0');
}

/** The frame as paint: a token, a blend of tokens, or the foil. */
export function frameFill(frame: Frame): string {
	if (frame.kind === 'any') return 'var(--season-any)';
	if (frame.kind === 'holo') return 'var(--holo)';
	const stops = frame.seasons.map((season) => `var(--season-${season})`);
	return stops.length === 1 ? stops[0] : `linear-gradient(135deg, ${stops.join(', ')})`;
}

/** The ink on a frame: the number, the chip, the stat dots. A blend takes its first season's. */
export function frameInk(frame: Frame): string {
	if (frame.kind === 'any') return 'var(--season-any-ink)';
	if (frame.kind === 'holo') return 'var(--holo-ink)';
	return `var(--season-${frame.seasons[0]}-ink)`;
}

/** A filter on the grid: a tier or all, and Missing on top of either (→ plan 35). */
export type AlbumFilter = { tier: Tier | null; missing: boolean };

export function filterAlbum(
	entries: readonly AlbumEntry[],
	met: ReadonlySet<string>,
	{ tier, missing }: AlbumFilter
): AlbumEntry[] {
	return entries.filter(
		(entry) => (tier === null || entry.tier === tier) && (!missing || !met.has(entry.name))
	);
}
