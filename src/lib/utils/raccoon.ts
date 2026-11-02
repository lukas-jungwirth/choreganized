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
 * 5. a greeting, pose A on even days of the month and B on odd ones.
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

	return Number(today.slice(8)) % 2 === 0 ? 'welcome-a' : 'welcome-b';
}
