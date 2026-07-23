/**
 * History & leaderboard (→ SPEC §5.8) — the month's podium and everything the
 * household has ticked off, newest first.
 *
 * Nothing here is stored: the month is derived from completion timestamps in
 * the household's timezone (→ DECISIONS #9), and the feed is the same
 * `task_completions` rows the Tasks screen's preview reads, grouped by the day
 * they fell on locally. Points come from `tasks.ts`'s `monthPointsByMember`,
 * which the points tiles [05] and Home's standings strip [8b] also read — the
 * three surfaces can disagree about layout but never about the score.
 *
 * The feed pages by *month*: a "load more" that hands you a fortnight of
 * scrolling has no landmark to stop at, whereas "Show June" is a page you can
 * picture before you tap it. The window lives in the URL (`?from=YYYY-MM-01`),
 * so it survives a refresh, a share and a back button, and works with no
 * JavaScript at all.
 */
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import {
	addInterval,
	formatDayLabel,
	formatMonthName,
	formatTimeIn,
	isCalendarDate,
	startOfMonth,
	toCalendarDate,
	zonedStartOfDay,
	type CalendarDate
} from '$lib/utils/dates';
import { db } from '../db';
import { members, taskCompletions } from '../db/schema';
import type { HouseholdMember } from './household';
import { monthPointsByMember, type TaskContext } from './tasks';

/* ── Podium ───────────────────────────────────────────────────────────────── */

export type PodiumEntry = {
	memberId: string;
	displayName: string;
	color: string;
	points: number;
	/** Competition rank, 1-based: equal scores share a rank and the next one skips. */
	rank: number;
	/** Where the column stands left-to-right — 1st in the middle [8a]. */
	position: number;
	/** The crown. Exactly one per podium, and none while nobody has scored. */
	crowned: boolean;
};

export type Podium = {
	/** Every member, best first. Order is the ranking; `position` is the layout. */
	entries: PodiumEntry[];
	/** "resets Aug 1" — the first of next month, when the count starts over. */
	resetsOn: CalendarDate;
	/**
	 * Nobody has scored this month yet — the 1st, or a quiet household. The
	 * podium still stands (the members and their zeroes are the honest answer),
	 * but there is no winner to crown and no ranking to imply.
	 */
	leaderless: boolean;
};

/**
 * The month's standings [8a]. The roster is passed in rather than queried: the
 * layout has already read it for the avatars, and two reads could disagree
 * about who lives here.
 *
 * Members who have left keep their points in the table but not on the podium —
 * the points stayed with the house, the column they'd stand on is gone
 * (→ docs/DATA-MODEL.md "History survives deletion").
 */
export function getPodium(
	householdId: string,
	context: TaskContext,
	roster: HouseholdMember[]
): Podium {
	const pointsByMember = monthPointsByMember(householdId, context);

	// `sort` is stable, so members level on points stay in join order — which is
	// what hands the crown to the housemate who has been here longest
	// (→ DECISIONS #75), the same tiebreak rotation and the avatar stack use.
	const ranked = roster
		.map((member) => ({
			memberId: member.id,
			displayName: member.displayName,
			color: member.color,
			points: pointsByMember.get(member.id) ?? 0
		}))
		.sort((a, b) => b.points - a.points);

	const leaderless = ranked.every((entry) => entry.points === 0);
	const positions = podiumPositions(ranked.length);

	return {
		entries: ranked.map((entry, index) => ({
			...entry,
			// Competition ranking: 240 / 240 / 160 ranks 1, 1, 3.
			rank: ranked.findIndex((other) => other.points === entry.points) + 1,
			position: positions[index],
			crowned: index === 0 && !leaderless
		})),
		resetsOn: addInterval(startOfMonth(context.today), 1, 'month'),
		leaderless
	};
}

/**
 * Where each ranked column stands, left to right: the winner in the middle and
 * everybody else alternating outwards, so three members read 2 · 1 · 3 like
 * [8a] draws and five read 4 · 2 · 1 · 3 · 5. Two members have no middle to
 * stand in, so the winner takes the left — a leaderboard rather than a podium.
 *
 * Returned as positions rather than a reordered array so the markup can stay in
 * rank order: a screen reader should hear the standings, not the choreography.
 */
function podiumPositions(count: number): number[] {
	// A household always has at least the member looking at it, but the centre
	// of nothing is -1 and that would be a real CSS `order`.
	if (count < 1) return [];

	const center = Math.floor((count - 1) / 2);
	const positions = [center];

	let left = center;
	let right = center;

	for (let index = 1; index < count; index++) {
		// Alternate outwards, falling to whichever side still has room — with an
		// even count one side runs out a column before the other.
		if ((index % 2 === 1 && left > 0) || right >= count - 1) positions.push(--left);
		else positions.push(++right);
	}

	return positions;
}

/* ── Completed feed ───────────────────────────────────────────────────────── */

export type FeedEntry = {
	id: string;
	taskName: string;
	/** The snapshot, so a departed housemate keeps their name in the feed. */
	memberName: string;
	/** From the *current* member row; null once that housemate has left. */
	memberColor: string | null;
	points: number;
	/** Household-local clock time, e.g. "8:20". */
	time: string;
};

export type FeedDay = {
	date: CalendarDate;
	/** "Today" · "Yesterday" · "Mon 14 Jul". */
	label: string;
	entries: FeedEntry[];
};

export type CompletedFeed = {
	/** Newest day first; days with nothing in them simply aren't here. */
	days: FeedDay[];
	/** The month the window opens on, as its 1st — what `?from=` echoes back. */
	from: CalendarDate;
	/**
	 * The next month back that actually holds something, for "Show June".
	 * Null once the window reaches the household's first completion.
	 */
	older: { from: CalendarDate; label: string } | null;
};

/**
 * The completed feed from the start of `from`'s month up to now, grouped by the
 * household-local day each completion fell on (→ SPEC §5.8). Skips never appear
 * — they're bookkeeping, not something to look back on (→ SPEC §5.3).
 *
 * `from` is whatever arrived in the query string: anything that isn't a
 * calendar date this household could have completions in falls back to the
 * current month, so a hand-edited URL shows the default rather than an error.
 */
export function getCompletedFeed(
	householdId: string,
	context: TaskContext,
	from: unknown
): CompletedFeed {
	const thisMonth = startOfMonth(context.today);
	// A future month would be an empty window with no way back, so anything
	// ahead of this one is read as "no paging asked for".
	const requested = isCalendarDate(from) && from < thisMonth ? startOfMonth(from) : thisMonth;
	const windowStart = zonedStartOfDay(requested, context.timezone);

	const rows = db
		.select({
			id: taskCompletions.id,
			taskName: taskCompletions.taskName,
			memberName: taskCompletions.memberName,
			memberColor: members.color,
			points: taskCompletions.points,
			completedAt: taskCompletions.completedAt
		})
		.from(taskCompletions)
		.leftJoin(members, eq(taskCompletions.memberId, members.id))
		.where(
			and(
				eq(taskCompletions.householdId, householdId),
				eq(taskCompletions.action, 'done'),
				gte(taskCompletions.completedAt, windowStart)
			)
		)
		// `id` breaks ties for completions logged in the same millisecond.
		.orderBy(desc(taskCompletions.completedAt), desc(taskCompletions.id))
		.all();

	const days: FeedDay[] = [];
	let day: FeedDay | undefined;

	for (const { completedAt, ...entry } of rows) {
		const date = toCalendarDate(completedAt, context.timezone);

		// Rows arrive newest first, so the only group a completion can join is the
		// one being built — no lookup table, and the days come out in feed order.
		if (!day || day.date !== date) {
			day = { date, label: formatDayLabel(date, context.today), entries: [] };
			days.push(day);
		}

		day.entries.push({ ...entry, time: formatTimeIn(completedAt, context.timezone) });
	}

	return {
		days,
		from: requested,
		older: olderMonth(householdId, windowStart, context)
	};
}

/**
 * The most recent month *before* the window that has anything in it, so "load
 * more" always reveals something. Walking back a calendar month at a time would
 * make a household that went quiet over the summer take three taps to show one
 * June evening; asking the table where the next completion actually is takes
 * one (→ the index on `(householdId, completedAt)`).
 */
function olderMonth(
	householdId: string,
	windowStart: Date,
	context: TaskContext
): { from: CalendarDate; label: string } | null {
	const row = db
		.select({ at: sql<number | null>`max(${taskCompletions.completedAt})` })
		.from(taskCompletions)
		.where(
			and(
				eq(taskCompletions.householdId, householdId),
				eq(taskCompletions.action, 'done'),
				lt(taskCompletions.completedAt, windowStart)
			)
		)
		.get();

	// `max()` over no rows is a single NULL, not an empty result.
	if (row?.at == null) return null;

	const from = startOfMonth(toCalendarDate(new Date(row.at), context.timezone));

	return { from, label: formatMonthName(from, context.today) };
}
