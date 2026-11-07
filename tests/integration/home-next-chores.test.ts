/**
 * Home's top card is a stack when more than one chore is on you (→ SPEC §2.1,
 * DECISIONS #256): every chore in the 3-day window, soonest first, up to five
 * cards, the rest counted for "+N more". The overdue banner stands down once
 * every overdue chore is already one of the cards.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { listMembers } from '$lib/server/services/household';
import { getHomeSummary } from '$lib/server/services/home';
import { recordSighting } from '$lib/server/services/raccoons';
import { createTask, listOverdueForMember, type TaskInput } from '$lib/server/services/tasks';
import { addDays } from '$lib/utils/dates';
import { makeHousehold } from '../helpers/db';

const TODAY = '2036-06-18';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2036-06-18T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function setup(housemates: string[] = []) {
	const fixture = makeHousehold({ housemates });
	const { householdId, owner } = fixture;
	const add = (name: string, days: number, overrides: Partial<TaskInput> = {}) =>
		createTask(
			householdId,
			owner.id,
			{
				name,
				points: 5,
				recurUnit: 'week',
				recurInterval: 1,
				dueDate: addDays(TODAY, days),
				assigneeMemberId: owner.id,
				rotate: false,
				...overrides
			},
			TODAY
		);
	const home = () =>
		getHomeSummary(householdId, {
			member: owner,
			timezone: fixture.timezone,
			today: TODAY,
			members: listMembers(householdId),
			overdue: listOverdueForMember(householdId, owner, TODAY)
		});
	return { ...fixture, add, home };
}

const names = (summary: ReturnType<ReturnType<typeof setup>['home']>) =>
	summary.nextChores.map((chore) => chore.name);

describe("Home's next chores", () => {
	it('lists every chore on you in the window, the oldest overdue first', () => {
		const { add, home, members } = setup(['Mia']);
		add('Plants', 2);
		add('Bins', 0);
		add('Bathroom', -2);
		add('Later', 4); // past the 3-day window
		add('Anyone’s', 1, { assigneeMemberId: null });
		add('Mia’s', 0, { assigneeMemberId: members[1].id });

		const summary = home();
		assert.deepEqual(names(summary), ['Bathroom', 'Bins', 'Anyone’s', 'Plants']);
		assert.equal(summary.moreChores, 0);
	});

	it('stops at five cards and counts the rest', () => {
		const { add, home } = setup();
		for (let day = -3; day <= 3; day += 1) add(`Day ${day}`, day);

		const summary = home();
		assert.deepEqual(names(summary), ['Day -3', 'Day -2', 'Day -1', 'Day 0', 'Day 1']);
		assert.equal(summary.moreChores, 2);
	});

	it('is empty with nothing in the window: no card', () => {
		const { add, home } = setup();
		add('Later', 5);
		assert.deepEqual(home().nextChores, []);
	});

	it('gives the raccoon the first card, not the one you swiped to', () => {
		const { add, home, householdId, owner } = setup();
		// Met one this morning, so this afternoon is no first visit.
		recordSighting(householdId, owner.id, 'reading', TODAY, `${TODAY}#0`);
		add('Late', -1);
		add('Today', 0);
		assert.equal(home().raccoon, 'reminder-overdue');
	});
});

describe('the overdue banner beside the stack', () => {
	it('stands down when every overdue chore is already a card', () => {
		const { add, home } = setup();
		add('Bathroom', -2);
		add('Hoover', -1);
		add('Bins', 0);
		assert.equal(home().overdue, null);
	});

	it('speaks when there are more overdue chores than cards', () => {
		const { add, home } = setup();
		for (let day = -6; day <= -1; day += 1) add(`Late ${day}`, day);

		const summary = home();
		assert.equal(summary.nextChores.length, 5);
		assert.equal(summary.overdue?.count, 6);
		assert.equal(summary.overdue?.oldestName, 'Late -6');
	});
});
