/**
 * A member's birthday: `MM-DD`, day and month only — no year, so no age is
 * kept (→ DATA-MODEL `members.birthday`). The profile sheet asks for it as two
 * selects, and Home's raccoon is its one reader (→ `utils/raccoon.ts`).
 */
import type { CalendarDate } from './dates.ts';

export type Birthday = `${string}-${string}`;

/** Days in each month, February at its longest: 29 February is a birthday. */
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** A real day of the year in `MM-DD`, 02-29 included. */
export function isBirthday(value: unknown): value is Birthday {
	if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return false;
	const month = Number(value.slice(0, 2));
	const day = Number(value.slice(3));
	return month >= 1 && month <= 12 && day >= 1 && day <= MONTH_DAYS[month - 1];
}

/**
 * The profile form's two selects → a birthday. Both empty clears it (`null`);
 * one without the other, or a day the month doesn't have, is `undefined` — the
 * action's cue to refuse.
 */
export function birthdayFrom(day: string, month: string): Birthday | null | undefined {
	if (!day && !month) return null;
	const value = `${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
	return isBirthday(value) ? value : undefined;
}

/** How many days `month` (1–12) can have — the day select's length. */
export function daysInBirthdayMonth(month: number): number {
	return MONTH_DAYS[month - 1] ?? 31;
}

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Is `today` this birthday? A 29 February birthday is kept on the 28th in the
 * three years out of four that have no 29th, rather than skipped.
 */
export function isBirthdayOn(birthday: string | null | undefined, today: CalendarDate): boolean {
	if (!birthday) return false;
	const monthDay = today.slice(5);
	if (monthDay === birthday) return true;
	return birthday === '02-29' && monthDay === '02-28' && !isLeapYear(Number(today.slice(0, 4)));
}
