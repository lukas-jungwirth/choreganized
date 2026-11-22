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
import { and, asc, eq, gt, gte, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { type Locale } from '$lib/i18n';
import {
	addDays,
	addInterval,
	daysBetween,
	isCalendarDate,
	nextOnSchedule,
	startOfMonth,
	toCalendarDate,
	zonedStartOfDay,
	type CalendarDate,
	type ScheduleBy
} from '$lib/utils/dates';
import {
	isRecurUnit,
	schedulable,
	scheduleOf,
	POINTS_MAX,
	RECUR_INTERVAL_MAX,
	splitPoints,
	TASK_NAME_MAX,
	type RecurUnit,
	type TaskSchedule
} from '$lib/utils/tasks';
import { db } from '../db';
import { members, taskCompletions, tasks, type Member } from '../db/schema';

/**
 * better-sqlite3 gives Drizzle a single connection, so a plain `db` read inside
 * a `db.transaction` callback runs *in* that transaction. Only the helpers that
 * write, or that must see this transaction's own writes, need the `tx` handle.
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The household clock every function here answers to — and, for the handful of
 * rows that come back already written out ("Yesterday 18:40", "Weekly"), the
 * language to write them in. Loads build it from `requireMember` + the
 * household; `event.locals.locale` is where the third field comes from.
 */
export type TaskContext = {
	today: CalendarDate;
	timezone: string;
	locale: Locale;
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

/**
 * "This member is on the hook for it": assigned to them, or to "Anyone"
 * (NULL). Shared by the overdue list and Home's next-chore card, so the banner
 * and the card can't end up with different ideas of whose chore is whose.
 */
export function onTheHookFor(memberId: string): SQL | undefined {
	return or(eq(tasks.assigneeMemberId, memberId), isNull(tasks.assigneeMemberId));
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
 * "Anyone" (→ SPEC §2.2). Oldest first, so the banner can name the worst one.
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
					onTheHookFor(member.id)
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
	/** Keeps to the schedule (→ SPEC §5.2); null = counts from the day it was done. */
	schedule: TaskSchedule | null;
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
 * draw. Keys only — the headings are copy (→ `$lib/i18n`). Paused sits low because that is the whole point of the holiday pause —
 * a task nobody is expected to do shouldn't be the first thing on the screen —
 * and undated one-offs stay last (→ SPEC §5.1).
 */
const SECTION_ORDER: TaskSectionKey[] = ['overdue', 'today', 'upcoming', 'paused', 'undated'];

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

/**
 * How much is overdue and due today — the line under the Tasks title, on the
 * list and on History alike (→ SPEC §5.1). The list's own sections, counted, so
 * the line and the "Overdue · {n}" header can never disagree.
 */
export function countDue(
	householdId: string,
	context: TaskContext
): { overdue: number; today: number } {
	const { sections } = getTaskList(householdId, context);
	const count = (key: TaskSectionKey) =>
		sections.find((section) => section.key === key)?.tasks.length ?? 0;
	return { overdue: count('overdue'), today: count('today') };
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
			scheduleAnchor: tasks.scheduleAnchor,
			scheduleBy: tasks.scheduleBy,
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
			schedule: scheduleOf(row),
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

	// The key travels, the heading doesn't: "Overdue" is copy, and the screen
	// reading it knows which language it is in (→ `$lib/i18n`, `tasks.sections`).
	const sections = SECTION_ORDER.filter((key) => buckets.get(key)?.length).map((key) => ({
		key,
		tasks: buckets.get(key) ?? []
	}));

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
	/** Keep to the schedule (→ SPEC §5.2). Ignored for one-offs and daily tasks. */
	keepSchedule?: boolean;
	/** A monthly schedule's day; the weekday when missing. */
	scheduleBy?: ScheduleBy | null;
};

/**
 * Trimmed, clamped, and reduced to the two invariants the rest of the file
 * relies on: a recurring task always has a due date to recur from, and `rotate`
 * always has somebody to rotate away from.
 */
function normalize(
	householdId: string,
	input: TaskInput,
	today: CalendarDate,
	current: { dueDate: CalendarDate | null; scheduleAnchor: CalendarDate | null } | null = null
) {
	const oneOff = input.recurUnit === 'none';
	const assigneeMemberId = resolveMemberId(householdId, input.assigneeMemberId);
	const dueDate = isCalendarDate(input.dueDate) ? input.dueDate : oneOff ? null : today;

	return {
		name: input.name.trim().slice(0, TASK_NAME_MAX),
		points: clamp(input.points, 0, POINTS_MAX),
		recurUnit: input.recurUnit,
		recurInterval: oneOff ? 1 : clamp(input.recurInterval, 1, RECUR_INTERVAL_MAX),
		dueDate,
		assigneeMemberId,
		rotate: input.rotate && assigneeMemberId !== null,
		...scheduleColumns(input, dueDate, current)
	};
}

/**
 * The schedule's two columns (→ SPEC §5.2). The anchor is the due date being
 * saved, **unless** the date wasn't touched and the task already had one: a
 * snoozed task's date is off its schedule, and renaming it mustn't move the
 * schedule onto that date. Anything that can't keep a schedule clears both.
 */
function scheduleColumns(
	input: TaskInput,
	dueDate: CalendarDate | null,
	current: { dueDate: CalendarDate | null; scheduleAnchor: CalendarDate | null } | null
): { scheduleAnchor: CalendarDate | null; scheduleBy: ScheduleBy | null } {
	if (!input.keepSchedule || !schedulable(input.recurUnit) || !dueDate) {
		return { scheduleAnchor: null, scheduleBy: null };
	}

	const kept = current?.scheduleAnchor && current.dueDate === dueDate;
	return {
		scheduleAnchor: kept ? current.scheduleAnchor : dueDate,
		scheduleBy: input.recurUnit === 'month' ? (input.scheduleBy ?? 'weekday') : null
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
			.select({ dueDate: tasks.dueDate, scheduleAnchor: tasks.scheduleAnchor })
			.from(tasks)
			.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
			.get();

		if (!current) return false;

		const values = normalize(householdId, input, today, current);
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

/**
 * A snapshot back off the form that carried it to the browser. It lives here
 * rather than in a route because the shape is this file's contract and two
 * pages now offer Undo (Tasks [4d] and Home's next-chore card): one parser, so
 * they can't drift. Read field by field rather than trusted — it arrives as
 * text like any other input, and `undoCompletion` still scopes every id in it
 * to the household.
 */
export function parseSnapshot(raw: unknown): TaskSnapshot | null {
	if (typeof raw !== 'string') return null;

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== 'object') return null;
	const value = parsed as Record<string, unknown>;

	if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
	if (!isRecurUnit(value.recurUnit)) return null;

	return {
		id: value.id,
		name: value.name,
		points: typeof value.points === 'number' ? value.points : 0,
		recurUnit: value.recurUnit,
		recurInterval: typeof value.recurInterval === 'number' ? value.recurInterval : 1,
		dueDate: isCalendarDate(value.dueDate) ? value.dueDate : null,
		assigneeMemberId: typeof value.assigneeMemberId === 'string' ? value.assigneeMemberId : null,
		rotate: value.rotate === true,
		createdByMemberId: typeof value.createdByMemberId === 'string' ? value.createdByMemberId : null,
		// 0 would be 1970, which sorts an undated one-off to the top rather than
		// back where it was; a missing stamp is better handled downstream.
		createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
		dueReminderSentAt: typeof value.dueReminderSentAt === 'number' ? value.dueReminderSentAt : null,
		overdueReminderSentAt:
			typeof value.overdueReminderSentAt === 'number' ? value.overdueReminderSentAt : null
	};
}

export type TaskActionKind = 'done' | 'skipped';

/** One of the people a completion is credited to. */
export type CompletionDoer = { id: string; displayName: string; color: string };

export type CompletionResult = {
	/** The completion's group: one id for every doer's row (→ `task_completions.groupId`). */
	completionId: string;
	action: TaskActionKind;
	taskName: string;
	/** What each doer was credited: the whole task alone, their share together, 0 for a skip. */
	points: number;
	/** What the task is worth in full, before any split. */
	taskPoints: number;
	/** Who it's credited to, in join order. One for a task done alone, more when shared. */
	doers: CompletionDoer[];
	/** NULL for a one-off — the row is gone, only the history entry remains. */
	nextDueDate: CalendarDate | null;
	/** Who holds it next, rotated or not; NULL = Anyone. */
	nextAssigneeName: string | null;
	/** It changed hands — the difference between "their turn next" and "still theirs". */
	rotated: boolean;
	/** The next date came from the task's schedule, not from today (→ SPEC §5.2). */
	onSchedule: boolean;
	snapshot: TaskSnapshot;
};

/**
 * Mark a task done: log it, hand the points to whoever is credited with doing it
 * — the tapper for their own and "Anyone" tasks, or the person named by the "who
 * did it?" choice when the task was somebody else's — and move the task on, with
 * rotation following that doer (→ docs/DATA-MODEL.md "Completion algorithm",
 * SPEC §5.4). Sharing it comes afterwards, from the celebration
 * (→ `setCompletionDoers`).
 */
export function completeTask(
	householdId: string,
	taskId: string,
	creditMemberId: string,
	today: CalendarDate
): CompletionResult | null {
	return db.transaction((tx) =>
		logTaskAction(tx, householdId, taskId, [creditMemberId], today, 'done')
	);
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
	return db.transaction((tx) =>
		logTaskAction(tx, householdId, taskId, [memberId], today, 'skipped')
	);
}

/**
 * How long after the tick the celebration's faces may still change the credit.
 * The pop-up is open for seconds; a day covers a phone left on it overnight.
 * Past that the credit stands (→ SPEC §5.4, DECISIONS #280).
 */
export const DOERS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Change who a completion is credited to, from the celebration's row of faces
 * (→ SPEC §5.4): somebody else did it, or several people did it together and
 * share the points. It is the same completion told again: its rows are replaced
 * under the same group id and the same moment, so the feed keeps its place and
 * Undo still has one thing to take back.
 *
 * It changes the completion's rows and, at most, whose turn is next. Nothing
 * else on the task is written, and the task as it is now prices nothing
 * (→ DECISIONS #280): the completion keeps the price it was ticked at, a task
 * edited or deleted on another phone in the meantime stays edited or deleted,
 * and the turn only moves while the task is still where this completion left
 * it (same assignee, same "alternate" setting, nothing logged for it since).
 *
 * Null when there is nothing to change: the completion is gone (undone on
 * another phone), is older than `DOERS_WINDOW_MS`, isn't the one the snapshot
 * describes, or none of the ids is a housemate.
 */
export function setCompletionDoers(
	householdId: string,
	completionId: string,
	memberIds: string[],
	snapshot: TaskSnapshot,
	now: Date = new Date()
): CompletionResult | null {
	return db.transaction((tx) => {
		// By group id only: one doer's row id would split the completion in two.
		const group = and(
			eq(taskCompletions.householdId, householdId),
			eq(taskCompletions.groupId, completionId)
		);
		const logged = tx.select().from(taskCompletions).where(group).all();
		const [first] = logged;

		if (!first || first.action !== 'done') return null;
		if (now.getTime() - first.completedAt.getTime() > DOERS_WINDOW_MS) return null;
		// The snapshot has to be this completion's: the same task (NULL once the
		// task is gone: a finished one-off, or one deleted since), and a price that
		// splits into the shares that were logged.
		if (first.taskId !== null && first.taskId !== snapshot.id) return null;
		if (!Number.isInteger(snapshot.points)) return null;
		if (splitPoints(snapshot.points, logged.length) !== first.points) return null;

		const roster = rosterOf(tx, householdId);
		const doers = roster.filter((member) => memberIds.includes(member.id));
		// An empty answer leaves the completion standing rather than undoing it.
		if (doers.length === 0) return null;

		const points = splitPoints(snapshot.points, doers.length);

		tx.delete(taskCompletions).where(group).run();
		tx.insert(taskCompletions)
			.values(
				doers.map((doer) => ({
					householdId,
					taskId: first.taskId,
					taskName: first.taskName,
					points,
					action: 'done' as const,
					memberId: doer.id,
					memberName: doer.displayName,
					groupId: completionId,
					completedAt: first.completedAt
				}))
			)
			.run();

		const result = {
			completionId,
			action: 'done' as const,
			taskName: first.taskName,
			points,
			taskPoints: snapshot.points,
			doers,
			snapshot
		};

		const task = first.taskId
			? tx
					.select()
					.from(tasks)
					.where(and(eq(tasks.id, first.taskId), eq(tasks.householdId, householdId)))
					.get()
			: undefined;

		if (!task) {
			return {
				...result,
				nextDueDate: null,
				nextAssigneeName: null,
				rotated: false,
				onSchedule: false
			};
		}

		// Whose turn is next follows who did it (→ `nextAssigneeAfter`), so a new
		// answer can move it. Only while the task is where this completion left
		// it, though: a reassign or a second tick from another phone wins.
		const before = { assigneeMemberId: snapshot.assigneeMemberId, rotate: snapshot.rotate };
		const leftAt = nextAssigneeAfter(
			roster,
			before,
			logged.flatMap((row) => row.memberId ?? []),
			'done'
		);
		const later = tx
			.select({ id: taskCompletions.id })
			.from(taskCompletions)
			.where(
				and(
					eq(taskCompletions.householdId, householdId),
					eq(taskCompletions.taskId, task.id),
					gt(taskCompletions.completedAt, first.completedAt)
				)
			)
			.get();
		const untouched = !later && task.rotate === snapshot.rotate && task.assigneeMemberId === leftAt;

		let nextAssigneeId = task.assigneeMemberId;
		if (untouched) {
			nextAssigneeId = nextAssigneeAfter(
				roster,
				before,
				doers.map((doer) => doer.id),
				'done'
			);
			if (nextAssigneeId !== task.assigneeMemberId) {
				tx.update(tasks)
					.set({ assigneeMemberId: nextAssigneeId, updatedAt: new Date() })
					.where(and(eq(tasks.id, task.id), eq(tasks.householdId, householdId)))
					.run();
			}
		}

		return {
			...result,
			nextDueDate: task.recurUnit === 'none' ? null : task.dueDate,
			nextAssigneeName: roster.find((member) => member.id === nextAssigneeId)?.displayName ?? null,
			rotated: nextAssigneeId !== snapshot.assigneeMemberId,
			onSchedule: scheduleOf(task) !== null
		};
	});
}

/** Every row of one completion: its group, or the single pre-group row with that id. */
function inGroup(completionId: string): SQL | undefined {
	return or(eq(taskCompletions.groupId, completionId), eq(taskCompletions.id, completionId));
}

/**
 * The household in join order. One read, three uses: it validates the doers,
 * names and colours them for the completion snapshot, and is the rotation order
 * (→ docs/DATA-MODEL.md).
 */
function rosterOf(tx: Transaction, householdId: string): CompletionDoer[] {
	return tx
		.select({ id: members.id, displayName: members.displayName, color: members.color })
		.from(members)
		.where(eq(members.householdId, householdId))
		.orderBy(asc(members.joinedAt), asc(members.id))
		.all();
}

/**
 * Who holds a task after it was done or skipped. Rotation advances from whoever
 * was responsible for this occurrence. A completion by one person is theirs, so
 * doing a task that was someone else's hands the next turn to *them* rather than
 * back to yourself (→ SPEC §5.4, DECISIONS #116). Done together it is nobody's
 * in particular, and a skip is nobody's doing at all: in both the assignee's
 * turn is the one that passes.
 */
function nextAssigneeAfter(
	roster: CompletionDoer[],
	task: { assigneeMemberId: string | null; rotate: boolean },
	doerIds: string[],
	action: TaskActionKind
): string | null {
	const rotateFrom = action === 'done' && doerIds.length === 1 ? doerIds[0] : task.assigneeMemberId;
	const current = roster.findIndex((member) => member.id === rotateFrom);
	// Wrapping through join order; a departed assignee is already NULL, and
	// with one member there is nobody to alternate with.
	return task.rotate && current !== -1
		? roster[(current + 1) % roster.length].id
		: task.assigneeMemberId;
}

function logTaskAction(
	tx: Transaction,
	householdId: string,
	taskId: string,
	creditMemberIds: string[],
	today: CalendarDate,
	action: TaskActionKind
): CompletionResult | null {
	const task = tx
		.select()
		.from(tasks)
		.where(and(eq(tasks.id, taskId), eq(tasks.householdId, householdId)))
		.get();

	if (!task) return null;

	const roster = rosterOf(tx, householdId);

	// Who the completion is credited to: the tapper by default, whoever the "who
	// did it?" choice named (→ SPEC §5.4). A skip is always the tapper's alone.
	const doers = roster.filter((member) => creditMemberIds.includes(member.id));
	if (doers.length === 0) return null;

	const points = action === 'done' ? splitPoints(task.points, doers.length) : 0;
	const groupId = crypto.randomUUID();

	tx.insert(taskCompletions)
		.values(
			doers.map((doer) => ({
				householdId,
				taskId: task.id,
				// Snapshots, so history survives the task and the member
				// (→ docs/DATA-MODEL.md "History survives deletion").
				taskName: task.name,
				points,
				action,
				memberId: doer.id,
				memberName: doer.displayName,
				groupId
			}))
		)
		.run();

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
		completionId: groupId,
		action,
		taskName: task.name,
		points,
		taskPoints: task.points,
		doers,
		snapshot
	};

	if (task.recurUnit === 'none') {
		// A one-off is done being a task. The completion rows we just wrote have
		// their `taskId` nulled by the FK, which is the honest answer: the task no
		// longer exists. Undo puts the row back under the same id.
		tx.delete(tasks)
			.where(and(eq(tasks.id, task.id), eq(tasks.householdId, householdId)))
			.run();

		return {
			...result,
			nextDueDate: null,
			nextAssigneeName: null,
			rotated: false,
			onSchedule: false
		};
	}

	// Counted from the day it was actually done, not from the date it missed,
	// so an overdue weekly task gets a full week rather than reappearing
	// tomorrow (→ DECISIONS #6). A task that keeps to the schedule takes the
	// schedule's next date after the later of today and the date it was due:
	// lateness doesn't move it, an early tick doesn't bring it back tomorrow, and
	// missed dates don't pile up (→ SPEC §5.2, plan 39). The anchor itself never
	// changes here, which is why Undo has nothing of the schedule to restore.
	const schedule = scheduleOf(task);
	const nextDueDate =
		schedule && schedulable(task.recurUnit)
			? nextOnSchedule(
					schedule.anchor,
					task.recurUnit,
					task.recurInterval,
					schedule.by,
					// The anchor too: a first date that was brought forward by a snooze
					// and then done must not come straight back on the anchor itself.
					[today, task.dueDate ?? today, schedule.anchor].sort().at(-1)!
				)
			: addInterval(today, task.recurInterval, task.recurUnit);

	const nextAssigneeId = nextAssigneeAfter(
		roster,
		task,
		doers.map((doer) => doer.id),
		action
	);

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
		rotated: nextAssigneeId !== task.assigneeMemberId,
		onSchedule: schedule !== null
	};
}

/**
 * Undo a completion (→ SPEC §5.4): the history rows go — every doer's share at
 * once — the task goes back to the due date, assignee and reminder flags it had
 * a moment ago, and if it was a one-off, the row itself comes back under its
 * original id.
 *
 * Returns false when there is nothing to undo, which is the honest answer to
 * the second tap on a button that already worked.
 */
export function undoCompletion(
	householdId: string,
	completionId: string,
	snapshot: TaskSnapshot
): boolean {
	return db.transaction((tx) => undoIn(tx, householdId, completionId, snapshot));
}

function undoIn(
	tx: Transaction,
	householdId: string,
	completionId: string,
	snapshot: TaskSnapshot
): boolean {
	const removed = tx
		.delete(taskCompletions)
		.where(and(eq(taskCompletions.householdId, householdId), inGroup(completionId)))
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
 *
 * Switching it on stamps `awaySince = today`; moving the return date while
 * away keeps that stamp, so the holiday still starts where it started. Ending
 * it early (no date, or a past one, while away) is a return *today*: the tasks
 * that fell due in the meantime move to after today (→ `returnHome`).
 */
export function setAway(
	householdId: string,
	memberId: string,
	until: CalendarDate | null,
	today: CalendarDate
): boolean {
	const awayUntil = until && isCalendarDate(until) && until >= today ? until : null;

	return db.transaction((tx) => {
		// A pause that ran out while nobody looked is settled first, on its own
		// return day, so what follows only ever sees a current pause or none.
		settleMember(tx, householdId, memberId, today);

		const current = tx
			.select({ awayUntil: members.awayUntil, awaySince: members.awaySince })
			.from(members)
			.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
			.get();
		if (!current) return false;

		const wasAway = isAway(current, today);

		if (awayUntil === null) {
			if (wasAway) returnHome(tx, householdId, memberId, current, today);
			else clearAway(tx, householdId, memberId);
			return true;
		}

		tx.update(members)
			.set({ awayUntil, awaySince: wasAway ? current.awaySince : today })
			.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
			.run();
		return true;
	});
}

/** The longest a returning member's task is pushed past their return day. */
export const RETURN_SHIFT_MAX_DAYS = 7;

/**
 * Settle every pause in this household that has run out — `awayUntil` before
 * `today` — by moving the tasks that fell due during it to after the return
 * (→ `returnHome`). The natural return has no event of its own, so this runs
 * wherever a return could first be seen: the reminder sweep and the loads that
 * show tasks (→ DECISIONS #293). Idempotent: a settled member has no
 * `awayUntil` left to settle. Returns how many members came home.
 */
export function settleReturns(householdId: string, today: CalendarDate): number {
	// The common case — nobody's holiday ended — is this one read and no transaction.
	const returning = db
		.select({ id: members.id })
		.from(members)
		.where(and(eq(members.householdId, householdId), lt(members.awayUntil, today)))
		.all();
	if (returning.length === 0) return 0;

	return db.transaction((tx) => {
		let settled = 0;
		for (const { id } of returning) {
			if (settleMember(tx, householdId, id, today)) settled++;
		}
		return settled;
	});
}

/** One member's run-out pause, settled on its natural return day (`awayUntil + 1`). */
function settleMember(
	tx: Transaction,
	householdId: string,
	memberId: string,
	today: CalendarDate
): boolean {
	const current = tx
		.select({ awayUntil: members.awayUntil, awaySince: members.awaySince })
		.from(members)
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.get();
	if (!current?.awayUntil || current.awayUntil >= today) return false;

	return returnHome(tx, householdId, memberId, current, addDays(current.awayUntil, 1));
}

/**
 * Cut the holiday out of the calendar (→ SPEC §5.5, DECISIONS #293). Every task
 * assigned to this member that fell due on a day of the holiday,
 * `awaySince <= dueDate < returnDay`, moves to `returnDay` plus however far into
 * the holiday it fell, capped at a week — so the order is kept and nothing lands
 * months out. Each moved task is a new occurrence for the reminders, as with a
 * snooze. "Anyone" tasks stay put: they were the others' to do (→ DECISIONS #33).
 * Tasks already overdue before the holiday, and those due from `returnDay` on,
 * don't move. Then the pause is cleared.
 *
 * A pause stamped before `awaySince` existed has no start to measure from, so it
 * is only cleared, as before. The clear comes first and only wins once, which is
 * what makes a second call shift nothing.
 */
function returnHome(
	tx: Transaction,
	householdId: string,
	memberId: string,
	pause: { awayUntil: CalendarDate | null; awaySince: CalendarDate | null },
	returnDay: CalendarDate
): boolean {
	const cleared = tx
		.update(members)
		.set({ awayUntil: null, awaySince: null })
		.where(
			and(
				eq(members.id, memberId),
				eq(members.householdId, householdId),
				pause.awayUntil === null
					? isNull(members.awayUntil)
					: eq(members.awayUntil, pause.awayUntil)
			)
		)
		.run();
	if (cleared.changes === 0) return false;

	const since = pause.awaySince;
	if (since === null || since >= returnDay) return true;

	const fellDue = tx
		.select({ id: tasks.id, dueDate: sql<CalendarDate>`${tasks.dueDate}` })
		.from(tasks)
		.where(
			and(
				eq(tasks.householdId, householdId),
				eq(tasks.assigneeMemberId, memberId),
				gte(tasks.dueDate, since),
				lt(tasks.dueDate, returnDay)
			)
		)
		.all();

	const now = new Date();
	for (const task of fellDue) {
		const into = Math.min(daysBetween(since, task.dueDate), RETURN_SHIFT_MAX_DAYS);
		tx.update(tasks)
			.set({
				dueDate: addDays(returnDay, into),
				dueReminderSentAt: null,
				overdueReminderSentAt: null,
				updatedAt: now
			})
			.where(and(eq(tasks.id, task.id), eq(tasks.householdId, householdId)))
			.run();
	}
	return true;
}

function clearAway(tx: Transaction, householdId: string, memberId: string): void {
	tx.update(members)
		.set({ awayUntil: null, awaySince: null })
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.run();
}

/* ── Points ───────────────────────────────────────────────────────────────── */

/**
 * Points scored per member since `since`, or over all time when it's null — the
 * History → Points board's totals for its timeframe toggle (→ SPEC §5.8). Skips
 * are worth nothing and aren't achievements (→ SPEC §5.3), so `done` only.
 *
 * Completions whose member has left keep their points in the table but not in
 * this map: the points stayed with the house, the row they'd sit on is gone.
 */
export function pointsByMemberSince(householdId: string, since: Date | null): Map<string, number> {
	const totals = db
		.select({
			memberId: taskCompletions.memberId,
			points: sql<number>`sum(${taskCompletions.points})`.mapWith(Number)
		})
		.from(taskCompletions)
		.where(
			and(
				eq(taskCompletions.householdId, householdId),
				eq(taskCompletions.action, 'done'),
				// `and` drops an undefined arm, so "all time" is simply no lower bound.
				since ? gte(taskCompletions.completedAt, since) : undefined
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

/**
 * Points scored this household-local calendar month, per member — Home's
 * standings strip [8b], the members screen and the celebration's live line. The
 * month is derived from the completion timestamps: no reset job, and every past
 * month stays answerable (→ DECISIONS #9).
 */
export function monthPointsByMember(
	householdId: string,
	context: TaskContext
): Map<string, number> {
	return pointsByMemberSince(
		householdId,
		zonedStartOfDay(startOfMonth(context.today), context.timezone)
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

/* ── Stats [8a] ─────────────────────────────────────────────────────────────── */

/** A completions count — the To do screen's "N done this week" summary line. */
export function countDoneSince(householdId: string, since: Date): number {
	const row = db
		// A task done together is one thing done, however many rows share it.
		.select({
			n: sql<number>`count(distinct coalesce(${taskCompletions.groupId}, ${taskCompletions.id}))`
		})
		.from(taskCompletions)
		.where(
			and(
				eq(taskCompletions.householdId, householdId),
				eq(taskCompletions.action, 'done'),
				gte(taskCompletions.completedAt, since)
			)
		)
		.get();

	return row?.n ?? 0;
}

/**
 * Whether the household has ever ticked anything off — gates the To do screen's
 * link across to History, so a house that has cleared its list still has a way in
 * (`limit(1)`, so it's an existence check, not a count).
 */
export function hasCompletions(householdId: string): boolean {
	const row = db
		.select({ id: taskCompletions.id })
		.from(taskCompletions)
		.where(and(eq(taskCompletions.householdId, householdId), eq(taskCompletions.action, 'done')))
		.limit(1)
		.get();

	return row !== undefined;
}

export type ChoreShare = {
	memberId: string;
	displayName: string;
	color: string;
	/** 0–1: this member's slice of the scheduled recurring load. */
	share: number;
};

/**
 * How the *recurring* plan divides up, by design (→ SPEC §5.8, DECISIONS #117).
 * Not history — this reads the current tasks and asks who's on the hook for what,
 * weighted by effort × how often it comes round, so a daily 5-pointer counts for
 * more than a monthly 40. A fixed assignee carries their task alone; a rotating
 * task and an "Anyone" task are shared equally across the household. One-offs
 * aren't part of the rota and a 0-point chore is no load, so both sit it out.
 */
export function choreSplit(
	householdId: string,
	roster: { id: string; displayName: string; color: string }[]
): ChoreShare[] {
	const rows = db
		.select({
			points: tasks.points,
			recurUnit: tasks.recurUnit,
			recurInterval: tasks.recurInterval,
			assigneeMemberId: tasks.assigneeMemberId,
			rotate: tasks.rotate
		})
		.from(tasks)
		.where(eq(tasks.householdId, householdId))
		.all();

	const load = new Map<string, number>(roster.map((member) => [member.id, 0]));

	for (const task of rows) {
		if (task.recurUnit === 'none') continue;

		// Effort per day: points ÷ (interval × days-per-unit). Any consistent unit
		// works — the shares are normalised at the end.
		const unitDays = task.recurUnit === 'day' ? 1 : task.recurUnit === 'week' ? 7 : 30;
		const weight = task.points / (task.recurInterval * unitDays);
		if (weight === 0) continue;

		const owner = task.assigneeMemberId;
		if (owner !== null && !task.rotate && load.has(owner)) {
			load.set(owner, load.get(owner)! + weight);
		} else {
			// Rotating, "Anyone", or an assignee who has since left: shared equally.
			const each = weight / roster.length;
			for (const member of roster) load.set(member.id, load.get(member.id)! + each);
		}
	}

	const total = [...load.values()].reduce((sum, value) => sum + value, 0);

	return roster.map((member) => ({
		memberId: member.id,
		displayName: member.displayName,
		color: member.color,
		share: total > 0 ? load.get(member.id)! / total : 0
	}));
}
