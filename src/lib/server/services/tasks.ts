/**
 * Tasks.
 *
 * Plan 02 needs one slice of this domain: "what is overdue for me", which both
 * the tab-bar badge (every `(app)` page) and the Home overdue banner read.
 * Plan 04 owns the rest — **extend this file, don't rewrite it**.
 */
import { and, asc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { CalendarDate } from '$lib/utils/dates';
import { db } from '../db';
import { members, tasks, type Member } from '../db/schema';

/** Holiday pause: away is inclusive of the return date (→ docs/DATA-MODEL.md). */
export function isAway(member: Pick<Member, 'awayUntil'>, today: CalendarDate): boolean {
	return member.awayUntil !== null && today <= member.awayUntil;
}

/**
 * `isAway` as a SQL predicate, for queries that filter paused tasks out by
 * joining `members` on the assignee. It lives next to `isAway` so the two
 * encodings of "away" can't drift — they have to agree for the tab badge, the
 * Home banner and the "n tasks due today" tile to tell the same story.
 *
 * NULL covers both "not away" and "Anyone" (no joined member row).
 */
export function assigneeNotAway(today: CalendarDate): SQL | undefined {
	return or(isNull(members.awayUntil), lt(members.awayUntil, today));
}

export type OverdueTask = {
	id: string;
	name: string;
	dueDate: CalendarDate;
	points: number;
	/** NULL = "Anyone" — it counts as overdue for every member. */
	assigneeMemberId: string | null;
};

/**
 * The overdue tasks this member is on the hook for: assigned to them, or
 * "Anyone" (→ SPEC §2.5). Oldest first, so the banner can name the worst one.
 *
 * While the member is away nothing is overdue *for them* — that is the whole
 * point of the holiday pause: no banner, no badge, no nudge (→ SPEC §5.5).
 * Tasks assigned to somebody else are never this member's problem, so no join
 * on the assignee is needed.
 */
export function listOverdueForMember(
	householdId: string,
	member: Pick<Member, 'id' | 'awayUntil'>,
	today: CalendarDate
): OverdueTask[] {
	if (isAway(member, today)) return [];

	return (
		db
			.select({
				id: tasks.id,
				name: tasks.name,
				// NULL is excluded by the `lt` below; the cast saves cloning every row.
				dueDate: sql<CalendarDate>`${tasks.dueDate}`,
				points: tasks.points,
				assigneeMemberId: tasks.assigneeMemberId
			})
			.from(tasks)
			.where(
				and(
					eq(tasks.householdId, householdId),
					// NULL due dates (undated one-offs) never compare true — as intended.
					lt(tasks.dueDate, today),
					or(eq(tasks.assigneeMemberId, member.id), isNull(tasks.assigneeMemberId))
				)
			)
			// `id` breaks ties: the Home banner names `[0]`, so without a total order
			// its copy flips between renders when two tasks share the oldest due date.
			.orderBy(asc(tasks.dueDate), asc(tasks.id))
			.all()
	);
}
