/**
 * Coming back from a holiday (→ services/tasks.ts `settleReturns`, SPEC §5.5,
 * DECISIONS #293): the days away are cut out of the calendar, so what fell due
 * during them comes back after the return instead of as a pile of red.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { sendTaskReminders } from '$lib/server/services/reminders';
import {
	createTask,
	listOverdueForMember,
	setAway,
	settleReturns,
	type TaskInput
} from '$lib/server/services/tasks';
import { addDays } from '$lib/utils/dates';
import { db, makeHousehold, memberRow, tables, type Fixture } from '../helpers/db';

const TODAY = '2026-03-10';
/** Away from TODAY, back on TODAY + 9: the first day home is TODAY + 10. */
const BACK_ON = addDays(TODAY, 9);
const HOME = addDays(TODAY, 10);

function taskRow(taskId: string) {
	return db.select().from(tables.tasks).where(eq(tables.tasks.id, taskId)).get();
}

function dueOf(taskId: string) {
	return taskRow(taskId)?.dueDate;
}

function away(fixture: Fixture, until = BACK_ON) {
	assert.equal(setAway(fixture.householdId, fixture.owner.id, until, TODAY), true);
}

/** A weekly chore of the owner's, unless the overrides say otherwise. */
function task(fixture: Fixture, dueDate: string | null, overrides: Partial<TaskInput> = {}) {
	return createTask(
		fixture.householdId,
		fixture.owner.id,
		{
			name: 'Bins out',
			points: 10,
			recurUnit: 'week',
			recurInterval: 1,
			dueDate,
			assigneeMemberId: fixture.owner.id,
			rotate: false,
			...overrides
		},
		TODAY
	);
}

describe('coming back from a holiday', () => {
	it('moves what fell due while away to after the return, in the same order', () => {
		const fixture = makeHousehold();
		const first = task(fixture, TODAY);
		const second = task(fixture, addDays(TODAY, 2));
		away(fixture);

		assert.equal(settleReturns(fixture.householdId, HOME), 1);

		assert.equal(dueOf(first), HOME);
		assert.equal(dueOf(second), addDays(HOME, 2));
		const back = memberRow(fixture.owner.id);
		assert.equal(back.awayUntil, null);
		assert.equal(back.awaySince, null);
		assert.equal(listOverdueForMember(fixture.householdId, back, HOME).length, 0);
	});

	it('pushes nothing more than a week past the return', () => {
		const fixture = makeHousehold();
		const late = task(fixture, addDays(TODAY, 8));
		away(fixture);

		settleReturns(fixture.householdId, HOME);

		assert.equal(dueOf(late), addDays(HOME, 7));
	});

	it('leaves a task that was overdue before the holiday overdue', () => {
		const fixture = makeHousehold();
		const before = task(fixture, addDays(TODAY, -1));
		away(fixture);

		settleReturns(fixture.householdId, HOME);

		assert.equal(dueOf(before), addDays(TODAY, -1));
		assert.equal(
			listOverdueForMember(fixture.householdId, memberRow(fixture.owner.id), HOME).length,
			1
		);
	});

	it('leaves a task due from the return day on where it is', () => {
		const fixture = makeHousehold();
		const after = task(fixture, HOME);
		away(fixture);

		settleReturns(fixture.householdId, HOME);

		assert.equal(dueOf(after), HOME);
	});

	it("leaves Anyone's tasks and a housemate's tasks alone", () => {
		const fixture = makeHousehold({ housemates: ['Elisabeth'] });
		const anyone = task(fixture, addDays(TODAY, 1), { assigneeMemberId: null });
		const theirs = task(fixture, addDays(TODAY, 1), { assigneeMemberId: fixture.members[1].id });
		away(fixture);

		settleReturns(fixture.householdId, HOME);

		assert.equal(dueOf(anyone), addDays(TODAY, 1));
		assert.equal(dueOf(theirs), addDays(TODAY, 1));
	});

	it('leaves an undated one-off undated', () => {
		const fixture = makeHousehold();
		const undated = task(fixture, null, { recurUnit: 'none' });
		away(fixture);

		settleReturns(fixture.householdId, HOME);

		assert.equal(dueOf(undated), null);
	});

	it('resets the reminder flags of a task it moves', () => {
		const fixture = makeHousehold();
		const nudged = task(fixture, TODAY);
		db.update(tables.tasks)
			.set({ dueReminderSentAt: new Date(), overdueReminderSentAt: new Date() })
			.where(eq(tables.tasks.id, nudged))
			.run();
		away(fixture);

		settleReturns(fixture.householdId, HOME);

		assert.equal(taskRow(nudged)?.dueReminderSentAt, null);
		assert.equal(taskRow(nudged)?.overdueReminderSentAt, null);
	});

	it('ending the pause early counts today as the first day home', () => {
		const fixture = makeHousehold();
		const due = task(fixture, addDays(TODAY, 1));
		const notYet = task(fixture, addDays(TODAY, 5));
		away(fixture);

		const early = addDays(TODAY, 3);
		assert.equal(setAway(fixture.householdId, fixture.owner.id, null, early), true);

		assert.equal(dueOf(due), addDays(early, 1));
		assert.equal(dueOf(notYet), addDays(TODAY, 5));
		const back = memberRow(fixture.owner.id);
		assert.equal(back.awayUntil, null);
		assert.equal(back.awaySince, null);
	});

	it('changing the return date keeps the day the holiday began', () => {
		const fixture = makeHousehold();
		away(fixture);
		assert.equal(memberRow(fixture.owner.id).awaySince, TODAY);

		setAway(fixture.householdId, fixture.owner.id, addDays(TODAY, 12), addDays(TODAY, 2));

		const row = memberRow(fixture.owner.id);
		assert.equal(row.awaySince, TODAY);
		assert.equal(row.awayUntil, addDays(TODAY, 12));
	});

	it('a new pause set after a run-out one settles the old holiday first', () => {
		const fixture = makeHousehold();
		away(fixture);
		const fell = task(fixture, addDays(TODAY, 3));

		// Nobody opened the app on the return day; the first thing they do is go
		// away again, two days after they came back.
		const later = addDays(HOME, 2);
		assert.equal(setAway(fixture.householdId, fixture.owner.id, addDays(later, 5), later), true);

		assert.equal(dueOf(fell), addDays(HOME, 3));
		const row = memberRow(fixture.owner.id);
		assert.equal(row.awaySince, later);
		assert.equal(row.awayUntil, addDays(later, 5));
	});

	it('runs once: settling twice moves a task once', () => {
		const fixture = makeHousehold();
		const due = task(fixture, addDays(TODAY, 1));
		away(fixture);

		assert.equal(settleReturns(fixture.householdId, HOME), 1);
		assert.equal(settleReturns(fixture.householdId, addDays(HOME, 1)), 0);

		assert.equal(dueOf(due), addDays(HOME, 1));
	});

	it('does not settle a holiday that is still going on', () => {
		const fixture = makeHousehold();
		const due = task(fixture, addDays(TODAY, 1));
		away(fixture);

		assert.equal(settleReturns(fixture.householdId, BACK_ON), 0);

		assert.equal(dueOf(due), addDays(TODAY, 1));
		assert.equal(memberRow(fixture.owner.id).awayUntil, BACK_ON);
	});

	it('a pause from before awaySince existed moves nothing, it only ends', () => {
		const fixture = makeHousehold();
		const due = task(fixture, addDays(TODAY, 1));
		db.update(tables.members)
			.set({ awayUntil: BACK_ON, awaySince: null })
			.where(eq(tables.members.id, fixture.owner.id))
			.run();

		assert.equal(settleReturns(fixture.householdId, HOME), 1);

		assert.equal(dueOf(due), addDays(TODAY, 1));
		assert.equal(memberRow(fixture.owner.id).awayUntil, null);
	});

	it("leaves another household's members and tasks alone", () => {
		const ours = makeHousehold();
		const theirs = makeHousehold();
		const theirTask = task(theirs, addDays(TODAY, 1));
		away(theirs);

		assert.equal(settleReturns(ours.householdId, HOME), 0);

		assert.equal(dueOf(theirTask), addDays(TODAY, 1));
		assert.equal(memberRow(theirs.owner.id).awayUntil, BACK_ON);
	});

	it('the morning sweep settles the return before it nudges', async () => {
		const fixture = makeHousehold();
		const due = task(fixture, addDays(TODAY, 1));
		away(fixture);

		const sweep = await sendTaskReminders(fixture.householdId, HOME);

		assert.equal(sweep.nudges, 0);
		assert.equal(dueOf(due), addDays(HOME, 1));
		assert.equal(taskRow(due)?.overdueReminderSentAt, null);
	});
});
