/**
 * Tasks (→ SPEC §5) — recurring chores, their points, and the lifecycle that
 * moves them along.
 *
 * The task row *is* the current occurrence (→ DECISIONS #5): there is no
 * occurrences table, so completing, skipping, snoozing or rescheduling a task
 * rewrites the row it happened to and logs an immutable `task_completions`
 * snapshot next to it. Everything that touches more than one table runs in a
 * transaction, and every function is `householdId`-first — a task id from
 * another household finds nothing.
 *
 * Plan 02 opened this file with `listOverdueForMember`, which the tab badge and
 * the Home banner share; plan 04 built the rest around it.
 */
import { and, asc, desc, eq, gte, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
	addInterval,
	formatDayStamp,
	formatTimeIn,
	isCalendarDate,
	startOfMonth,
	toCalendarDate,
	zonedStartOfDay,
	type CalendarDate
} from '$lib/utils/dates';
import {
	POINTS_MAX,
	RECUR_INTERVAL_MAX,
	TASK_NAME_MAX,
	formatRepeat,
	type RecurUnit
} from '$lib/utils/tasks';
import { db } from '../db';
import { members, taskCompletions, tasks, type Member } from '../db/schema';

/**
 * better-sqlite3 gives Drizzle a single connection, so a plain `db` read inside
 * a `db.transaction` callback runs *in* that transaction. Only the helpers that
 * write, or that must see this transaction's own writes, need the `tx` handle.
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The household clock every function here answers to. */
export type TaskContext = {
	today: CalendarDate;
	timezone: string;
};

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

/* ── The to-do list ───────────────────────────────────────────────────────── */

export type TaskAssignee = {
	id: string;
	displayName: string;
	color: string;
	awayUntil: CalendarDate | null;
};

export type TaskListItem = {
	id: string;
	name: string;
	points: number;
	recurUnit: RecurUnit;
	recurInterval: number;
	/** NULL = an undated one-off — it sits at the bottom of the list forever. */
	dueDate: CalendarDate | null;
	rotate: boolean;
	/** NULL = "Anyone" (→ docs/DATA-MODEL.md). */
	assignee: TaskAssignee | null;
	/** For "One-off · added by Elisabeth"; null once that housemate has left. */
	createdByName: string | null;
	/**
	 * The household-local mornings the two nudges went out on, for the overdue
	 * card's footer. Calendar dates rather than instants, because the footer only
	 * ever says which morning it was (→ `formatReminderNote`).
	 */
	dueRemindedOn: CalendarDate | null;
	overdueRemindedOn: CalendarDate | null;
	/**
	 * The holiday pause is actually holding this one back — the assignee is away
	 * *and* it has come due. The row goes quiet instead of red [4a].
	 *
	 * Their tasks further out aren't paused yet: nothing is being suppressed, so
	 * they read like any other upcoming task.
	 */
	paused: boolean;
};

export type TaskSectionKey = 'overdue' | 'today' | 'upcoming' | 'paused' | 'undated';

export type TaskSection = {
	key: TaskSectionKey;
	label: string;
	tasks: TaskListItem[];
};

export type TaskList = {
	/**
	 * Only the sections that have something in them, in reading order. The
	 * "Overdue · {n}" header counts `sections[…].tasks`; there is deliberately no
	 * separate total here, because the tab badge's count is a *different* number
	 * — this member's overdue tasks, from `listOverdueForMember` — and two
	 * similarly-named counts on one type is how they end up swapped.
	 */
	sections: TaskSection[];
	/** The segmented control's "To do · {n}" — every task, every section. */
	total: number;
};

/**
 * Sections in the order [4a] stacks them, plus two the design never had to
 * draw. Paused sits low because that is the whole point of the holiday pause —
 * a task nobody is expected to do shouldn't be the first thing on the screen —
 * and undated one-offs stay last (→ SPEC §5.1).
 */
const SECTION_ORDER: { key: TaskSectionKey; label: string }[] = [
	{ key: 'overdue', label: 'Overdue' },
	{ key: 'today', label: 'Today' },
	{ key: 'upcoming', label: 'Upcoming' },
	{ key: 'paused', label: 'Paused' },
	{ key: 'undated', label: 'No date' }
];

/**
 * Which section a task belongs in. The one rule that isn't a date comparison:
 * **an away member's task is never overdue** (→ SPEC §5.5, DECISIONS #33), so
 * anything of theirs that has come due drops out of the alarming sections
 * entirely rather than being rendered red with an apology next to it.
 *
 * `paused` already carries "and it has come due", so the section and the
 * treatment the row wears are the same question asked once.
 */
function sectionFor(task: TaskListItem, today: CalendarDate): TaskSectionKey {
	if (!task.dueDate) return 'undated';
	if (task.paused) return 'paused';
	return task.dueDate > today ? 'upcoming' : task.dueDate < today ? 'overdue' : 'today';
}

export function getTaskList(householdId: string, context: TaskContext): TaskList {
	const assignee = alias(members, 'assignee');
	const creator = alias(members, 'creator');

	const rows = db
		.select({
			id: tasks.id,
			name: tasks.name,
			points: tasks.points,
			recurUnit: tasks.recurUnit,
			recurInterval: tasks.recurInterval,
			dueDate: tasks.dueDate,
			rotate: tasks.rotate,
			dueReminderSentAt: tasks.dueReminderSentAt,
			overdueReminderSentAt: tasks.overdueReminderSentAt,
			assigneeId: assignee.id,
			assigneeName: assignee.displayName,
			assigneeColor: assignee.color,
			assigneeAwayUntil: assignee.awayUntil,
			createdByName: creator.displayName
		})
		.from(tasks)
		.leftJoin(assignee, eq(tasks.assigneeMemberId, assignee.id))
		.leftJoin(creator, eq(tasks.createdByMemberId, creator.id))
		.where(eq(tasks.householdId, householdId))
		// SQLite sorts NULL first, and an undated one-off belongs at the bottom —
		// hence the explicit first key. `id` last, so a household seeded in one
		// millisecond still has one stable order instead of flickering.
		.orderBy(sql`${tasks.dueDate} is null`, asc(tasks.dueDate), asc(tasks.createdAt), asc(tasks.id))
		.all();

	const buckets = new Map<TaskSectionKey, TaskListItem[]>();

	for (const row of rows) {
		const assigned: TaskAssignee | null = row.assigneeId
			? {
					id: row.assigneeId,
					displayName: row.assigneeName ?? '',
					color: row.assigneeColor ?? 'var(--member-sage)',
					awayUntil: row.assigneeAwayUntil
				}
			: null;

		const task: TaskListItem = {
			id: row.id,
			name: row.name,
			points: row.points,
			recurUnit: row.recurUnit,
			recurInterval: row.recurInterval,
			dueDate: row.dueDate,
			rotate: row.rotate,
			assignee: assigned,
			createdByName: row.createdByName,
			dueRemindedOn: localDateOf(row.dueReminderSentAt, context.timezone),
			overdueRemindedOn: localDateOf(row.overdueReminderSentAt, context.timezone),
			paused:
				assigned !== null &&
				isAway(assigned, context.today) &&
				row.dueDate !== null &&
				row.dueDate <= context.today
		};

		const key = sectionFor(task, context.today);
		const bucket = buckets.get(key);
		if (bucket) bucket.push(task);
		else buckets.set(key, [task]);
	}

	const sections = SECTION_ORDER.filter((section) => buckets.get(section.key)?.length).map(
		(section) => ({ ...section, tasks: buckets.get(section.key) ?? [] })
	);

	return { sections, total: rows.length };
}

/** The household-local day an instant fell on — the reminder footer's unit. */
function localDateOf(at: Date | null, timezone: string): CalendarDate | null {
	return at ? toCalendarDate(at, timezone) : null;
}

/* ── Creating & editing ───────────────────────────────────────────────────── */

export type TaskInput = {
	name: string;
	points: number;
	recurUnit: RecurUnit;
	recurInterval: number;
	/** NULL is only honoured for one-offs — a recurrence needs a first date. */
	dueDate: CalendarDate | null;
	/** NULL = "Anyone". An id from another household is treated as one. */
	assigneeMemberId: string | null;
	rotate: boolean;
};

/**
 * Trimmed, clamped, and reduced to the two invariants the rest of the file
 * relies on: a recurring task always has a due date to recur from, and `rotate`
 * always has somebody to rotate away from.
 */
function normalize(householdId: string, input: TaskInput, today: CalendarDate) {
	const oneOff = input.recurUnit === 'none';
	const assigneeMemberId = resolveMemberId(householdId, input.assigneeMemberId);

	return {
		name: input.name.trim().slice(0, TASK_NAME_MAX),
		points: clamp(input.points, 0, POINTS_MAX),
		recurUnit: input.recurUnit,
		recurInterval: oneOff ? 1 : clamp(input.recurInterval, 1, RECUR_INTERVAL_MAX),
		dueDate: isCalendarDate(input.dueDate) ? input.dueDate : oneOff ? null : today,
		assigneeMemberId,
		rotate: input.rotate && assigneeMemberId !== null
	};
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * A member id, but only if this household owns it. Anything else — forged, or
 * a housemate who left a second ago — becomes "Anyone", which is exactly what
 * happens to their tasks anyway (→ DECISIONS #12).
 */
function resolveMemberId(
	householdId: string,
	memberId: string | null,
	tx: Transaction | typeof db = db
): string | null {
	if (!memberId) return null;

	const member = tx
		.select({ id: members.id })
		.from(members)
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.get();

	return member?.id ?? null;
}

export function createTask(
	householdId: string,
	memberId: string,
	input: TaskInput,
	today: CalendarDate
): string {
	const task = db
		.insert(tasks)
		.values({
			householdId,
			...normalize(householdId, input, today),
			createdByMemberId: memberId
		})
		.returning({ id: tasks.id })
		.get();

	return task.id;
}

/**
 * Editing rewrites the occurrence, so moving the due date resets both reminder
 * flags — otherwise a task pushed to next week would keep the "already nudged"
 * marks of the week it was pulled out of (→ docs/DATA-MODEL.md).
 */
export function updateTask(
	householdId: string,
	taskId: string,
	input: TaskInput,
	today: CalendarDate
): boolean {
	return db.transaction((tx) => {
		const current = tx
			.select({ dueDate: tasks.dueDate })
			.from(tasks)
			.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
			.get();

		if (!current) return false;

		const values = normalize(householdId, input, today);
		const rescheduled = values.dueDate !== current.dueDate;

		tx.update(tasks)
			.set({
				...values,
				...(rescheduled ? { dueReminderSentAt: null, overdueReminderSentAt: null } : {}),
				updatedAt: new Date()
			})
			.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
			.run();

		return true;
	});
}

/** History keeps its snapshots — deleting a task never costs anybody points. */
export function deleteTask(householdId: string, taskId: string): boolean {
	const result = db
		.delete(tasks)
		.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
		.run();

	return result.changes > 0;
}

/* ── Doing, skipping, undoing ─────────────────────────────────────────────── */

/**
 * Everything Undo needs to put the world back, including the columns only a
 * deleted one-off would need. It travels to the browser with the completion and
 * comes back on the Undo form (→ DECISIONS): all of it is data the same member
 * could set through the edit sheet anyway, so nothing here is a capability they
 * didn't already have, and the alternative — parking the snapshot in server
 * memory — loses the undo to a redeploy.
 */
export type TaskSnapshot = {
	id: string;
	name: string;
	points: number;
	recurUnit: RecurUnit;
	recurInterval: number;
	dueDate: CalendarDate | null;
	assigneeMemberId: string | null;
	rotate: boolean;
	createdByMemberId: string | null;
	/**
	 * ms epoch. Carried because a resurrected one-off would otherwise take a
	 * fresh `createdAt` from the schema default and jump to the bottom of the
	 * undated section — an undo has to leave the list in the order it found it.
	 */
	createdAt: number;
	/** ms epoch — the flags of the occurrence that was just closed. */
	dueReminderSentAt: number | null;
	overdueReminderSentAt: number | null;
};

export type TaskActionKind = 'done' | 'skipped';

export type CompletionResult = {
	completionId: string;
	action: TaskActionKind;
	taskName: string;
	/** What was actually logged: the task's points, or 0 for a skip. */
	points: number;
	memberName: string;
	/** NULL for a one-off — the row is gone, only the history entry remains. */
	nextDueDate: CalendarDate | null;
	/** Who holds it next, rotated or not; NULL = Anyone. */
	nextAssigneeName: string | null;
	/** It changed hands — the difference between "their turn next" and "still theirs". */
	rotated: boolean;
	snapshot: TaskSnapshot;
};

/**
 * Mark a task done: log it, hand the points to whoever tapped, and move the
 * task on (→ docs/DATA-MODEL.md "Completion algorithm", SPEC §5.4).
 */
export function completeTask(
	householdId: string,
	taskId: string,
	memberId: string,
	today: CalendarDate
): CompletionResult | null {
	return logTaskAction(householdId, taskId, memberId, today, 'done');
}

/**
 * Skip: the same move down the calendar, but worth nothing and kept out of the
 * history feed (→ SPEC §5.3). The row is still written, so "who keeps skipping
 * the bins" is answerable later.
 */
export function skipTask(
	householdId: string,
	taskId: string,
	memberId: string,
	today: CalendarDate
): CompletionResult | null {
	return logTaskAction(householdId, taskId, memberId, today, 'skipped');
}

function logTaskAction(
	householdId: string,
	taskId: string,
	memberId: string,
	today: CalendarDate,
	action: TaskActionKind
): CompletionResult | null {
	return db.transaction((tx) => {
		const task = tx
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
			.get();

		if (!task) return null;

		// One read, three uses: it validates the actor, names them for the
		// snapshot, and is the rotation order (→ docs/DATA-MODEL.md).
		const roster = tx
			.select({ id: members.id, displayName: members.displayName })
			.from(members)
			.where(eq(members.householdId, householdId))
			.orderBy(asc(members.joinedAt), asc(members.id))
			.all();

		const actor = roster.find((member) => member.id === memberId);
		if (!actor) return null;

		const points = action === 'done' ? task.points : 0;

		const completion = tx
			.insert(taskCompletions)
			.values({
				householdId,
				taskId: task.id,
				// Snapshots, so history survives the task and the member
				// (→ docs/DATA-MODEL.md "History survives deletion").
				taskName: task.name,
				points,
				action,
				memberId: actor.id,
				memberName: actor.displayName
			})
			.returning({ id: taskCompletions.id })
			.get();

		const snapshot: TaskSnapshot = {
			id: task.id,
			name: task.name,
			points: task.points,
			recurUnit: task.recurUnit,
			recurInterval: task.recurInterval,
			dueDate: task.dueDate,
			assigneeMemberId: task.assigneeMemberId,
			rotate: task.rotate,
			createdByMemberId: task.createdByMemberId,
			createdAt: task.createdAt.getTime(),
			dueReminderSentAt: task.dueReminderSentAt?.getTime() ?? null,
			overdueReminderSentAt: task.overdueReminderSentAt?.getTime() ?? null
		};

		const result = {
			completionId: completion.id,
			action,
			taskName: task.name,
			points,
			memberName: actor.displayName,
			snapshot
		};

		if (task.recurUnit === 'none') {
			// A one-off is done being a task. The completion row we just wrote has
			// its `taskId` nulled by the FK, which is the honest answer: the task no
			// longer exists. Undo puts the row back under the same id.
			tx.delete(tasks)
				.where(and(eq(tasks.id, task.id), eq(tasks.householdId, householdId)))
				.run();

			return { ...result, nextDueDate: null, nextAssigneeName: null, rotated: false };
		}

		// Counted from the day it was actually done, not from the date it missed,
		// so an overdue weekly task gets a full week rather than reappearing
		// tomorrow (→ DECISIONS #6).
		const nextDueDate = addInterval(today, task.recurInterval, task.recurUnit);

		const current = roster.findIndex((member) => member.id === task.assigneeMemberId);
		// Wrapping through join order; a departed assignee is already NULL, and
		// with one member there is nobody to alternate with.
		const nextAssigneeId =
			task.rotate && current !== -1
				? roster[(current + 1) % roster.length].id
				: task.assigneeMemberId;

		tx.update(tasks)
			.set({
				dueDate: nextDueDate,
				assigneeMemberId: nextAssigneeId,
				// A new occurrence has been nudged about exactly nothing.
				dueReminderSentAt: null,
				overdueReminderSentAt: null,
				updatedAt: new Date()
			})
			.where(and(eq(tasks.id, task.id), eq(tasks.householdId, householdId)))
			.run();

		return {
			...result,
			nextDueDate,
			nextAssigneeName: roster.find((member) => member.id === nextAssigneeId)?.displayName ?? null,
			rotated: nextAssigneeId !== task.assigneeMemberId
		};
	});
}

/**
 * Undo a completion (→ SPEC §5.4): the history row goes, the task goes back to
 * the due date, assignee and reminder flags it had a moment ago — and if it was
 * a one-off, the row itself comes back under its original id.
 *
 * Returns false when there is nothing to undo, which is the honest answer to
 * the second tap on a button that already worked.
 */
export function undoCompletion(
	householdId: string,
	completionId: string,
	snapshot: TaskSnapshot
): boolean {
	return db.transaction((tx) => {
		const removed = tx
			.delete(taskCompletions)
			.where(
				and(eq(taskCompletions.id, completionId), eq(taskCompletions.householdId, householdId))
			)
			.run();

		if (removed.changes === 0) return false;

		const assigneeMemberId = resolveMemberId(householdId, snapshot.assigneeMemberId, tx);
		const flags = {
			dueReminderSentAt: instantOf(snapshot.dueReminderSentAt),
			overdueReminderSentAt: instantOf(snapshot.overdueReminderSentAt)
		};

		const restored = tx
			.update(tasks)
			.set({
				dueDate: snapshot.dueDate,
				assigneeMemberId,
				...flags,
				updatedAt: new Date()
			})
			.where(and(eq(tasks.id, snapshot.id), eq(tasks.householdId, householdId)))
			.run();

		// Nothing to update means the row was deleted — a one-off. Put it back
		// whole, id included, so anything that referenced it still does.
		if (restored.changes === 0) {
			tx.insert(tasks)
				.values({
					id: snapshot.id,
					householdId,
					name: snapshot.name.slice(0, TASK_NAME_MAX),
					points: clamp(snapshot.points, 0, POINTS_MAX),
					recurUnit: snapshot.recurUnit,
					recurInterval: clamp(snapshot.recurInterval, 1, RECUR_INTERVAL_MAX),
					dueDate: isCalendarDate(snapshot.dueDate) ? snapshot.dueDate : null,
					assigneeMemberId,
					rotate: snapshot.rotate && assigneeMemberId !== null,
					createdByMemberId: resolveMemberId(householdId, snapshot.createdByMemberId, tx),
					// Undated one-offs are ordered by this, so the row has to come
					// back where it was rather than at the bottom of the section.
					createdAt: instantOf(snapshot.createdAt) ?? new Date(),
					...flags
				})
				.run();
		}

		return true;
	});
}

function instantOf(at: number | null): Date | null {
	return typeof at === 'number' && Number.isFinite(at) ? new Date(at) : null;
}

/**
 * Snooze / reschedule (→ SPEC §5.5). The flags are cleared because this is a
 * different occurrence now: the nudges get to fire again for the new date.
 */
export function snoozeTask(householdId: string, taskId: string, dueDate: CalendarDate): boolean {
	if (!isCalendarDate(dueDate)) return false;

	const result = db
		.update(tasks)
		.set({
			dueDate,
			dueReminderSentAt: null,
			overdueReminderSentAt: null,
			updatedAt: new Date()
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
		.run();

	return result.changes > 0;
}

/**
 * Hand a task to somebody else, or to nobody (→ SPEC §5.3). The occurrence
 * hasn't changed, so the reminder flags stand: they record that the household
 * was nudged, not who read it.
 */
export function reassignTask(
	householdId: string,
	taskId: string,
	memberId: string | null
): boolean {
	const assigneeMemberId = resolveMemberId(householdId, memberId);

	const values: { assigneeMemberId: string | null; rotate?: boolean; updatedAt: Date } = {
		assigneeMemberId,
		updatedAt: new Date()
	};

	// "Alternate each time" has nobody to alternate from once it's anyone's.
	if (assigneeMemberId === null) values.rotate = false;

	const result = db
		.update(tasks)
		.set(values)
		.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
		.run();

	return result.changes > 0;
}

/**
 * The holiday pause (→ SPEC §5.5). A return date already in the past is the
 * same as no holiday at all, so it clears rather than being stored as a lie.
 */
export function setAway(
	householdId: string,
	memberId: string,
	until: CalendarDate | null,
	today: CalendarDate
): boolean {
	const awayUntil = until && isCalendarDate(until) && until >= today ? until : null;

	const result = db
		.update(members)
		.set({ awayUntil })
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.run();

	return result.changes > 0;
}

/* ── Points ───────────────────────────────────────────────────────────────── */

/**
 * Points scored this household-local calendar month, per member. The month is
 * always derived from the completion timestamps — no reset job, and every past
 * month stays answerable (→ DECISIONS #9).
 *
 * Completions whose member has left keep their points in the table but not in
 * this map: the points stayed with the house, the tile they'd sit on is gone.
 */
export function monthPointsByMember(
	householdId: string,
	context: TaskContext
): Map<string, number> {
	const monthStart = zonedStartOfDay(startOfMonth(context.today), context.timezone);

	const totals = db
		.select({
			memberId: taskCompletions.memberId,
			points: sql<number>`sum(${taskCompletions.points})`.mapWith(Number)
		})
		.from(taskCompletions)
		.where(
			and(
				eq(taskCompletions.householdId, householdId),
				// Skips are worth nothing and are not achievements (→ SPEC §5.3).
				eq(taskCompletions.action, 'done'),
				gte(taskCompletions.completedAt, monthStart)
			)
		)
		.groupBy(taskCompletions.memberId)
		.all();

	return new Map(
		totals
			.filter((row): row is { memberId: string; points: number } => row.memberId !== null)
			.map((row) => [row.memberId, row.points])
	);
}

export type Standing = {
	/** This member's points this month. */
	points: number;
	/** Whoever the comparison is against: the runner-up if you lead, else the leader. */
	rival: { displayName: string; points: number } | null;
	state: 'leading' | 'tied' | 'behind' | 'alone';
};

/**
 * The celebration modal's live standings line, "You're now leading 240 – 235"
 * [4d]. Same competition logic as Home's standings strip: you look down at the
 * runner-up while you lead, and up at the leader while you don't.
 */
export function memberStanding(
	memberId: string,
	roster: { id: string; displayName: string }[],
	points: Map<string, number>
): Standing {
	const mine = points.get(memberId) ?? 0;

	const others = roster
		.filter((member) => member.id !== memberId)
		.map((member) => ({ displayName: member.displayName, points: points.get(member.id) ?? 0 }))
		.sort((a, b) => b.points - a.points);

	const best = others[0];
	if (!best) return { points: mine, rival: null, state: 'alone' };

	return {
		points: mine,
		rival: best,
		state: mine > best.points ? 'leading' : mine === best.points ? 'tied' : 'behind'
	};
}

/* ── History ──────────────────────────────────────────────────────────────── */

export type CompletionEntry = {
	id: string;
	taskName: string;
	/** The snapshot, so a departed housemate keeps their name in the feed. */
	memberName: string;
	/** From the *current* member row; null once that housemate has left. */
	memberColor: string | null;
	points: number;
	/** "Today 8:20" · "Yesterday 18:40" · "Mon 14 Jul", household-local. */
	when: string;
	/** The task's cadence while the task still exists ("Every 2 weeks") [05]. */
	repeat: string | null;
};

/**
 * The newest completions — the "Recent history" preview under the to-do list
 * [05], and plan 09's feed with a bigger `limit`. Skips never appear
 * (→ SPEC §5.3): they're bookkeeping, not something to look back on.
 */
export function recentCompletions(
	householdId: string,
	context: TaskContext,
	limit: number
): CompletionEntry[] {
	return (
		db
			.select({
				id: taskCompletions.id,
				taskName: taskCompletions.taskName,
				memberName: taskCompletions.memberName,
				memberColor: members.color,
				points: taskCompletions.points,
				completedAt: taskCompletions.completedAt,
				recurUnit: tasks.recurUnit,
				recurInterval: tasks.recurInterval
			})
			.from(taskCompletions)
			.leftJoin(members, eq(taskCompletions.memberId, members.id))
			// Only a surviving task can still say how often it comes round; a
			// completed one-off has no row left, and no cadence to name.
			.leftJoin(tasks, eq(taskCompletions.taskId, tasks.id))
			.where(and(eq(taskCompletions.householdId, householdId), eq(taskCompletions.action, 'done')))
			// `id` breaks ties for completions logged in the same millisecond.
			.orderBy(desc(taskCompletions.completedAt), desc(taskCompletions.id))
			.limit(limit)
			.all()
			.map(({ completedAt, recurUnit, recurInterval, ...entry }) => ({
				...entry,
				when: formatCompletedAt(completedAt, context),
				repeat: recurUnit !== null ? formatRepeat(recurUnit, recurInterval ?? 1) : null
			}))
	);
}

function formatCompletedAt(at: Date, context: TaskContext): string {
	const date = toCalendarDate(at, context.timezone);
	if (date === context.today) return `Today ${formatTimeIn(at, context.timezone)}`;
	if (date === addInterval(context.today, -1, 'day')) {
		return `Yesterday ${formatTimeIn(at, context.timezone)}`;
	}
	return formatDayStamp(date);
}
