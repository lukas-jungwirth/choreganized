/**
 * The raccoon album (→ plan 35, SPEC §6): every raccoon Home can show, as a
 * card you collect by meeting it there.
 *
 * Nothing here is typed in by hand except the number and the stats, which sit
 * beside the pose in `artwork/raccoon/mascots.json` (→ `assets/mascot/album`).
 * The rest is worked out from what `homeRaccoon` reads:
 *
 * - **Tier**, its rarity (★ Common, ★★ Rare, ★★★ Legendary), from how much of
 *   the year it can be on Home (→ `availability`, DECISIONS #237): its months,
 *   its days of the week and its hours of the day, multiplied. Common is 40% of
 *   the year or more, Legendary under 3%, Rare in between. So an all-year pose
 *   (17 awake hours a day) and the laptop (workdays) are Common; a pose of one
 *   or two seasons, coffee (mornings) and sleeping (nights) are Rare; a special
 *   day or your birthday is Legendary.
 * - **Window**, the card's chip: when you can meet it, the season or the days
 *   of the year, and its **rule**, if it keeps to some weekdays or hours.
 * - **Frame**, the card's colour: the season's, a blend of several, sage for
 *   all year, holo foil for a special day.
 */
import { ALBUM, type AlbumName, type Stat } from '$lib/assets/mascot/album';
import { EVERYDAY, type DaySlot, type Season, type Weekday } from '$lib/assets/mascot/everyday';
import { addDays } from './dates.ts';
import { DAY_SLOTS, SEASON_OF_MONTH, SLOT_HOURS, SPECIAL_DAYS, WEEKDAYS } from './raccoon.ts';

/** ★ Common, ★★ Rare, ★★★ Legendary. */
export type Tier = 1 | 2 | 3;

/** The share of the year a raccoon can be on Home at or above which it is Common. */
export const COMMON_FROM = 0.4;
/** …and below which it is Legendary. Rare is everything in between. */
export const LEGENDARY_BELOW = 0.03;

export function tierOf(availability: number): Tier {
	if (availability >= COMMON_FROM) return 1;
	if (availability < LEGENDARY_BELOW) return 3;
	return 2;
}

/** The year's order, which is also the order a blend runs in once it has found its start. */
export const SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn'];

/** When you can meet one: the card's chip. Month numbers are 1–12, days `MM-DD`. */
export type Window =
	| { kind: 'all-year' }
	| { kind: 'months'; from: number; to: number; season: Season | null }
	| { kind: 'days'; from: string; to: string }
	| { kind: 'easter' }
	| { kind: 'fasching' }
	| { kind: 'birthday' };

/**
 * When in the week and the day it keeps to, on top of its window: some
 * weekdays, some of Home's slots or the night. Null fields mean all of them.
 */
export type Rule = {
	days: readonly Weekday[] | null;
	slots: readonly (DaySlot | 'night')[] | null;
};

export type Frame = { kind: 'any' } | { kind: 'seasons'; seasons: Season[] } | { kind: 'holo' };

export type AlbumEntry = {
	name: AlbumName;
	number: number;
	stats: Readonly<Record<Stat, number>>;
	tier: Tier;
	/** The share of the year's hours it can be on Home, 0–1 (→ `tierOf`). */
	availability: number;
	window: Window;
	rule: Rule | null;
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
function daysOf(name: AlbumName): { range: { from: string; to: string }; count: number } | null {
	const days = Object.entries(SPECIAL_DAYS)
		.filter(([, raccoon]) => raccoon === name)
		.map(([day]) => day);
	if (days.length === 0) return null;
	return {
		range: {
			from: days.find((day) => !days.includes(shift(day, -1)))!,
			to: days.find((day) => !days.includes(shift(day, 1)))!
		},
		count: days.length
	};
}

/** `MM-DD` a day on or back, in a year that isn't a leap year. */
function shift(day: string, by: number): string {
	return addDays(`2001-${day}`, by).slice(5);
}

/** A special day's share of the year: so many days of 365. */
const daysOfYear = (days: number) => days / 365;

/** The hours in a day a rule's slots cover; Home's awake hours when it names none. */
function hoursOf(slots: Rule['slots']): number {
	return (slots ?? DAY_SLOTS).reduce((sum, slot) => sum + SLOT_HOURS[slot], 0);
}

function describe({ name, number, stats }: (typeof ALBUM)[number]): AlbumEntry {
	const entry = { name, number, stats, rule: null };
	const special = (window: Window, days: number): AlbumEntry => {
		const availability = daysOfYear(days);
		return { ...entry, tier: tierOf(availability), availability, window, frame: { kind: 'holo' } };
	};

	if (name === 'birthday') return special({ kind: 'birthday' }, 1);
	if (name === 'easter') return special({ kind: 'easter' }, 2);
	if (name === 'fasching') return special({ kind: 'fasching' }, 1);
	const days = daysOf(name);
	if (days) return special({ kind: 'days', ...days.range }, days.count);

	const allYear = { window: { kind: 'all-year' } as Window, frame: { kind: 'any' } as Frame };

	// Asleep every night, 22:00 to 05:00, all year.
	if (name === 'sleeping') {
		const rule: Rule = { days: null, slots: ['night'] };
		const availability = SLOT_HOURS.night / 24;
		return { ...entry, ...allYear, rule, availability, tier: tierOf(availability) };
	}

	const pose = EVERYDAY.find((each) => each.name === name);
	// The reminders come with a chore, whenever one is on you.
	if (!pose) return { ...entry, ...allYear, availability: 1, tier: 1 };

	const rule: Rule | null =
		pose.days || pose.slots ? { days: pose.days ?? null, slots: pose.slots ?? null } : null;
	const share =
		(pose.seasons.length / SEASONS.length) *
		((pose.days?.length ?? WEEKDAYS.length) / WEEKDAYS.length) *
		(hoursOf(pose.slots ?? null) / 24);
	const ruled = { rule, availability: share, tier: tierOf(share) };

	if (pose.seasons.length === SEASONS.length) return { ...entry, ...allYear, ...ruled };

	const seasons = seasonRun(pose.seasons);
	const window: Window = {
		kind: 'months',
		from: firstMonth(seasons[0]),
		to: lastMonth(seasons[seasons.length - 1]),
		season: seasons.length === 1 ? seasons[0] : null
	};
	return { ...entry, ...ruled, window, frame: { kind: 'seasons', seasons } };
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

/**
 * How a tile and its card show a raccoon: `met` in colour; `revealed` in colour
 * but marked as not met, which only admin mode does (→ DECISIONS #240); else
 * `locked`, the silhouette. One rule for both, so a tile never opens a card
 * shown the other way.
 */
export type CardView = 'met' | 'revealed' | 'locked';

export function cardView(met: boolean, revealAll: boolean): CardView {
	if (met) return 'met';
	return revealAll ? 'revealed' : 'locked';
}

/** The grid's filter: one rarity, or all of them when null (→ DECISIONS #237). */
export function filterAlbum(entries: readonly AlbumEntry[], tier: Tier | null): AlbumEntry[] {
	return entries.filter((entry) => tier === null || entry.tier === tier);
}
