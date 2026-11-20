/**
 * Chores through their service (→ services/tasks.ts, SPEC §5, DECISIONS #16–#19).
 *
 * Completion is the one write in the app with four consequences at once — a
 * points row, the next due date, who is up next, and (for a one-off) the task's
 * own deletion — and undo has to reverse all four. That, and the sections a
 * list splits into, is what a walkthrough is slowest at checking and a database
 * test is fastest at.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getCompletedFeed } from '$lib/server/services/history';
import {
	completeTask,
	countDoneSince,
	countDue,
	createTask,
	deleteTask,
	getTaskList,
	listOverdueForMember,
	pointsByMemberSince,
	setAway,
	setCompletionDoers,
	skipTask,
	snoozeTask,
	undoCompletion,
	type TaskInput
} from '$lib/server/services/tasks';
import { addDays } from '$lib/utils/dates';
import { makeHousehold, memberRow, type Fixture } from '../helpers/db';

const TODAY = '2026-03-10';

function context(fixture: Fixture) {
	return { today: TODAY, timezone: fixture.timezone, locale: 'en' as const };
}

function weekly(overrides: Partial<TaskInput> = {}): TaskInput {
	return {
		name: 'Bins out',
		points: 10,
		recurUnit: 'week',
		recurInterval: 1,
		dueDate: TODAY,
		assigneeMemberId: null,
		rotate: false,
		...overrides
	};
}

function sectionsOf(fixture: Fixture) {
	return Object.fromEntries(
		getTaskList(fixture.householdId, context(fixture)).sections.map((section) => [
			section.key,
			section.tasks.map((task) => task.name)
		])
	);
}

describe('getTaskList', () => {
	it('splits the list into overdue · today · upcoming · undated', () => {
		const fixture = makeHousehold();
		const { householdId, owner } = fixture;

		createTask(householdId, owner.id, weekly({ name: 'Late', dueDate: addDays(TODAY, -2) }), TODAY);
		createTask(householdId, owner.id, weekly({ name: 'Due' }), TODAY);
		createTask(householdId, owner.id, weekly({ name: 'Soon', dueDate: addDays(TODAY, 3) }), TODAY);
		createTask(
			householdId,
			owner.id,
			weekly({ name: 'Whenever', recurUnit: 'none', dueDate: null }),
			TODAY
		);

		assert.deepEqual(sectionsOf(fixture), {
			overdue: ['Late'],
			today: ['Due'],
			upcoming: ['Soon'],
			undated: ['Whenever']
		});
	});

	it("never lists another household's tasks", () => {
		const a = makeHousehold();
		const b = makeHousehold();
		createTask(a.householdId, a.owner.id, weekly({ name: 'Ours' }), TODAY);

		assert.equal(getTaskList(b.householdId, context(b)).total, 0);
		assert.equal(getTaskList(a.householdId, context(a)).total, 1);
	});
});

describe('countDue', () => {
	it('counts what is overdue and due today — the line under the Tasks title', () => {
		const fixture = makeHousehold();
		const { householdId, owner } = fixture;
		assert.deepEqual(countDue(householdId, context(fixture)), { overdue: 0, today: 0 });

		createTask(householdId, owner.id, weekly({ name: 'Late', dueDate: addDays(TODAY, -2) }), TODAY);
		createTask(
			householdId,
			owner.id,
			weekly({ name: 'Later', dueDate: addDays(TODAY, -1) }),
			TODAY
		);
		createTask(householdId, owner.id, weekly({ name: 'Due' }), TODAY);
		createTask(householdId, owner.id, weekly({ name: 'Soon', dueDate: addDays(TODAY, 3) }), TODAY);

		assert.deepEqual(countDue(householdId, context(fixture)), { overdue: 2, today: 1 });
	});
});

describe('completeTask', () => {
	it('credits the points and rolls a recurring task forward', () => {
		const fixture = makeHousehold();
		const { householdId, owner } = fixture;
		const taskId = createTask(householdId, owner.id, weekly(), TODAY);

		const result = completeTask(householdId, taskId, owner.id, TODAY);

		assert.ok(result);
		assert.equal(result.points, 10);
		assert.equal(result.nextDueDate, addDays(TODAY, 7));
		assert.equal(pointsByMemberSince(householdId, null).get(owner.id), 10);
		const [task] = getTaskList(householdId, context(fixture)).sections.flatMap((s) => s.tasks);
		assert.equal(task.dueDate, addDays(TODAY, 7));
	});

	it('a one-off disappears once done', () => {
		const fixture = makeHousehold();
		const { householdId, owner } = fixture;
		const taskId = createTask(
			householdId,
			owner.id,
			weekly({ name: 'Fix the shelf', recurUnit: 'none' }),
			TODAY
		);

		const result = completeTask(householdId, taskId, owner.id, TODAY);

		assert.equal(result?.nextDueDate, null);
		assert.equal(getTaskList(householdId, context(fixture)).total, 0);
	});

	it('"alternate each time" hands the task to the next housemate in join order', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Elisabeth'] });
		const [owner, elisabeth] = members;
		const taskId = createTask(
			householdId,
			owner.id,
			weekly({ assigneeMemberId: owner.id, rotate: true }),
			TODAY
		);

		const first = completeTask(householdId, taskId, owner.id, TODAY);
		assert.equal(first?.nextAssigneeName, 'Elisabeth');
		assert.equal(first?.rotated, true);

		const second = completeTask(householdId, taskId, elisabeth.id, TODAY);
		assert.equal(second?.nextAssigneeName, 'Owner');
	});

	it('skipping rolls forward but scores nothing', () => {
		const { householdId, owner } = makeHousehold();
		const taskId = createTask(householdId, owner.id, weekly(), TODAY);

		const result = skipTask(householdId, taskId, owner.id, TODAY);

		assert.equal(result?.points, 0);
		assert.equal(result?.nextDueDate, addDays(TODAY, 7));
		assert.equal(pointsByMemberSince(householdId, null).get(owner.id), undefined);
	});

	it('cannot be done across the household boundary', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const taskId = createTask(a.householdId, a.owner.id, weekly(), TODAY);

		assert.equal(completeTask(b.householdId, taskId, b.owner.id, TODAY), null);
		assert.equal(deleteTask(b.householdId, taskId), false);
		assert.equal(snoozeTask(b.householdId, taskId, addDays(TODAY, 1)), false);
		assert.equal(pointsByMemberSince(a.householdId, null).size, 0);
	});
});

describe('undoCompletion', () => {
	it('puts the task back exactly as it was and takes the points with it', () => {
		const fixture = makeHousehold();
		const { householdId, owner } = fixture;
		const taskId = createTask(householdId, owner.id, weekly(), TODAY);
		const done = completeTask(householdId, taskId, owner.id, TODAY);
		assert.ok(done);

		assert.equal(undoCompletion(householdId, done.completionId, done.snapshot), true);

		assert.deepEqual(sectionsOf(fixture), { today: ['Bins out'] });
		assert.equal(pointsByMemberSince(householdId, null).get(owner.id), undefined);
	});

	it('brings a completed one-off back from the dead', () => {
		const fixture = makeHousehold();
		const { householdId, owner } = fixture;
		const taskId = createTask(householdId, owner.id, weekly({ recurUnit: 'none' }), TODAY);
		const done = completeTask(householdId, taskId, owner.id, TODAY);
		assert.ok(done);

		undoCompletion(householdId, done.completionId, done.snapshot);

		assert.equal(getTaskList(householdId, context(fixture)).total, 1);
	});
});

describe('done together (setCompletionDoers)', () => {
	/** A 20-pointer that alternates, on the owner's turn, in a household of three. */
	function shared() {
		const fixture = makeHousehold({ housemates: ['Elisabeth', 'Jonas'] });
		const { householdId, members } = fixture;
		const [owner, elisabeth, jonas] = members;
		const taskId = createTask(
			householdId,
			owner.id,
			weekly({ name: 'Bathroom', points: 20, assigneeMemberId: owner.id, rotate: true }),
			TODAY
		);
		const done = completeTask(householdId, taskId, owner.id, TODAY);
		assert.ok(done);
		const points = () => Object.fromEntries(pointsByMemberSince(householdId, null));
		return { fixture, householdId, owner, elisabeth, jonas, taskId, done, points };
	}

	it('splits the points between everyone who did it', () => {
		const { fixture, householdId, owner, elisabeth, done, points } = shared();

		const both = setCompletionDoers(
			householdId,
			done.completionId,
			[owner.id, elisabeth.id],
			done.snapshot,
			fixture.timezone
		);

		assert.ok(both);
		assert.equal(both.points, 10);
		assert.equal(both.taskPoints, 20);
		assert.deepEqual(
			both.doers.map((doer) => doer.displayName),
			['Owner', 'Elisabeth']
		);
		assert.deepEqual(points(), { [owner.id]: 10, [elisabeth.id]: 10 });
	});

	it('rounds an uneven split to the nearest whole point for each', () => {
		const { fixture, householdId, owner, elisabeth, jonas, done, points } = shared();

		const all = setCompletionDoers(
			householdId,
			done.completionId,
			[owner.id, elisabeth.id, jonas.id],
			done.snapshot,
			fixture.timezone
		);

		assert.equal(all?.points, 7);
		assert.deepEqual(points(), { [owner.id]: 7, [elisabeth.id]: 7, [jonas.id]: 7 });
	});

	it('stays one completion: same id, same moment, one line in the feed, one thing done', () => {
		const { fixture, householdId, owner, elisabeth, done } = shared();

		const both = setCompletionDoers(
			householdId,
			done.completionId,
			[owner.id, elisabeth.id],
			done.snapshot,
			fixture.timezone
		);

		assert.equal(both?.completionId, done.completionId);
		// The feed's own clock is the real one: the completion was logged just now.
		const now = { today: TODAY, timezone: fixture.timezone, locale: 'en' as const };
		const entries = getCompletedFeed(householdId, now, '2000-01-01').days.flatMap(
			(day) => day.entries
		);
		assert.equal(entries.length, 1);
		assert.deepEqual(
			entries[0].doers.map((doer) => doer.name),
			['Owner', 'Elisabeth']
		);
		assert.equal(entries[0].points, 10);
		assert.equal(countDoneSince(householdId, new Date(0)), 1);
	});

	it('passes the turn on from the assignee when shared, from the doer when alone', () => {
		const { fixture, householdId, owner, elisabeth, jonas, done } = shared();
		const change = (ids: string[]) =>
			setCompletionDoers(householdId, done.completionId, ids, done.snapshot, fixture.timezone);

		// Alone, the owner's turn passed to Elisabeth.
		assert.equal(done.nextAssigneeName, 'Elisabeth');
		// Elisabeth and Jonas did the owner's turn together: still Elisabeth next.
		assert.equal(change([elisabeth.id, jonas.id])?.nextAssigneeName, 'Elisabeth');
		// It was Elisabeth alone after all: the turn passes on from her.
		assert.equal(change([elisabeth.id])?.nextAssigneeName, 'Jonas');
		// And back to the owner: exactly where the tick left it.
		const back = change([owner.id]);
		assert.equal(back?.nextAssigneeName, 'Elisabeth');
		assert.equal(back?.nextDueDate, done.nextDueDate);
		assert.equal(back?.points, 20);
	});

	it('undo takes back every share at once', () => {
		const { fixture, householdId, owner, elisabeth, done, points } = shared();
		setCompletionDoers(
			householdId,
			done.completionId,
			[owner.id, elisabeth.id],
			done.snapshot,
			fixture.timezone
		);

		assert.equal(undoCompletion(householdId, done.completionId, done.snapshot), true);

		assert.deepEqual(points(), {});
		assert.deepEqual(sectionsOf(fixture), { today: ['Bathroom'] });
		const [task] = getTaskList(householdId, context(fixture)).sections.flatMap((s) => s.tasks);
		assert.equal(task.assignee?.displayName, 'Owner');
	});

	it('shares a one-off, which stays gone', () => {
		const fixture = makeHousehold({ housemates: ['Elisabeth'] });
		const { householdId, members } = fixture;
		const [owner, elisabeth] = members;
		const taskId = createTask(
			householdId,
			owner.id,
			weekly({ name: 'Cellar', points: 40, recurUnit: 'none' }),
			TODAY
		);
		const done = completeTask(householdId, taskId, owner.id, TODAY);
		assert.ok(done);

		const both = setCompletionDoers(
			householdId,
			done.completionId,
			[owner.id, elisabeth.id],
			done.snapshot,
			fixture.timezone
		);

		assert.equal(both?.points, 20);
		assert.equal(getTaskList(householdId, context(fixture)).total, 0);
		assert.equal(pointsByMemberSince(householdId, null).get(elisabeth.id), 20);
	});

	it('leaves the completion standing when nobody valid is named', () => {
		const { fixture, householdId, owner, done, points } = shared();
		const stranger = makeHousehold().owner.id;

		assert.equal(
			setCompletionDoers(householdId, done.completionId, [], done.snapshot, fixture.timezone),
			null
		);
		assert.equal(
			setCompletionDoers(
				householdId,
				done.completionId,
				[stranger],
				done.snapshot,
				fixture.timezone
			),
			null
		);
		assert.deepEqual(points(), { [owner.id]: 20 });
	});

	it("cannot touch another household's completion", () => {
		const { fixture, done, owner, points } = shared();
		const other = makeHousehold();

		assert.equal(
			setCompletionDoers(
				other.householdId,
				done.completionId,
				[other.owner.id],
				done.snapshot,
				fixture.timezone
			),
			null
		);
		assert.deepEqual(points(), { [owner.id]: 20 });
	});
});

describe('overdue and away', () => {
	it('an away member has nothing overdue, and the pause is a date, not a flag', () => {
		const { householdId, owner } = makeHousehold();
		createTask(householdId, owner.id, weekly({ dueDate: addDays(TODAY, -1) }), TODAY);

		assert.equal(listOverdueForMember(householdId, owner, TODAY).length, 1);

		assert.equal(setAway(householdId, owner.id, addDays(TODAY, 3), TODAY), true);
		const paused = memberRow(owner.id);
		assert.equal(paused.awayUntil, addDays(TODAY, 3));
		assert.equal(listOverdueForMember(householdId, paused, TODAY).length, 0);
		assert.equal(listOverdueForMember(householdId, paused, addDays(TODAY, 4)).length, 1);

		// A pause in the past is no pause: the service refuses to write one.
		setAway(householdId, owner.id, addDays(TODAY, -1), TODAY);
		const cleared = memberRow(owner.id);
		assert.equal(cleared.awayUntil, null);
	});

	it('snoozing moves the due date and clears the overdue', () => {
		const { householdId, owner } = makeHousehold();
		const taskId = createTask(
			householdId,
			owner.id,
			weekly({ dueDate: addDays(TODAY, -1) }),
			TODAY
		);

		assert.equal(snoozeTask(householdId, taskId, addDays(TODAY, 2)), true);

		assert.equal(listOverdueForMember(householdId, owner, TODAY).length, 0);
	});
});
