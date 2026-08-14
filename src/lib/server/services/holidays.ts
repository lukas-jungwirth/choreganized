/**
 * The holiday shopping notice (→ SPEC §3.6) — "the shops are shut on Monday,
 * and Saturday is your last chance".
 *
 * Two surfaces over one closure: a banner on Home and on Shopping for the three
 * days leading up to the last shopping day, and a single push on the first of
 * those mornings. `utils/holidays.ts` owns *which* days those are — pure
 * calendar, the same answer for every household — and this file owns the two
 * things the calendar can't know: whether the push has gone out, and whether
 * this reader has waved the banner away.
 *
 * The shape is deliberately the one `services/reminders.ts` already uses: claim
 * the idempotency flag before sending, let a member who is away leave it
 * unclaimed (their notice is still waiting the morning they're back), and let a
 * member who switched the preference off spend it (→ DECISIONS #60, #131).
 */
import { and, asc, eq, isNull, lt } from 'drizzle-orm';
import { addDays, isCalendarDate, todayIn, type CalendarDate } from '$lib/utils/dates';
import {
	closureAhead,
	observesAustrianHolidays,
	type HolidayKey,
	type ShopClosure
} from '$lib/utils/holidays';
import { db } from '../db';
import { holidayNotices, households, members } from '../db/schema';
import { sendToUser, type PayloadFor } from '../push';
import { isAway } from './tasks';

/** What the banner renders — the closure, plus which notice a tap answers. */
export type HolidayNotice = {
	/** Identity: the first shut day. Posted back by dismiss / remind-tomorrow. */
	closureDate: CalendarDate;
	/** The holidays being shut for, in date order — the catalog names them. */
	holidays: HolidayKey[];
	/** Days in a row with no shop open, Sundays counted. */
	closedDays: number;
	/** The last day to shop — what the notice is actually asking you to use. */
	lastOpenDay: CalendarDate;
};

export type HolidaySweep = {
	/** Members told about a closure — at most one push each, per closure. */
	notices: number;
	/** Devices that took one. */
	devices: number;
};

/**
 * The closure to put in front of this member today, or null.
 *
 * Called from the `(app)` layout load, i.e. on every document load in the app,
 * so the cheap half runs first: on all but ~35 days of the year `closureAhead`
 * comes back null from pure arithmetic and no query is made at all.
 */
export function holidayNoticeFor(
	householdId: string,
	memberId: string,
	timezone: string,
	today: CalendarDate
): HolidayNotice | null {
	if (!observesAustrianHolidays(timezone)) return null;

	const closure = closureAhead(today);
	if (!closure) return null;

	// Filtered by household as well as by member, though a membership belongs to
	// exactly one household: that is the convention every service here follows,
	// and it is the boundary rather than a comment about one (→ ARCHITECTURE.md
	// "Household scoping").
	const hidden = db
		.select({ hiddenUntil: holidayNotices.hiddenUntil })
		.from(holidayNotices)
		.where(
			and(
				eq(holidayNotices.householdId, householdId),
				eq(holidayNotices.memberId, memberId),
				eq(holidayNotices.closureDate, closure.closureDate)
			)
		)
		.get()?.hiddenUntil;

	// Dismissed writes the closure date, which no day in the window ever reaches;
	// "remind me tomorrow" writes tomorrow, and today is then the day after.
	if (hidden !== null && hidden !== undefined && today < hidden) return null;

	return closure;
}

/** The banner's two answers (→ SPEC §3.6). */
export type HolidayAnswer = 'tomorrow' | 'dismiss';

/**
 * What the banner posts, or null if it wasn't the banner. Exported so the two
 * routes that mount the action — Home and Shopping, which show the same notice
 * — are a parse and a call rather than two copies of a validation
 * (→ `components/HolidayNotice.svelte`).
 */
export function readHolidayAnswer(
	form: FormData
): { closureDate: CalendarDate; answer: HolidayAnswer } | null {
	const closureDate = form.get('closureDate');
	const answer = form.get('answer');

	if (!isCalendarDate(closureDate)) return null;
	if (answer !== 'tomorrow' && answer !== 'dismiss') return null;

	return { closureDate, answer };
}

/**
 * Put this member's notice away — one write behind both answers, differing only
 * in the date they hide it until (→ `db/schema.ts`, DECISIONS #131). "Remind me
 * tomorrow" writes tomorrow; **"Got it" writes the closure date itself**, which
 * no day in the window can reach.
 *
 * Reads the household's own clock rather than taking one, because the question
 * it has to answer — "is that closure the one currently on screen?" — is the
 * same question `holidayNoticeFor` answers, and the two must not be able to
 * disagree. So the form is trusted with exactly one thing: *which* closure it is
 * answering. A form naming any other date is answering a notice that is no
 * longer up (a tab left open over a weekend), and is dropped rather than
 * written.
 *
 * Written even for a closure nobody has been pushed about yet: the banner is up
 * from the first day of the window while the push waits for 08:00, so a dismissal
 * at seven in the morning has to stick (and stop that morning's push).
 *
 * @returns whether it landed — false when the form named the wrong closure.
 */
export function answerHolidayNotice(
	householdId: string,
	memberId: string,
	closureDate: CalendarDate,
	answer: HolidayAnswer
): boolean {
	const timezone = db
		.select({ timezone: households.timezone })
		.from(households)
		.where(eq(households.id, householdId))
		.get()?.timezone;

	if (!timezone || !observesAustrianHolidays(timezone)) return false;

	const today = todayIn(timezone);
	if (closureAhead(today)?.closureDate !== closureDate) return false;

	const hiddenUntil = answer === 'dismiss' ? closureDate : addDays(today, 1);

	db.insert(holidayNotices)
		.values({ householdId, memberId, closureDate, hiddenUntil })
		.onConflictDoUpdate({
			target: [holidayNotices.memberId, holidayNotices.closureDate],
			set: { hiddenUntil }
		})
		.run();

	return true;
}

/**
 * One household's morning sweep, from 08:00 household-local — the same gate and
 * the same "answering nothing is the normal case" shape as the task reminders
 * (→ `cron.ts`). On the ~330 days with no closure in view this returns before
 * touching the database.
 *
 * @param today the household-local calendar date
 * @param now the instant the flags are stamped with
 */
export async function sendClosureReminders(
	householdId: string,
	timezone: string,
	today: CalendarDate,
	now: Date = new Date()
): Promise<HolidaySweep> {
	if (!observesAustrianHolidays(timezone)) return { notices: 0, devices: 0 };

	const closure = closureAhead(today);
	if (!closure) return { notices: 0, devices: 0 };

	// Rows for closures already under way can never be read again — the notice
	// window ends before the first shut day. Swept here rather than in a job of
	// its own: this is the one place that already knows a closure is in play,
	// and it runs a dozen times a year.
	purgePastNotices(householdId, today);

	const roster = db
		.select({
			id: members.id,
			userId: members.userId,
			awayUntil: members.awayUntil,
			notifyShopClosures: members.notifyShopClosures
		})
		.from(members)
		.where(eq(members.householdId, householdId))
		.orderBy(asc(members.joinedAt), asc(members.id))
		.all();

	const payload = payloadFor(closure, today);
	const outbox: string[] = [];

	for (const member of roster) {
		// Away is the one state that leaves the flag alone: a housemate who gets
		// home on the Friday should still hear about Monday (→ DECISIONS #60).
		// Nothing else about the notice pauses — the banner is passive, and a
		// closure is the household's news rather than anybody's chore.
		if (isAway(member, today)) continue;

		// Already waved away on a phone this morning, before the sweep ran.
		if (!claim(householdId, member.id, closure.closureDate, now)) continue;

		// Switching the preference off silences the phone; it doesn't hold the
		// notice open, which is why the claim above happens either way.
		if (!member.notifyShopClosures) continue;

		outbox.push(member.userId);
	}

	// `sendToUser` never throws (→ push.ts).
	const delivered = await Promise.all(outbox.map((userId) => sendToUser(userId, payload)));

	return {
		notices: outbox.length,
		devices: delivered.reduce((total, count) => total + count, 0)
	};
}

/**
 * Take ownership of one member's push, and refuse if the notice is hidden.
 *
 * Both halves are one statement on purpose. The insert is the flag — a row with
 * `pushedAt` set means "told" — and the conflict clause is what makes a second
 * sweep, a restart mid-morning or two ticks overlapping cost nothing: it only
 * writes where `pushedAt` is still NULL *and* nothing has been hidden. Whoever
 * loses sees `changes === 0` and moves on.
 *
 * `hiddenUntil IS NULL` rather than a date comparison because any hidden date at
 * all was written during this notice's own window: there is no way to be hidden
 * and owed a push on the same closure.
 */
function claim(
	householdId: string,
	memberId: string,
	closureDate: CalendarDate,
	at: Date
): boolean {
	const result = db
		.insert(holidayNotices)
		.values({ householdId, memberId, closureDate, pushedAt: at })
		.onConflictDoUpdate({
			target: [holidayNotices.memberId, holidayNotices.closureDate],
			set: { pushedAt: at },
			setWhere: and(isNull(holidayNotices.pushedAt), isNull(holidayNotices.hiddenUntil))
		})
		.run();

	return result.changes === 1;
}

/** Rows for closures that have already begun; nothing can read them again. */
export function purgePastNotices(householdId: string, today: CalendarDate): number {
	return db
		.delete(holidayNotices)
		.where(and(eq(holidayNotices.householdId, householdId), lt(holidayNotices.closureDate, today)))
		.run().changes;
}

/**
 * The push (→ SPEC §3.6). A function rather than a payload, because it goes to
 * people who aren't making a request and each of them may read in a different
 * language (→ `push.ts` `PayloadFor`).
 *
 * Title and body carry the two halves the banner shows: what is shut, and which
 * day to shop on. One tag per closure, so a second household member's device
 * and a re-send after a restart replace rather than stack.
 *
 * `today` goes with the last open day so the body can say "today" on the
 * morning it *is* today — which the ordinary first-morning send never is, but a
 * sweep catching up after downtime can be.
 */
function payloadFor(closure: ShopClosure, today: CalendarDate): PayloadFor {
	return (m) => ({
		title: m.push.shopsClosed(m.holiday.names(closure.holidays), closure.closedDays),
		body: m.push.shopsClosedBody(closure.lastOpenDay, today),
		tag: `shops-closed-${closure.closureDate}`,
		url: '/shopping'
	});
}
