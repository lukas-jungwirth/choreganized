/**
 * Keeping to the schedule (→ services/tasks.ts, SPEC §5.2, plan 39): a
 * recurring task whose next date comes from the calendar rather than from the
 * day it was done. The example is the sketch's (design/sketches/task-schedule.html):
 * "Deep clean the kitchen", first due Sunday 6 December 2026, monthly on the
 * first Sunday.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getHomeSummary } from '$lib/server/services/home';
import { listMembers } from '$lib/server/services/household';
import {
	completeTask,
	createTask,
	getTaskList,
	listOverdueForMember,
	setAway,
	settleReturns,
	skipTask,
	snoozeTask,
	undoCompletion,
	updateTask,
	type TaskInput
} from '$lib/server/services/tasks';
import { db, makeHousehold, tables, type Fixture } from '../helpers/db';

const FIRST_SUNDAY = '2026-12-06';
const TODAY = '2026-11-22';

function kitchen(overrides: Partial<TaskInput> = {}): TaskInput {
	return {
		name: 'Deep clean the kitchen',
		points: 20,
		recurUnit: 'month',
		recurInterval: 1,
		dueDate: FIRST_SUNDAY,
		assigneeMemberId: null,
		rotate: false,
		keepSchedule: true,
		scheduleBy: 'weekday',
		...overrides
	};
}

function row(taskId: string) {
	const found = db.select().from(tables.tasks).where(eq(tables.tasks.id, taskId)).get();
	assert.ok(found);
	return found;
}

function create(fixture: Fixture, overrides: Partial<TaskInput> = {}) {
	return createTask(fixture.householdId, fixture.owner.id, kitchen(overrides), TODAY);
}

function done(fixture: Fixture, taskId: string, on: string) {
	const result = completeTask(fixture.householdId, taskId, fixture.owner.id, on);
	assert.ok(result);
	return result;
}

describe('a task that keeps to the schedule', () => {
	it('stores the due date as its anchor, and the day it keeps', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		assert.equal(row(taskId).scheduleAnchor, FIRST_SUNDAY);
		assert.equal(row(taskId).scheduleBy, 'weekday');
		const [task] = getTaskList(fixture.householdId, {
			today: TODAY,
			timezone: fixture.timezone,
			locale: 'en'
		}).sections.flatMap((section) => section.tasks);
		assert.deepEqual(task.schedule, { anchor: FIRST_SUNDAY, by: 'weekday' });
	});

	it('done two days late: the next first Sunday, not a month after the tick', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		const result = done(fixture, taskId, '2026-12-08');
		assert.equal(result.nextDueDate, '2027-01-03');
		assert.equal(result.onSchedule, true);
		assert.equal(row(taskId).dueDate, '2027-01-03');
		assert.equal(row(taskId).scheduleAnchor, FIRST_SUNDAY);
	});

	it('done very late: skips to the next date still ahead', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		assert.equal(done(fixture, taskId, '2027-01-15').nextDueDate, '2027-02-07');
	});

	it('done early: the date after the one it was due, not tomorrow', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		assert.equal(done(fixture, taskId, '2026-12-05').nextDueDate, '2027-01-03');
	});

	it('skipping moves on to the next date on the schedule too', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		const result = skipTask(fixture.householdId, taskId, fixture.owner.id, '2026-12-07');
		assert.equal(result?.nextDueDate, '2027-01-03');
	});

	it('on the day: by date keeps the 31st, clamped to a shorter month', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture, { dueDate: '2027-01-31', scheduleBy: 'day' });

		assert.equal(done(fixture, taskId, '2027-01-31').nextDueDate, '2027-02-28');
		assert.equal(done(fixture, taskId, '2027-02-28').nextDueDate, '2027-03-31');
	});

	it('weekly: keeps the weekday when done late', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture, { recurUnit: 'week', scheduleBy: null });

		assert.equal(row(taskId).scheduleBy, null);
		assert.equal(done(fixture, taskId, '2026-12-08').nextDueDate, '2026-12-13');
	});

	it('a snooze moves this time only; the schedule stays', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		assert.equal(snoozeTask(fixture.householdId, taskId, '2026-12-08'), true);
		assert.equal(row(taskId).scheduleAnchor, FIRST_SUNDAY);
		assert.equal(done(fixture, taskId, '2026-12-08').nextDueDate, '2027-01-03');
	});

	it('a first date brought forward and done early does not come back on that date', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		assert.equal(snoozeTask(fixture.householdId, taskId, '2026-12-01'), true);
		assert.equal(done(fixture, taskId, '2026-12-01').nextDueDate, '2027-01-03');
	});

	it('after a holiday return the shifted one is done, and the next is back on schedule', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture, { assigneeMemberId: fixture.owner.id });

		assert.equal(setAway(fixture.householdId, fixture.owner.id, '2026-12-09', '2026-12-01'), true);
		settleReturns(fixture.householdId, '2026-12-10');
		const shifted = row(taskId).dueDate;
		assert.ok(shifted && shifted > FIRST_SUNDAY);

		assert.equal(done(fixture, taskId, shifted).nextDueDate, '2027-01-03');
	});

	it('undo puts the date back and leaves the schedule as it was', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		const result = done(fixture, taskId, '2026-12-08');
		assert.equal(undoCompletion(fixture.householdId, result.completionId, result.snapshot), true);
		assert.equal(row(taskId).dueDate, FIRST_SUNDAY);
		assert.equal(row(taskId).scheduleAnchor, FIRST_SUNDAY);
	});
});

describe('editing a task that keeps to the schedule', () => {
	it('keeps the anchor when the date was not touched, even after a snooze', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);
		snoozeTask(fixture.householdId, taskId, '2026-12-08');

		updateTask(
			fixture.householdId,
			taskId,
			kitchen({ name: 'Kitchen, properly', dueDate: '2026-12-08' }),
			TODAY
		);
		assert.equal(row(taskId).scheduleAnchor, FIRST_SUNDAY);
	});

	it('a new date is a new anchor', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture);

		updateTask(fixture.householdId, taskId, kitchen({ dueDate: '2026-12-13' }), TODAY);
		assert.equal(row(taskId).scheduleAnchor, '2026-12-13');
		assert.equal(done(fixture, taskId, '2026-12-13').nextDueDate, '2027-01-10');
	});

	it('switching it off, or to daily or one-off, clears the schedule', () => {
		const fixture = makeHousehold();
		const off = create(fixture);
		const daily = create(fixture);
		const once = create(fixture);

		updateTask(fixture.householdId, off, kitchen({ keepSchedule: false }), TODAY);
		updateTask(fixture.householdId, daily, kitchen({ recurUnit: 'day' }), TODAY);
		updateTask(fixture.householdId, once, kitchen({ recurUnit: 'none' }), TODAY);

		for (const taskId of [off, daily, once]) {
			assert.equal(row(taskId).scheduleAnchor, null);
			assert.equal(row(taskId).scheduleBy, null);
		}
		assert.equal(done(fixture, off, '2026-12-08').nextDueDate, '2027-01-08');
		assert.equal(done(fixture, off, '2027-01-08').onSchedule, false);
	});
});

describe('a task without a schedule', () => {
	it('still counts from the day it was done', () => {
		const fixture = makeHousehold();
		const taskId = create(fixture, { keepSchedule: undefined, scheduleBy: undefined });

		assert.equal(row(taskId).scheduleAnchor, null);
		assert.equal(done(fixture, taskId, '2026-12-08').nextDueDate, '2027-01-08');
	});
});

describe('Home', () => {
	it('carries the schedule on the next-chore card', () => {
		const fixture = makeHousehold();
		create(fixture, { assigneeMemberId: fixture.owner.id, dueDate: TODAY });

		const home = getHomeSummary(fixture.householdId, {
			member: fixture.owner,
			timezone: fixture.timezone,
			today: TODAY,
			members: listMembers(fixture.householdId),
			overdue: listOverdueForMember(fixture.householdId, fixture.owner, TODAY)
		});
		assert.deepEqual(home.nextChores[0]?.schedule, { anchor: TODAY, by: 'weekday' });
	});
});
