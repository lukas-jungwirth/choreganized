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
 * 5. an everyday pose (→ `everydayRaccoon`): the ones that fit the month, taken
 *    in turn, a new one each morning, afternoon and evening.
 *
 * A special day beats the reminder because the card under the raccoon still
 * names the chore; the raccoon is the only thing that can say what day it is.
 * Everything here is the household's date and hour as the server read them, so
 * the same pose renders on the server and in the browser, all day.
 */
import type { MascotName } from '$lib/assets/mascot';
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
};

/** Fixed special days, `MM-DD`. Easter moves, so it is worked out per year. */
const SPECIAL_DAYS: Record<string, MascotName> = {
	'12-24': 'christmas',
	'12-25': 'christmas',
	'12-31': 'new-year',
	'01-01': 'new-year',
	'10-31': 'halloween',
	'02-14': 'valentines'
};

/** The hours the raccoon is asleep: from 22:00, until 05:00. */
const BEDTIME = 22;
const WAKE_UP = 5;

/** The awake day in three: morning from 05:00, afternoon from 11:00, evening from 17:00. */
const SLOT_STARTS = [WAKE_UP, 11, 17];

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * The everyday poses and the months (1–12) each belongs to (DECISIONS #219):
 * the beach and the snow only in the three hottest and coldest, gardening,
 * fishing and tea into the mild months either side, and reading, sports and
 * the two greetings all year, so a month between seasons still has six.
 * Listed so that neighbours differ: taking them in turn, the last wrapping
 * round to the first, never puts the two greetings, the two gardening poses
 * or the two hot drinks back to back in any month.
 */
const EVERYDAY: Array<[MascotName, number[]]> = [
	['welcome-a', ALL_YEAR],
	['beach', [6, 7, 8]],
	['snow', [12, 1, 2]],
	['reading', ALL_YEAR],
	['garden', [4, 5, 6, 7, 8, 9, 10]],
	['cold', [11, 12, 1, 2, 3]],
	['welcome-b', ALL_YEAR],
	['fishing', [5, 6, 7, 8, 9]],
	['tea', [10, 11, 12, 1, 2, 3, 4]],
	['sports', ALL_YEAR],
	['summer-garden', [5, 6, 7, 8]]
];

/** Any fixed day works; the count from it is what turns the wheel. */
const EPOCH = '2000-01-01';

export function specialDay(today: CalendarDate): MascotName | null {
	const fixed = SPECIAL_DAYS[today.slice(5)];
	if (fixed) return fixed;

	const easter = easterSunday(Number(today.slice(0, 4)));
	if (today === easter || today === addDays(easter, 1)) return 'easter';

	return null;
}

export function homeRaccoon({ today, hour, birthday, nextChoreDue }: Input): MascotName {
	if (isBirthdayOn(birthday, today)) return 'birthday';

	const special = specialDay(today);
	if (special) return special;

	if (nextChoreDue) {
		return daysBetween(today, nextChoreDue) < 0 ? 'reminder-overdue' : 'reminder-upcoming';
	}

	if (hour >= BEDTIME || hour < WAKE_UP) return 'sleeping';

	return everydayRaccoon(today, hour);
}

/**
 * The month's poses taken in turn, one per slot: three a day, the next day
 * carrying on where the evening left off, so within a month the same one
 * never shows twice in a row and every one comes round within three days. (A
 * new month's pool can bring back the previous evening's pose on the 1st —
 * with a night of the sleeping raccoon in between, which is fine.) It depends
 * only on the date and the slot, so the whole household sees the same raccoon
 * and it holds still until the slot ends.
 */
export function everydayRaccoon(today: CalendarDate, hour: number): MascotName {
	const month = Number(today.slice(5, 7));
	const pool = EVERYDAY.filter(([, months]) => months.includes(month)).map(([name]) => name);
	const slot = SLOT_STARTS.findLastIndex((start) => hour >= start);
	const turn = daysBetween(EPOCH, today) * SLOT_STARTS.length + Math.max(slot, 0);
	return pool[turn % pool.length];
}
