/**
 * The days Austrian shops are shut, and when to say so.
 *
 * Austria closes its shops on Sundays and on the public holidays below
 * (Öffnungszeitengesetz). Sundays need no announcement — everyone already plans
 * around them — so what this module looks for is a **closure**: a run of shut
 * days that contains at least one holiday falling on an ordinary shopping day.
 * Easter Monday after Easter Sunday is two days shut and worth knowing about;
 * All Saints' on a Sunday is a Sunday (→ SPEC §3.6, DECISIONS #131).
 *
 * Pure calendar, computed per year rather than tabulated — a hard-coded list is
 * a bug with a delivery date. Six of the twelve are fixed dates and four hang
 * off Easter, which is itself computed (`easterSunday`). The keys are values;
 * their names are copy and live in the catalogs (`m.holiday.names`).
 *
 * Everything here is calendar arithmetic on 'YYYY-MM-DD' strings, so it never
 * consults a timezone — the caller supplies the household-local `today`
 * (→ `utils/dates.ts`).
 */
import { addDays, weekdayIndex, type CalendarDate } from './dates.ts';

/** The holidays shops actually close for. Named by the catalogs, never here. */
export type HolidayKey =
	| 'newYear'
	| 'epiphany'
	| 'easterMonday'
	| 'labourDay'
	| 'ascension'
	| 'whitMonday'
	| 'corpusChristi'
	| 'assumption'
	| 'nationalDay'
	| 'allSaints'
	| 'christmas'
	| 'stStephen';

export type Holiday = { date: CalendarDate; key: HolidayKey };

/** A run of consecutive days on which no shop opens. */
export type ShopClosure = {
	/** The first shut day — the notice's identity, and what a dismissal is keyed by. */
	closureDate: CalendarDate;
	/** The holidays in the run, in date order. Never empty. */
	holidays: HolidayKey[];
	/** How many days in a row the shops are shut, Sundays counted. */
	closedDays: number;
	/** The last day shops open before it — the day the notice is about. */
	lastOpenDay: CalendarDate;
};

/**
 * Austrian holidays are Austria's, so a household keeping time somewhere else
 * is told nothing (→ DECISIONS #131). One zone rather than a country field: the
 * household already records where it lives, and this is the only feature that
 * has ever asked.
 */
const AUSTRIAN_TIMEZONES = ['Europe/Vienna'];

export function observesAustrianHolidays(timezone: string): boolean {
	return AUSTRIAN_TIMEZONES.includes(timezone);
}

/**
 * How many days the notice runs for, ending on the last shopping day: a Monday
 * holiday is announced on Thursday and stays up through Saturday. Long enough
 * to fit a weekly shop around, short enough that it is still news.
 */
export const NOTICE_DAYS = 3;

/** Sunday, in `weekdayIndex`'s Monday-is-0 numbering. */
const SUNDAY = 6;

/** Fixed-date holidays, `[month, day]`. Movable ones hang off Easter below. */
const FIXED: { key: HolidayKey; month: number; day: number }[] = [
	{ key: 'newYear', month: 1, day: 1 },
	{ key: 'epiphany', month: 1, day: 6 },
	{ key: 'labourDay', month: 5, day: 1 },
	{ key: 'assumption', month: 8, day: 15 },
	{ key: 'nationalDay', month: 10, day: 26 },
	{ key: 'allSaints', month: 11, day: 1 },
	{ key: 'christmas', month: 12, day: 25 },
	{ key: 'stStephen', month: 12, day: 26 }
];

/** Days after Easter Sunday, for the four that move with it. */
const AFTER_EASTER: { key: HolidayKey; days: number }[] = [
	{ key: 'easterMonday', days: 1 },
	{ key: 'ascension', days: 39 },
	{ key: 'whitMonday', days: 50 },
	{ key: 'corpusChristi', days: 60 }
];

/*
 * Two holidays are deliberately absent, and both are the sort of thing that
 * gets "fixed" by someone who counts the list:
 *
 * - **8 December, Mariä Empfängnis.** A public holiday, but shops have been
 *   allowed to open on it since 1995 and the chains do — warning about a day
 *   the shops are open is worse than saying nothing.
 * - **Good Friday.** Not a general public holiday in Austria (since 2019 it is
 *   a "personal holiday" you may take from your own leave), and shops open.
 *
 * The regional Landesfeiertage (St. Leopold, St. Rupert, …) are out for the
 * same reason: they close offices, not shops.
 */

/** Every shop-closing holiday in `year`, in date order. */
export function austrianHolidays(year: number): Holiday[] {
	let cached = byYear.get(year);
	if (!cached) {
		const easter = easterSunday(year);

		cached = [
			...FIXED.map(({ key, month, day }) => ({
				key,
				date: `${year}-${pad(month)}-${pad(day)}`
			})),
			...AFTER_EASTER.map(({ key, days }) => ({ key, date: addDays(easter, days) }))
		].sort((a, b) => (a.date < b.date ? -1 : 1));

		byYear.set(year, cached);
	}

	return cached;
}

/**
 * A year's worth of holidays is a dozen date computations, and the answer never
 * changes — but this is asked on every page load of every household, so the
 * work is done once per year in the process's life.
 */
const byYear = new Map<number, Holiday[]>();

/**
 * Easter Sunday in the Gregorian calendar (the anonymous Meeus/Jones/Butcher
 * computus). Valid for every year the app will ever be asked about; spot-checked
 * against the known dates in `holidays.test.ts`.
 */
export function easterSunday(year: number): CalendarDate {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;

	return `${year}-${pad(month)}-${pad(day)}`;
}

/** The holiday falling on `date`, if any. */
export function holidayOn(date: CalendarDate): HolidayKey | null {
	const year = Number(date.slice(0, 4));
	return austrianHolidays(year).find((holiday) => holiday.date === date)?.key ?? null;
}

/** Whether every shop is shut on `date` — a Sunday, or a holiday. */
export function isShopClosed(date: CalendarDate): boolean {
	return weekdayIndex(date) === SUNDAY || holidayOn(date) !== null;
}

/**
 * The closure `today` should be warned about, or null.
 *
 * The window ends on the last open day, which is by construction the day before
 * the run starts — so a run that hasn't started within `NOTICE_DAYS` is not yet
 * this notice's business, and one that started on or before `today` is past
 * warning about. That is the whole search: `NOTICE_DAYS` days of lookahead.
 *
 * Two runs are passed over: one made only of Sundays (nothing to announce), and
 * one whose holidays all land on a Sunday — 1 November on a Sunday shuts a shop
 * that was shut anyway (→ SPEC §3.6).
 */
export function closureAhead(today: CalendarDate): ShopClosure | null {
	for (let offset = 1; offset <= NOTICE_DAYS; offset++) {
		const closureDate = addDays(today, offset);
		if (!isShopClosed(closureDate)) continue;

		// Mid-run: its first day was nearer, and was considered on an earlier turn
		// (or is `today` itself, which is too late to warn about).
		const lastOpenDay = addDays(closureDate, -1);
		if (isShopClosed(lastOpenDay)) continue;

		const closure = closureFrom(closureDate, lastOpenDay);
		if (closure) return closure;
	}

	return null;
}

/** The run starting on `closureDate`, if it is worth announcing. */
function closureFrom(closureDate: CalendarDate, lastOpenDay: CalendarDate): ShopClosure | null {
	const holidays: HolidayKey[] = [];
	let closedDays = 0;
	// A holiday on a Sunday shuts nothing that wasn't shut; a run of only those
	// is a weekend.
	let closesAShoppingDay = false;

	for (let date = closureDate; isShopClosed(date); date = addDays(date, 1)) {
		const holiday = holidayOn(date);
		const sunday = weekdayIndex(date) === SUNDAY;

		if (holiday) holidays.push(holiday);
		if (holiday && !sunday) closesAShoppingDay = true;
		closedDays++;
	}

	return closesAShoppingDay ? { closureDate, holidays, closedDays, lastOpenDay } : null;
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}
