/**
 * The expenses ledger through its service (→ services/expenses.ts, SPEC §11).
 *
 * `utils/money.test.ts` pins the arithmetic. What needs a database is what
 * wraps it: that every membership has its ledger person and a departed one
 * keeps theirs, that the server — not the form — decides the shares, that a
 * payment moves the balance it pays, and that one household's ledger is
 * invisible and untouchable from another's.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { describe, it } from 'vitest';
import {
	balancesOf,
	createExpense,
	createPayment,
	deletedExpense,
	deleteExpense,
	descriptionSuggestions,
	ExpenseError,
	filterHistory,
	getExpenseSettings,
	listLedger,
	listPeople,
	personIdFor,
	purgeDeletedExpenses,
	restoreExpense,
	setCurrency,
	setSplitDefault,
	updateExpense,
	type ExpenseInput,
	type HistoryFilters
} from '$lib/server/services/expenses';
import {
	joinHousehold,
	leaveHousehold,
	removeMember,
	updateProfile
} from '$lib/server/services/household';
import { MEMBER_COLORS } from '$lib/member-colors';
import { db, makeHousehold, tables } from '../helpers/db';

const TODAY = '2026-11-24';

function household(housemates = ['Elisabeth']) {
	const fixture = makeHousehold({ housemates });
	const people = listPeople(fixture.householdId);
	return { ...fixture, people, ids: people.map((person) => person.id) };
}

function groceries(paidById: string, rows: string[], amountMinor = 4210): ExpenseInput {
	return {
		description: 'Weekly shop · Billa',
		category: 'groceries',
		amountMinor,
		date: TODAY,
		paidById,
		splitMode: 'equal',
		rows: rows.map((id) => ({ id, input: null }))
	};
}

function balances(householdId: string) {
	return balancesOf(listPeople(householdId), listLedger(householdId));
}

const rejects = (code: string) => (error: unknown) =>
	error instanceof ExpenseError && error.code === code;

describe('ledger people', () => {
	it('every membership has one, in join order, following the member’s name', () => {
		const { householdId, owner, members, people } = household(['Elisabeth', 'Marco']);

		assert.deepEqual(
			people.map((person) => person.name),
			['Owner', 'Elisabeth', 'Marco']
		);
		assert.equal(personIdFor(householdId, members[1].id), people[1].id);

		updateProfile(householdId, owner.id, { displayName: 'Lukas', color: MEMBER_COLORS[4].value });
		assert.equal(listPeople(householdId)[0].name, 'Lukas');
	});

	it('a member who leaves owing money keeps the balance, under the name they had', () => {
		const { householdId, owner, members, ids } = household(['Elisabeth']);
		createExpense(householdId, owner.id, groceries(ids[0], ids), TODAY);

		leaveHousehold(householdId, members[1].id);

		const people = listPeople(householdId);
		assert.equal(people.length, 2);
		assert.deepEqual(
			{ name: people[1].name, memberId: people[1].memberId },
			{ name: 'Elisabeth', memberId: null }
		);
		assert.equal(balances(householdId).byPerson[ids[1]], -2105);
	});

	it('a member who leaves and joins again gets their old person back, debt included', () => {
		const { householdId, owner, members, ids, inviteCode } = household(['Elisabeth']);
		createExpense(householdId, owner.id, groceries(ids[0], ids), TODAY);
		leaveHousehold(householdId, members[1].id);

		const back = joinHousehold(members[1].userId, inviteCode, {
			displayName: 'Lisi',
			color: MEMBER_COLORS[2].value
		});

		const people = listPeople(householdId);
		assert.equal(people.length, 2, 'no second "Elisabeth"');
		assert.deepEqual(
			{ id: people[1].id, memberId: people[1].memberId, name: people[1].name },
			{ id: ids[1], memberId: back.id, name: 'Lisi' }
		);
		assert.equal(balances(householdId).byPerson[ids[1]], -2105);
	});

	it('removing a member works the same way', () => {
		const { householdId, owner, members, ids } = household(['Elisabeth', 'Marco']);
		createExpense(householdId, owner.id, groceries(ids[2], ids, 900), TODAY);

		removeMember(householdId, owner.id, members[2].id);

		assert.equal(balances(householdId).byPerson[ids[2]], 600);
		assert.equal(listLedger(householdId).length, 1);
	});
});

describe('logging expenses', () => {
	it('splits on the server and adds up to the cent', () => {
		const { householdId, owner, ids } = household(['Elisabeth', 'Marco']);
		createExpense(householdId, owner.id, groceries(ids[0], ids, 1000), TODAY);

		const [item] = listLedger(householdId);
		assert.deepEqual(
			item.shares.map((share) => share.shareMinor),
			[334, 333, 333]
		);
		assert.equal(item.createdBy, 'Owner');
		assert.deepEqual(balances(householdId).byPerson, {
			[ids[0]]: 666,
			[ids[1]]: -333,
			[ids[2]]: -333
		});
	});

	it('logs someone else’s spend, and one you are not part of', () => {
		const { householdId, owner, ids } = household(['Elisabeth', 'Marco']);
		createExpense(householdId, owner.id, groceries(ids[1], [ids[1], ids[2]], 2000), TODAY);

		assert.equal(balances(householdId).byPerson[ids[0]], 0);
		assert.equal(balances(householdId).byPerson[ids[1]], 1000);
	});

	it('refuses a split that doesn’t add up, a future date and a stranger', () => {
		const a = household();
		const b = household();

		assert.throws(
			() =>
				createExpense(
					a.householdId,
					a.owner.id,
					{
						...groceries(a.ids[0], a.ids),
						splitMode: 'amounts',
						rows: [
							{ id: a.ids[0], input: 2000 },
							{ id: a.ids[1], input: 1890 }
						]
					},
					TODAY
				),
			rejects('split')
		);
		assert.throws(
			() =>
				createExpense(
					a.householdId,
					a.owner.id,
					{ ...groceries(a.ids[0], a.ids), date: '2026-11-25' },
					TODAY
				),
			rejects('date')
		);
		assert.throws(
			() => createExpense(a.householdId, a.owner.id, groceries(b.ids[0], a.ids), TODAY),
			rejects('person')
		);
		assert.throws(
			() => createExpense(a.householdId, a.owner.id, groceries(a.ids[0], [b.ids[1]]), TODAY),
			rejects('person')
		);
		assert.throws(
			() =>
				createExpense(
					a.householdId,
					a.owner.id,
					{ ...groceries(a.ids[0], a.ids), description: '  ' },
					TODAY
				),
			rejects('description')
		);
		assert.equal(listLedger(a.householdId).length, 0);
	});

	it('an edit rewrites the shares, keeps the invariant and says who changed it', () => {
		const { householdId, owner, members, ids } = household();
		const id = createExpense(householdId, owner.id, groceries(ids[0], ids), TODAY);

		// Logged a second ago, so the edit reads as an edit.
		db.update(tables.expenses)
			.set({ createdAt: new Date(Date.now() - 5000) })
			.where(eq(tables.expenses.id, id))
			.run();

		updateExpense(
			householdId,
			members[1].id,
			id,
			{
				...groceries(ids[0], ids),
				splitMode: 'percent',
				rows: [
					{ id: ids[0], input: 3000 },
					{ id: ids[1], input: 7000 }
				]
			},
			TODAY
		);

		const [item] = listLedger(householdId);
		assert.deepEqual(
			item.shares.map((share) => [share.shareMinor, share.input]),
			[
				[1263, 3000],
				[2947, 7000]
			]
		);
		assert.equal(
			item.shares.reduce((sum, share) => sum + share.shareMinor, 0),
			item.amountMinor
		);
		assert.equal(item.updatedBy, 'Elisabeth');
		assert.equal(item.edited, true);
	});

	it('another household’s expense can’t be edited or deleted', () => {
		const a = household();
		const b = household();
		const id = createExpense(a.householdId, a.owner.id, groceries(a.ids[0], a.ids), TODAY);

		assert.throws(
			() => updateExpense(b.householdId, b.owner.id, id, groceries(b.ids[0], b.ids), TODAY),
			rejects('not-found')
		);
		assert.equal(deleteExpense(b.householdId, id), false);
		assert.equal(listLedger(a.householdId).length, 1);
		assert.equal(listLedger(b.householdId).length, 0);
	});

	it('only a row that is waiting for its undo is offered one', () => {
		const a = household();
		const b = household();
		const id = createExpense(a.householdId, a.owner.id, groceries(a.ids[0], a.ids), TODAY);

		assert.equal(deletedExpense(a.householdId, id), null, 'not deleted yet');
		deleteExpense(a.householdId, id);
		assert.deepEqual(deletedExpense(a.householdId, id), { id, description: 'Weekly shop · Billa' });
		assert.equal(deletedExpense(b.householdId, id), null, 'another household’s');
		restoreExpense(a.householdId, id);
		assert.equal(deletedExpense(a.householdId, id), null, 'already restored');
	});

	it('delete takes it out of every read, undo puts it back, and the cleanup makes it final', () => {
		const { householdId, owner, ids } = household();
		const id = createExpense(householdId, owner.id, groceries(ids[0], ids), TODAY);

		assert.equal(deleteExpense(householdId, id), true);
		assert.equal(listLedger(householdId).length, 0);
		assert.equal(balances(householdId).byPerson[ids[0]], 0);

		assert.equal(restoreExpense(householdId, id), true);
		assert.equal(listLedger(householdId).length, 1);

		deleteExpense(householdId, id);
		assert.equal(purgeDeletedExpenses(householdId, new Date(Date.now() - 60_000)), 0);
		assert.equal(purgeDeletedExpenses(householdId, new Date(Date.now() + 60_000)), 1);
		assert.equal(restoreExpense(householdId, id), false);
	});
});

describe('settling up', () => {
	it('a payment moves the balance it pays, and paying it all settles the house', () => {
		const { householdId, owner, members, ids } = household();
		createExpense(householdId, owner.id, groceries(ids[0], ids, 4900), TODAY);

		assert.deepEqual(balances(householdId).payments, [
			{ from: ids[1], to: ids[0], amountMinor: 2450 }
		]);

		createPayment(
			householdId,
			members[1].id,
			{ fromId: ids[1], toId: ids[0], amountMinor: 1000, date: TODAY },
			TODAY
		);
		assert.deepEqual(balances(householdId).payments, [
			{ from: ids[1], to: ids[0], amountMinor: 1450 }
		]);

		createPayment(
			householdId,
			members[1].id,
			{ fromId: ids[1], toId: ids[0], amountMinor: 1450, date: TODAY },
			TODAY
		);
		assert.deepEqual(balances(householdId).payments, []);
	});

	it('refuses paying yourself', () => {
		const { householdId, owner, ids } = household();
		assert.throws(
			() =>
				createPayment(
					householdId,
					owner.id,
					{ fromId: ids[0], toId: ids[0], amountMinor: 100, date: TODAY },
					TODAY
				),
			rejects('same-person')
		);
	});

	it('A → B → C → A of €10 each leaves nobody owing anybody', () => {
		const { householdId, owner, ids } = household(['Elisabeth', 'Marco']);
		const [a, b, c] = ids;
		createExpense(householdId, owner.id, groceries(b, [a], 1000), TODAY);
		createExpense(householdId, owner.id, groceries(c, [b], 1000), TODAY);
		createExpense(householdId, owner.id, groceries(a, [c], 1000), TODAY);

		assert.deepEqual(balances(householdId), {
			byPerson: { [a]: 0, [b]: 0, [c]: 0 },
			payments: []
		});
	});
});

describe('history and suggestions', () => {
	it('filters by text inside words, category, person, mine and payments, a month at a time', () => {
		const { householdId, owner, members, ids } = household(['Elisabeth', 'Marco']);
		const [me, elisabeth, marco] = ids;
		const log = (input: Partial<ExpenseInput>) =>
			createExpense(householdId, owner.id, { ...groceries(me, ids), ...input }, TODAY);

		log({ description: 'Wocheneinkauf · Billa', date: '2026-11-20' });
		log({
			description: 'Kino',
			category: 'leisure',
			paidById: elisabeth,
			rows: [{ id: marco, input: null }],
			date: '2026-11-10'
		});
		log({ description: 'Rent', category: 'bills', date: '2026-09-01', amountMinor: 90000 });
		createPayment(
			householdId,
			members[1].id,
			{ fromId: elisabeth, toId: me, amountMinor: 500, date: '2026-11-21' },
			TODAY
		);

		const ledger = listLedger(householdId);
		const none: HistoryFilters = {
			query: '',
			category: null,
			personId: null,
			mine: false,
			payments: false
		};
		const run = (filters: Partial<HistoryFilters>, from?: string) =>
			filterHistory(ledger, { ...none, ...filters }, me, TODAY, from);

		const november = run({});
		assert.equal(november.months.length, 1);
		assert.equal(november.months[0].items.length, 3);
		assert.equal(november.months[0].spentMinor, 4210 * 2);
		assert.equal(november.older, '2026-09-01');

		assert.deepEqual(
			run({ query: 'BILLA' }).months[0].items.map((item) => item.description),
			['Wocheneinkauf · Billa']
		);
		assert.equal(run({ category: 'leisure' }).months[0].items.length, 1);
		assert.equal(run({ mine: true }).months[0].items.length, 2);
		assert.equal(run({ personId: marco }).months[0].items.length, 2);
		assert.deepEqual(
			run({ payments: true }).months[0].items.map((item) => item.kind),
			['payment']
		);
		// Nothing older matches "Kino", so there is no "Show September" for it.
		assert.equal(run({ query: 'kino' }).older, null);

		const paged = run({}, '2026-09-15');
		assert.deepEqual(
			paged.months.map((month) => month.month),
			['2026-11-01', '2026-09-01']
		);
		assert.equal(paged.older, null);
	});

	it('suggests each wording once, with the category it was last logged under', () => {
		const { householdId, owner, ids } = household();
		createExpense(
			householdId,
			owner.id,
			{
				...groceries(ids[0], ids),
				description: 'billa',
				category: 'household',
				date: '2026-11-01'
			},
			TODAY
		);
		createExpense(
			householdId,
			owner.id,
			{ ...groceries(ids[0], ids), description: 'Billa', date: '2026-11-20' },
			TODAY
		);

		assert.deepEqual(descriptionSuggestions(listLedger(householdId)), [
			{ description: 'Billa', category: 'groceries' }
		]);
	});
});

describe('settings', () => {
	it('stores a 30 / 70 default, and refuses one that isn’t 100%', () => {
		const { householdId, ids } = household();

		setSplitDefault(householdId, 'percent', [
			{ personId: ids[0], weight: 3000 },
			{ personId: ids[1], weight: 7000 }
		]);
		assert.deepEqual(getExpenseSettings(householdId).splitDefault, {
			mode: 'percent',
			weights: { [ids[0]]: 3000, [ids[1]]: 7000 }
		});

		assert.throws(
			() => setSplitDefault(householdId, 'percent', [{ personId: ids[0], weight: 3000 }]),
			rejects('split')
		);

		setSplitDefault(householdId, 'equal', []);
		assert.deepEqual(getExpenseSettings(householdId).splitDefault, { mode: 'equal', weights: {} });
	});

	it('a default can only name current members', () => {
		const { householdId, members, ids } = household(['Elisabeth', 'Marco']);
		leaveHousehold(householdId, members[2].id);

		assert.throws(
			() =>
				setSplitDefault(householdId, 'shares', [
					{ personId: ids[0], weight: 1 },
					{ personId: ids[2], weight: 1 }
				]),
			rejects('person')
		);
	});

	it('the currency is the owner’s, and only until the first expense', () => {
		const { householdId, owner, members, ids } = household();

		assert.throws(() => setCurrency(householdId, members[1].id, 'CHF'));
		assert.throws(() => setCurrency(householdId, owner.id, 'XYZ'), rejects('currency'));
		setCurrency(householdId, owner.id, 'CHF');
		assert.equal(getExpenseSettings(householdId).currency, 'CHF');

		const id = createExpense(householdId, owner.id, groceries(ids[0], ids), TODAY);
		deleteExpense(householdId, id);
		assert.throws(() => setCurrency(householdId, owner.id, 'EUR'), rejects('currency-locked'));
		assert.equal(getExpenseSettings(householdId).hasExpenses, true);
	});
});
