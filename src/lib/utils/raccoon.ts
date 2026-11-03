/**
 * Which raccoon sits on Home's first card (→ SPEC §2, DECISIONS #216).
 *
 * First match wins:
 *
 * 1. your birthday — personal beats public;
 * 2. a special day: Christmas (24–25 Dec), New Year (31 Dec – 1 Jan), Easter
 *    (Sunday and Monday), Halloween (31 Oct), Valentine's Day (14 Feb);
 * 3. the next chore on you — a bell while it's coming up, an alarm clock once
 *    it's late;
 * 4. asleep from 22:00 to 05:00, household time;
 * 5. an everyday pose (→ `everydayRaccoon`): the ones that fit the season,
 *    taken in turn, a new one each morning, afternoon and evening, each
 *    member at their own place in the turn.
 *
 * A special day beats the reminder because the card under the raccoon still
 * names the chore; the raccoon is the only thing that can say what day it is.
 * Everything here is the household's date and hour as the server read them, so
 * the same pose renders on the server and in the browser, all day.
 */
import type { MascotName } from '$lib/assets/mascot';
import { EVERYDAY, type Season } from '$lib/assets/mascot/everyday';
import { isBirthdayOn } from './birthday.ts';
import { addDays, daysBetween, type CalendarDate } from './dates.ts';
import { easterSunday } from './holidays.ts';

type Input = {
	today: CalendarDate;
	/** 0–23, household-local. */
	hour: number;
	/** The reader's own, `MM-DD`, if they gave one. */
	birthday: string | null;
	/** Due date of the chore Home's card shows, if there is one. */
	nextChoreDue: CalendarDate | null;
	/** Where the reader sits in the household, for their own everyday pose. */
	seat?: Seat;
};

/**
 * A member's place in the household: `index` in join order, of `of` members.
 * The everyday rotation starts each member that far round, so housemates
 * meet different raccoons in the same slot (→ DECISIONS #232).
 */
export type Seat = { index: number; of: number };

const ALONE: Seat = { index: 0, of: 1 };

/** Fixed special days, `MM-DD`. Easter moves, so it is worked out per year. */
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

/** Any fixed day works; the count from it is what turns the wheel. */
const EPOCH = '2000-01-01';

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

	return null;
}

export function homeRaccoon({
	today,
	hour,
	birthday,
	nextChoreDue,
	seat = ALONE
}: Input): MascotName {
	if (isBirthdayOn(birthday, today)) return 'birthday';

	const special = specialDay(today);
	if (special) return special;

	if (nextChoreDue) {
		return daysBetween(today, nextChoreDue) < 0 ? 'reminder-overdue' : 'reminder-upcoming';
	}

	if (hour >= BEDTIME || hour < WAKE_UP) return 'sleeping';

	return everydayRaccoon(today, hour, seat);
}

/**
 * The season's poses taken in turn, one per slot: three a day, the next day
 * carrying on where the evening left off, so within a season the same one
 * never shows twice in a row and every one comes round within three days. (A
 * new season's poses can bring back the previous evening's one on its first
 * morning, with a night of the sleeping raccoon in between, which is fine.)
 * The poses, their seasons and their order are `artwork/raccoon/mascots.json`
 * (→ DECISIONS #219, #220). It depends only on the date, the slot and the
 * reader's seat, so it holds still until the slot ends.
 *
 * Each member starts an even share of the season round from the last
 * (→ DECISIONS #232): two housemates are half the season apart, so they never
 * meet the same pose in the same slot, and each still walks the whole season in
 * order, with the no-repeat and look-alike rules intact. That is what makes the
 * raccoon album (plan 35) one each, rather than one per household.
 */
export function everydayRaccoon(today: CalendarDate, hour: number, seat: Seat = ALONE): MascotName {
	const pool = seasonPool(today);
	const slot = SLOT_STARTS.findLastIndex((start) => hour >= start);
	const turn = daysBetween(EPOCH, today) * SLOT_STARTS.length + Math.max(slot, 0);
	const start = Math.floor((pool.length * seat.index) / Math.max(seat.of, 1));
	return pool[(turn + start) % pool.length];
}

/** The season's everyday poses, in the order `mascots.json` lists them. */
function seasonPool(today: CalendarDate): MascotName[] {
	const season = SEASON_OF_MONTH[Number(today.slice(5, 7)) - 1];
	return EVERYDAY.filter((pose) => pose.seasons.includes(season)).map((pose) => pose.name);
}
