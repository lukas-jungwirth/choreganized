/**
 * Guests in the ledger (→ plan 38 step 1, SPEC §11.15): adding, renaming,
 * "Include in new expenses" and removing, through the service, against a
 * migrated database. The arithmetic with a guest in it is the unit tests'
 * (`components/expenses/split-draft.test.ts`, `utils/money.test.ts`).
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { describe, it } from 'vitest';
import { listSeries } from '$lib/server/services/expense-recurrences';
import {
	addGuest,
	balancesOf,
	createExpense,
	createPayment,
	ExpenseError,
	listLedger,
	listPeople,
	removeGuest,
	renameGuest,
	setGuestIncludeInNew,
	updateExpense,
	type ExpenseInput
} from '$lib/server/services/expenses';
import { MEMBER_COLORS } from '$lib/member-colors';
import { GUESTS_MAX } from '$lib/utils/expenses';
import { db, makeHousehold, tables } from '../helpers/db';

const TODAY = '2026-11-24';

const rejects = (code: string) => (error: unknown) =>
	error instanceof ExpenseError && error.code === code;

function household() {
	const fixture = makeHousehold({ housemates: ['Elisabeth'] });
	const [lukas, elisabeth] = listPeople(fixture.householdId).map((person) => person.id);
	return { ...fixture, lukas, elisabeth };
}

function dinner(paidById: string, among: string[], amountMinor = 14400): ExpenseInput {
	return {
		description: 'Dinner in Bozen',
		category: 'eatingOut',
		amountMinor,
		date: TODAY,
		paidById,
		splitMode: 'equal',
		rows: among.map((id) => ({ id, input: null }))
	};
}

const person = (householdId: string, id: string) =>
	listPeople(householdId).find((row) => row.id === id);

describe('adding a guest', () => {
	it('makes a person who is no member, after the members, with a colour nobody wears', () => {
		const { householdId, lukas, elisabeth } = household();
		const jonas = addGuest(householdId, '  Jonas ');

		const people = listPeople(householdId);
		assert.deepEqual(
			people.map((row) => row.id),
			[lukas, elisabeth, jonas]
		);
		const guest = people[2];
		assert.equal(guest.name, 'Jonas');
		assert.equal(guest.guest, true);
		assert.equal(guest.memberId, null);
		assert.equal(guest.removed, false);
		assert.equal(guest.includeInNew, false);
		const worn = people.slice(0, 2).map((row) => row.color.toUpperCase());
		assert.ok(!worn.includes(guest.color.toUpperCase()));
		assert.ok(MEMBER_COLORS.some((color) => color.value === guest.color));
	});

	it('refuses an empty name, one too long, and one an active person already has, whatever the case', () => {
		const { householdId } = household();
		assert.throws(() => addGuest(householdId, '   '), rejects('guest-name'));
		assert.throws(() => addGuest(householdId, 'x'.repeat(21)), rejects('guest-name'));
		assert.throws(() => addGuest(householdId, 'elisabeth'), rejects('guest-name-taken'));
		addGuest(householdId, 'Jonas');
		assert.throws(() => addGuest(householdId, 'JONAS'), rejects('guest-name-taken'));
	});

	it(`stops at ${GUESTS_MAX} active guests`, () => {
		const { householdId } = household();
		for (let index = 0; index < GUESTS_MAX; index++) addGuest(householdId, `Guest ${index}`);
		assert.throws(() => addGuest(householdId, 'One more'), rejects('guest-limit'));
	});

	it('a guest can share and pay, and the balance counts them like anyone', () => {
		const { householdId, owner, lukas, elisabeth } = household();
		const jonas = addGuest(householdId, 'Jonas');
		createExpense(householdId, owner.id, dinner(lukas, [lukas, elisabeth, jonas]), TODAY);
		createExpense(
			householdId,
			owner.id,
			{ ...dinner(jonas, [lukas, elisabeth, jonas], 13200), description: 'Fuel and toll' },
			TODAY
		);

		const { byPerson } = balancesOf(listPeople(householdId), listLedger(householdId));
		assert.equal(byPerson[jonas], 13200 - 4800 - 4400);
		assert.equal(byPerson[lukas] + byPerson[elisabeth] + byPerson[jonas], 0);

		// Settle up from and to a guest.
		createPayment(
			householdId,
			owner.id,
			{ fromId: lukas, toId: jonas, amountMinor: 1000, date: TODAY },
			TODAY
		);
		assert.equal(
			balancesOf(listPeople(householdId), listLedger(householdId)).byPerson[jonas],
			13200 - 4800 - 4400 - 1000
		);
	});

	it('another household’s guest is unreachable', () => {
		const ours = household();
		const theirs = household();
		const jonas = addGuest(theirs.householdId, 'Jonas');

		assert.ok(!listPeople(ours.householdId).some((row) => row.id === jonas));
		assert.throws(
			() =>
				createExpense(
					ours.householdId,
					ours.owner.id,
					dinner(ours.lukas, [ours.lukas, jonas]),
					TODAY
				),
			rejects('person')
		);
		assert.throws(() => renameGuest(ours.householdId, jonas, 'Hacked'), rejects('not-found'));
		assert.throws(() => removeGuest(ours.householdId, jonas), rejects('not-found'));
		assert.throws(() => setGuestIncludeInNew(ours.householdId, jonas, true), rejects('not-found'));
		// …nor is a member, through the guest functions.
		assert.throws(
			() => renameGuest(ours.householdId, ours.elisabeth, 'Lisi'),
			rejects('not-found')
		);
	});
});

describe('changing a guest', () => {
	it('renames, keeping the name rule, and switches "Include in new expenses"', () => {
		const { householdId } = household();
		const jonas = addGuest(householdId, 'Jonas');
		const marco = addGuest(householdId, 'Marco');

		renameGuest(householdId, jonas, 'Jonas K.');
		assert.equal(person(householdId, jonas)?.name, 'Jonas K.');
		// Its own name in another case is fine; someone else's is not.
		renameGuest(householdId, jonas, 'jonas k.');
		assert.throws(() => renameGuest(householdId, jonas, 'MARCO'), rejects('guest-name-taken'));
		assert.throws(() => renameGuest(householdId, marco, 'Owner'), rejects('guest-name-taken'));

		setGuestIncludeInNew(householdId, jonas, true);
		assert.equal(person(householdId, jonas)?.includeInNew, true);
		setGuestIncludeInNew(householdId, jonas, false);
		assert.equal(person(householdId, jonas)?.includeInNew, false);
	});
});

describe('removing a guest', () => {
	it('is refused while a balance is open, and allowed once settled', () => {
		const { householdId, owner, lukas, elisabeth } = household();
		const jonas = addGuest(householdId, 'Jonas');
		createExpense(householdId, owner.id, dinner(lukas, [lukas, elisabeth, jonas]), TODAY);

		assert.throws(() => removeGuest(householdId, jonas), rejects('guest-balance'));

		createPayment(
			householdId,
			owner.id,
			{ fromId: jonas, toId: lukas, amountMinor: 4800, date: TODAY },
			TODAY
		);
		setGuestIncludeInNew(householdId, jonas, true);
		removeGuest(householdId, jonas);

		const gone = person(householdId, jonas);
		assert.equal(gone?.removed, true);
		assert.equal(gone?.includeInNew, false);
		assert.equal(gone?.name, 'Jonas', 'still named in history');
		const row = db
			.select()
			.from(tables.ledgerPeople)
			.where(eq(tables.ledgerPeople.id, jonas))
			.get();
		assert.equal(row?.shareToken, null, 'their link stops working');
		// Last in the list, after the members.
		assert.equal(listPeople(householdId).at(-1)?.id, jonas);
		// The old expense still names them.
		assert.ok(
			listLedger(householdId).some((item) => item.shares.some((s) => s.personId === jonas))
		);
	});

	it('takes them out of new rows, keeps them in old ones, and frees the name', () => {
		const { householdId, owner, lukas, elisabeth } = household();
		const jonas = addGuest(householdId, 'Jonas');
		const id = createExpense(
			householdId,
			owner.id,
			dinner(lukas, [lukas, elisabeth, jonas], 900),
			TODAY
		);
		createPayment(
			householdId,
			owner.id,
			{ fromId: jonas, toId: lukas, amountMinor: 300, date: TODAY },
			TODAY
		);
		removeGuest(householdId, jonas);

		assert.throws(
			() => createExpense(householdId, owner.id, dinner(lukas, [lukas, jonas]), TODAY),
			rejects('person')
		);
		assert.throws(
			() =>
				createPayment(
					householdId,
					owner.id,
					{ fromId: lukas, toId: jonas, amountMinor: 100, date: TODAY },
					TODAY
				),
			rejects('person')
		);
		// Editing the old dinner keeps Jonas in it.
		updateExpense(
			householdId,
			owner.id,
			id,
			{ ...dinner(lukas, [lukas, elisabeth, jonas], 900), description: 'Dinner' },
			TODAY
		);
		assert.throws(() => renameGuest(householdId, jonas, 'Jo'), rejects('not-found'));
		assert.throws(() => removeGuest(householdId, jonas), rejects('not-found'));

		const again = addGuest(householdId, 'Jonas');
		assert.notEqual(again, jonas, 'adding the name again makes a new person');
	});

	it('stops every series the guest pays or shares in, and leaves the others running', () => {
		const { householdId, owner, lukas, elisabeth } = household();
		const jonas = addGuest(householdId, 'Jonas');
		const month = { unit: 'month' as const, interval: 1 };

		const withJonas = createExpense(
			householdId,
			owner.id,
			{ ...dinner(lukas, [lukas, jonas], 2000), description: 'Streaming' },
			TODAY,
			month
		);
		createExpense(
			householdId,
			owner.id,
			{ ...dinner(lukas, [lukas, elisabeth], 2000), description: 'Rent' },
			TODAY,
			month
		);
		// Square Jonas: he owes 1000 for the first one.
		createPayment(
			householdId,
			owner.id,
			{ fromId: jonas, toId: lukas, amountMinor: 1000, date: TODAY },
			TODAY
		);
		assert.ok(withJonas);

		removeGuest(householdId, jonas);
		assert.deepEqual(
			listSeries(householdId).map((series) => series.description),
			['Rent']
		);
	});
});
