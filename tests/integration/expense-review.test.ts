/**
 * Holes found reviewing the Expenses tab (→ DECISIONS #203): a series that
 * could charge someone who left, a typo'd year that repeats for decades, a
 * default split that outlives the people in it, and a settle-up edit nobody
 * heard about. The push itself is off under Vitest, so `notifyExpense` is
 * replaced to read which expenses the services announce.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';

const announced = vi.hoisted(() => [] as { kind: string; expenseId: string }[]);
vi.mock('$lib/server/services/expense-notify', async (original) => ({
	...(await original<typeof import('$lib/server/services/expense-notify')>()),
	notifyExpense: async (_householdId: string, event: { kind: string; expenseId: string }) => {
		announced.push({ kind: event.kind, expenseId: event.expenseId });
		return 0;
	}
}));

import { listSeries, materializeDue, updateSeries } from '$lib/server/services/expense-recurrences';
import {
	createExpense,
	createPayment,
	ExpenseError,
	getExpenseSettings,
	listPeople,
	setSplitDefault,
	updatePayment,
	type ExpenseInput
} from '$lib/server/services/expenses';
import { leaveHousehold } from '$lib/server/services/household';
import { makeHousehold } from '../helpers/db';

const TODAY = '2026-11-24';
const WEEKLY = { unit: 'week', interval: 1 } as const;
const MONTHLY = { unit: 'month', interval: 1 } as const;

function household(housemates: string[]) {
	const fixture = makeHousehold({ housemates });
	const ids = listPeople(fixture.householdId).map((person) => person.id);
	return { ...fixture, ids };
}

function shop(paidById: string, rows: string[], date = TODAY): ExpenseInput {
	return {
		description: 'Weekly shop',
		category: 'groceries',
		amountMinor: 4000,
		date,
		paidById,
		splitMode: 'equal',
		rows: rows.map((id) => ({ id, input: null }))
	};
}

function refuses(code: string, run: () => unknown) {
	assert.throws(run, (error) => error instanceof ExpenseError && error.code === code);
}

beforeEach(() => {
	announced.length = 0;
});

describe('a series never charges someone who left', () => {
	it('a former member with a balance is refused in a new series, but not in a one-off', () => {
		const { householdId, owner, members, ids } = household(['Elisabeth', 'Marco']);
		const [lukas, , marco] = ids;
		createExpense(householdId, owner.id, shop(lukas, [lukas, marco]), TODAY);
		leaveHousehold(householdId, members[2].id);

		refuses('series-person', () =>
			createExpense(householdId, owner.id, shop(lukas, [lukas, marco]), TODAY, MONTHLY)
		);
		assert.equal(listSeries(householdId).length, 0);
		// Logged once, they can still be in it: they owe for it like anything else.
		createExpense(householdId, owner.id, shop(lukas, [lukas, marco]), TODAY);
	});

	it('and editing a series can’t put them in either', () => {
		const { householdId, owner, members, ids } = household(['Elisabeth', 'Marco']);
		const [lukas, elisabeth, marco] = ids;
		createExpense(householdId, owner.id, shop(lukas, [lukas, marco]), TODAY);
		createExpense(householdId, owner.id, shop(lukas, [lukas, elisabeth]), TODAY, MONTHLY);
		leaveHousehold(householdId, members[2].id);
		const [series] = listSeries(householdId);

		refuses('series-person', () =>
			updateSeries(
				householdId,
				series.id,
				{ ...shop(lukas, [lukas, elisabeth, marco]), ...MONTHLY, nextDate: series.nextDate },
				TODAY
			)
		);
	});
});

describe('a typo in the year', () => {
	it('a date before 2000 is refused', () => {
		const { householdId, owner, ids } = household(['Elisabeth']);
		refuses('date-too-old', () =>
			createExpense(householdId, owner.id, shop(ids[0], ids, '1926-11-24'), TODAY)
		);
	});

	it('a series starts at most a year back, so catching up stays small', () => {
		const { householdId, owner, ids } = household(['Elisabeth']);
		refuses('series-start', () =>
			createExpense(householdId, owner.id, shop(ids[0], ids, '2002-11-24'), TODAY, WEEKLY)
		);
		createExpense(householdId, owner.id, shop(ids[0], ids, '2025-11-24'), TODAY, WEEKLY);
	});

	it('catching up announces each series once, with its newest occurrence', () => {
		const { householdId, owner, ids } = household(['Elisabeth']);
		createExpense(householdId, owner.id, shop(ids[0], ids, '2026-10-27'), TODAY, WEEKLY);
		announced.length = 0;

		const logged = materializeDue(householdId, TODAY);
		assert.equal(logged.length, 4);
		assert.deepEqual(announced, [{ kind: 'repeated', expenseId: logged.at(-1) }]);
	});
});

describe('the default split when someone leaves', () => {
	it('a percent default goes back to equal — without them it no longer adds up', () => {
		const { householdId, members, ids } = household(['Elisabeth']);
		setSplitDefault(householdId, 'percent', [
			{ personId: ids[0], weight: 3000 },
			{ personId: ids[1], weight: 7000 }
		]);
		leaveHousehold(householdId, members[1].id);
		assert.deepEqual(getExpenseSettings(householdId).splitDefault, { mode: 'equal', weights: {} });
	});

	it('a shares default just loses their shares', () => {
		const { householdId, members, ids } = household(['Elisabeth', 'Marco']);
		setSplitDefault(householdId, 'shares', [
			{ personId: ids[0], weight: 2 },
			{ personId: ids[1], weight: 1 },
			{ personId: ids[2], weight: 1 }
		]);
		leaveHousehold(householdId, members[2].id);
		assert.deepEqual(getExpenseSettings(householdId).splitDefault, {
			mode: 'shares',
			weights: { [ids[0]]: 2, [ids[1]]: 1 }
		});
	});
});

describe('editing a settle-up', () => {
	it('tells the recipient when the money changed, not when only the date did', () => {
		const { householdId, owner, ids } = household(['Elisabeth', 'Marco']);
		const [lukas, elisabeth, marco] = ids;
		const id = createPayment(
			householdId,
			owner.id,
			{ fromId: lukas, toId: elisabeth, amountMinor: 500, date: TODAY },
			TODAY
		);
		announced.length = 0;

		updatePayment(
			householdId,
			owner.id,
			id,
			{ fromId: lukas, toId: elisabeth, amountMinor: 500, date: '2026-11-23' },
			TODAY
		);
		assert.deepEqual(announced, []);

		updatePayment(
			householdId,
			owner.id,
			id,
			{ fromId: lukas, toId: marco, amountMinor: 900, date: '2026-11-23' },
			TODAY
		);
		assert.deepEqual(announced, [{ kind: 'paid', expenseId: id }]);
	});
});
