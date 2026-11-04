/**
 * Which raccoon sits on Home's first card (→ SPEC §2, DECISIONS #216).
 *
 * First match wins:
 *
 * 1. your birthday — personal beats public;
 * 2. a special day: Christmas (24–25 Dec), New Year (31 Dec – 1 Jan), Easter
 *    (Sunday and Monday), Faschingsdienstag (47 days before Easter),
 *    Halloween (31 Oct), Valentine's Day (14 Feb);
 * 3. the next chore on you — a bell while it's coming up, an alarm clock once
 *    it's late;
 * 4. asleep from 22:00 to 05:00, household time;
 * 5. an everyday pose (→ `everydayRaccoon`): three of the season's poses
 *    drawn for each member each day, one each morning, afternoon and evening.
 *
 * A special day beats the reminder because the card under the raccoon still
 * names the chore; the raccoon is the only thing that can say what day it is.
 * Everything here is the household's date and hour as the server read them, so
 * the same pose renders on the server and in the browser, all day.
 */
import type { MascotName } from '$lib/assets/mascot';
import { EVERYDAY, type DaySlot, type Season, type Weekday } from '$lib/assets/mascot/everyday';
import { isBirthdayOn } from './birthday.ts';
import { addDays, daysBetween, weekdayIndex, type CalendarDate } from './dates.ts';
import { easterSunday } from './holidays.ts';

type Input = {
	today: CalendarDate;
	/** 0–23, household-local. */
	hour: number;
	/** The reader's own, `MM-DD`, if they gave one. */
	birthday: string | null;
	/** Due date of the chore Home's card shows, if there is one. */
	nextChoreDue: CalendarDate | null;
	/** Whose draw it is: the member id, so each member meets their own (→ DECISIONS #232). */
	seed?: string;
};

/** Fixed special days, `MM-DD`. Easter and Fasching move, so they are worked out per year. */
export const SPECIAL_DAYS: Readonly<Record<string, MascotName>> = {
	'12-24': 'christmas',
	'12-25': 'christmas',
	'12-31': 'new-year',
	'01-01': 'new-year',
	'10-31': 'halloween',
	'02-14': 'valentines'
};

/** Who Home shows when the day or the chore list says so, rather than the season. */
const SITUATIONS = [
	'birthday',
	'reminder-upcoming',
	'reminder-overdue',
	'sleeping'
] as const satisfies readonly MascotName[];

/**
 * Every raccoon Home can show, and only those: the situations, the special
 * days, then the everyday poses in their order. The section raccoons (shopping,
 * cooking, tasks, expenses, head, settings, move-out) are drawn for another
 * job and never sit on Home's card, so they are not here. Derived from the same
 * sources `homeRaccoon` reads, so a new everyday pose from `mascots.json` joins
 * by itself. The admin picker lists exactly these, and the server takes no
 * other `?raccoon=` (→ plan 34).
 */
export const HOME_RACCOONS: readonly MascotName[] = [
	...new Set<MascotName>([
		...SITUATIONS,
		...Object.values(SPECIAL_DAYS),
		'fasching',
		'easter',
		...EVERYDAY.map((pose) => pose.name)
	])
];

export function isHomeRaccoon(value: string): value is MascotName {
	return (HOME_RACCOONS as readonly string[]).includes(value);
}

/** The hours the raccoon is asleep: from 22:00, until 05:00. */
const BEDTIME = 22;
const WAKE_UP = 5;

/** The awake day in three: morning from 05:00, afternoon from 11:00, evening from 17:00. */
const SLOT_STARTS = [WAKE_UP, 11, 17];

/** Home's three awake slots, in order, by the names `mascots.json` gives a pose's `slots`. */
export const DAY_SLOTS: readonly DaySlot[] = ['morning', 'afternoon', 'evening'];

/** The week, Monday first, by the names `mascots.json` gives a pose's `days`. */
export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * How long each of Home's stretches lasts, in hours: the three awake slots and
 * the night. The raccoon album weighs a raccoon's rarity by them (→
 * `utils/raccoon-album`).
 */
export const SLOT_HOURS: Readonly<Record<DaySlot | 'night', number>> = {
	morning: SLOT_STARTS[1] - SLOT_STARTS[0],
	afternoon: SLOT_STARTS[2] - SLOT_STARTS[1],
	evening: BEDTIME - SLOT_STARTS[2],
	night: 24 - BEDTIME + WAKE_UP
};

/** Which season each month (1–12) belongs to: meteorological, three months each. */
export const SEASON_OF_MONTH: readonly Season[] = [
	'winter',
	'winter',
	'spring',
	'spring',
	'spring',
	'summer',
	'summer',
	'summer',
	'autumn',
	'autumn',
	'autumn',
	'winter'
];

/**
 * Which stretch of Home's day this is, as `YYYY-MM-DD#0|1|2` (morning,
 * afternoon, evening) or `YYYY-MM-DD#n` for the night, dated by the evening it
 * began, so 23:00 and 02:00 are one night. The raccoon album counts a sighting
 * once per slot (→ plan 35), because within one the raccoon holds still.
 */
export function homeSlot(today: CalendarDate, hour: number): string {
	if (hour >= BEDTIME) return `${today}#n`;
	if (hour < WAKE_UP) return `${addDays(today, -1)}#n`;
	return `${today}#${SLOT_STARTS.findLastIndex((start) => hour >= start)}`;
}

export function specialDay(today: CalendarDate): MascotName | null {
	const fixed = SPECIAL_DAYS[today.slice(5)];
	if (fixed) return fixed;

	const easter = easterSunday(Number(today.slice(0, 4)));
	if (today === easter || today === addDays(easter, 1)) return 'easter';
	if (today === faschingsdienstag(easter)) return 'fasching';

	return null;
}

/**
 * Faschingsdienstag (Shrove Tuesday), the last day of Fasching: 47 days before
 * Easter Sunday, the day before Ash Wednesday. Only the Tuesday, the day Austria
 * dresses up (Lukas 2026-11-04).
 */
export function faschingsdienstag(easter: CalendarDate): CalendarDate {
	return addDays(easter, -47);
}

export function homeRaccoon({ today, hour, birthday, nextChoreDue, seed = '' }: Input): MascotName {
	if (isBirthdayOn(birthday, today)) return 'birthday';

	const special = specialDay(today);
	if (special) return special;

	if (nextChoreDue) {
		return daysBetween(today, nextChoreDue) < 0 ? 'reminder-overdue' : 'reminder-upcoming';
	}

	if (hour >= BEDTIME || hour < WAKE_UP) return 'sleeping';

	return everydayRaccoon(today, hour, seed);
}

/**
 * Three of the season's poses for each member each day, one per slot
 * (→ DECISIONS #219, #220, #232): drawn at random, but from a seed made of the
 * member and the date, so nothing is stored and the same raccoon holds still all
 * slot, on every device, while a housemate draws their own.
 *
 * Random rather than in turn, for the raccoon album: a fixed order meets only
 * every third pose for someone who always looks in the evening, and hands a
 * whole season's set to a daily visitor within a week. Drawn, new ones keep
 * turning up for weeks, the last few take some luck, and there is no hard
 * guarantee of meeting every pose in a season, on purpose (Lukas 2026-11-03).
 *
 * A pose with `days` or `slots` in `mascots.json` is only in the draw on those
 * days or for those slots: coffee in the morning, the laptop on workdays
 * (→ DECISIONS #237). It still has to be drawn, so it isn't there every time.
 *
 * The one rule: a day's three are all different and never two look-alikes. The
 * night's sleeping raccoon sits between one day's evening and the next
 * morning, so that is every pair that would ever show back to back. The poses,
 * their seasons and their look-alike groups are `artwork/raccoon/mascots.json`.
 */
export function everydayRaccoon(today: CalendarDate, hour: number, seed = ''): MascotName {
	const slot = SLOT_STARTS.findLastIndex((start) => hour >= start);
	return dayDraw(today, seed)[Math.max(slot, 0)];
}

/** The day's three, in slot order. */
function dayDraw(today: CalendarDate, seed: string): MascotName[] {
	const random = seededRandom(`${seed}|${today}`);
	const drawn: (typeof EVERYDAY)[number][] = [];
	const season = SEASON_OF_MONTH[Number(today.slice(5, 7)) - 1];
	const weekday = WEEKDAYS[weekdayIndex(today)];
	const pool = EVERYDAY.filter(
		(pose) => pose.seasons.includes(season) && (!pose.days || pose.days.includes(weekday))
	);

	for (let slot = 0; slot < SLOT_STARTS.length; slot++) {
		const open = pool.filter(
			(pose) =>
				(!pose.slots || pose.slots.includes(DAY_SLOTS[slot])) &&
				!drawn.includes(pose) &&
				!(pose.lookAlike && drawn.some((each) => each.lookAlike === pose.lookAlike))
		);
		drawn.push(open[Math.floor(random() * open.length)]);
	}
	return drawn.map((pose) => pose.name);
}

/**
 * A small seeded generator: a string hashed to 32 bits (FNV-1a), then
 * mulberry32. Not for anything secret, only so the same seed gives the same
 * draw everywhere and nearby seeds don't give nearby draws.
 */
function seededRandom(text: string): () => number {
	let state = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		state = Math.imul(state ^ text.charCodeAt(index), 0x01000193) >>> 0;
	}
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}
