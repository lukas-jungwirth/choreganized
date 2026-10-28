/**
 * Recurring expenses and the expense notices (→ SPEC §11.9, §11.11, plan 30).
 *
 * `utils/dates.test.ts` pins the calendar arithmetic. What needs a database is
 * the promise the sweep makes — every due occurrence exactly once, however
 * late it runs and however often — and that a series, an occurrence and the
 * past each change only when they are the thing being edited. The notices are
 * read off `expenseNotices`, the half of the push path that decides who hears
 * what; `push.ts` itself is off under Vitest.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { describe, it } from 'vitest';
import { catalog } from '$lib/i18n';
import { expenseNotices, type ExpenseEvent } from '$lib/server/services/expense-notify';
import {
	countSeries,
	getSeries,
	seriesByMember,
	listSeries,
	materializeDue,
	stopSeries,
	updateSeries,
	type SeriesInput
} from '$lib/server/services/expense-recurrences';
import {
	createExpense,
	createPayment,
	deleteExpense,
	ExpenseError,
	listLedger,
	listPeople,
	updateExpense,
	type ExpenseInput
} from '$lib/server/services/expenses';
import { leaveHousehold, removeMember } from '$lib/server/services/household';
import { db, makeHousehold, tables } from '../helpers/db';

const TODAY = '2026-11-24';
const MONTHLY = { unit: 'month', interval: 1 } as const;
const WEEKLY = { unit: 'week', interval: 1 } as const;

function household(housemates = ['Elisabeth']) {
	const fixture = makeHousehold({ housemates });
	const people = listPeople(fixture.householdId);
	return { ...fixture, people, ids: people.map((person) => person.id) };
}

function rent(paidById: string, rows: string[], date: string, amountMinor = 90000): ExpenseInput {
	return {
		description: 'Rent',
		category: 'bills',
		amountMinor,
		date,
		paidById,
		splitMode: 'equal',
		rows: rows.map((id) => ({ id, input: null }))
	};
}

function occurrences(householdId: string, recurrenceId: string) {
	return listLedger(householdId)
		.filter((item) => item.recurrenceId === recurrenceId)
		.map((item) => item.date)
		.sort();
}

const rejects = (code: string) => (error: unknown) =>
	error instanceof ExpenseError && error.code === code;

describe('starting a series', () => {
	it('an expense saved with "Repeats" is the first of a series, due one unit later', () => {
		const { householdId, owner, ids } = household();
		const id = createExpense(
			householdId,
			owner.id,
			rent(ids[0], ids, '2026-11-01'),
			TODAY,
			MONTHLY
		);

		const [series] = listSeries(householdId);
		assert.equal(series.description, 'Rent');
		assert.equal(series.unit, 'month');
		assert.equal(series.interval, 1);
		assert.equal(series.anchorDay, 1);
		assert.equal(series.nextDate, '2026-12-01');
		assert.equal(series.occurrences, 1);
		assert.deepEqual(
			series.shares.map((share) => share.shareMinor),
			[45000, 45000]
		);

		const first = listLedger(householdId).find((item) => item.id === id);
		assert.equal(first?.recurrenceId, series.id);
		assert.deepEqual(first?.repeats, MONTHLY);
		assert.equal(countSeries(householdId), 1);
	});

	it('a weekly series has no anchor day', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-11-20'), TODAY, WEEKLY);

		const [series] = listSeries(householdId);
		assert.equal(series.anchorDay, null);
		assert.equal(series.nextDate, '2026-11-27');
	});

	it('editing an expense that repeats nothing can start a series from it', () => {
		const { householdId, owner, ids } = household();
		const id = createExpense(householdId, owner.id, rent(ids[0], ids, '2026-11-03'), TODAY);
		assert.equal(listSeries(householdId).length, 0);

		updateExpense(householdId, owner.id, id, rent(ids[0], ids, '2026-11-03', 8640), TODAY, MONTHLY);
		const [series] = listSeries(householdId);
		assert.equal(series.amountMinor, 8640);
		assert.equal(series.nextDate, '2026-12-03');

		// Saving it again with "Repeats" set doesn't start a second one.
		updateExpense(householdId, owner.id, id, rent(ids[0], ids, '2026-11-03', 8640), TODAY, MONTHLY);
		assert.equal(listSeries(householdId).length, 1);
	});
});

describe('the sweep', () => {
	it('catches up three missed months with three expenses, and a second run adds none', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-08-01'), TODAY, MONTHLY);
		const [series] = listSeries(householdId);

		const logged = materializeDue(householdId, TODAY);
		assert.equal(logged.length, 3);
		assert.deepEqual(occurrences(householdId, series.id), [
			'2026-08-01',
			'2026-09-01',
			'2026-10-01',
			'2026-11-01'
		]);
		assert.equal(getSeries(householdId, series.id)?.nextDate, '2026-12-01');

		assert.deepEqual(materializeDue(householdId, TODAY), []);
		assert.equal(occurrences(householdId, series.id).length, 4);
	});

	it('logs an occurrence on its own day — not before', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-10-25'), TODAY, MONTHLY);

		assert.deepEqual(materializeDue(householdId, TODAY), []);
		assert.equal(materializeDue(householdId, '2026-11-25').length, 1);
	});

	it('a series from the 31st keeps to the month’s end and comes back to the 31st', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-01-31'), '2026-01-31', MONTHLY);
		const [series] = listSeries(householdId);

		materializeDue(householdId, '2026-05-31');
		assert.deepEqual(occurrences(householdId, series.id), [
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
			'2026-04-30',
			'2026-05-31'
		]);
	});

	it('each occurrence is a normal expense: its shares add up, its creator is the series’', () => {
		const { householdId, members, ids } = household(['Elisabeth', 'Marco']);
		createExpense(
			householdId,
			members[1].id,
			{ ...rent(ids[0], ids, '2026-10-24', 10000), splitMode: 'equal' },
			TODAY,
			MONTHLY
		);
		const [series] = listSeries(householdId);
		const [expenseId] = materializeDue(householdId, TODAY);

		const occurrence = listLedger(householdId).find((item) => item.id === expenseId);
		assert.equal(occurrence?.date, TODAY);
		assert.equal(occurrence?.recurrenceId, series.id);
		assert.equal(occurrence?.createdBy, 'Elisabeth');
		assert.deepEqual(
			occurrence?.shares.map((share) => share.shareMinor),
			[3334, 3333, 3333]
		);
	});

	it('every 3 months from 31 Jan: Apr 30, Jul 31, Oct 31 — and nothing in between', () => {
		const { householdId, owner, ids } = household();
		const id = createExpense(householdId, owner.id, rent(ids[0], ids, '2026-01-31'), '2026-01-31', {
			unit: 'month',
			interval: 3
		});
		const [series] = listSeries(householdId);
		assert.equal(series.interval, 3);
		assert.equal(series.nextDate, '2026-04-30');
		assert.deepEqual(listLedger(householdId).find((item) => item.id === id)?.repeats, {
			unit: 'month',
			interval: 3
		});

		materializeDue(householdId, TODAY);
		assert.deepEqual(occurrences(householdId, series.id), [
			'2026-01-31',
			'2026-04-30',
			'2026-07-31',
			'2026-10-31'
		]);
		assert.equal(getSeries(householdId, series.id)?.nextDate, '2027-01-31');
	});

	it('every 2 weeks is fourteen days apart', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-10-27'), TODAY, {
			unit: 'week',
			interval: 2
		});
		const [series] = listSeries(householdId);

		materializeDue(householdId, TODAY);
		assert.deepEqual(occurrences(householdId, series.id), [
			'2026-10-27',
			'2026-11-10',
			'2026-11-24'
		]);
	});

	it('never touches another household’s series', () => {
		const a = household();
		const b = household();
		createExpense(a.householdId, a.owner.id, rent(a.ids[0], a.ids, '2026-10-01'), TODAY, MONTHLY);

		assert.deepEqual(materializeDue(b.householdId, TODAY), []);
		assert.equal(materializeDue(a.householdId, TODAY).length, 1);
	});
});

describe('editing and stopping', () => {
	function seriesInput(ids: string[], patch: Partial<SeriesInput> = {}): SeriesInput {
		const { date: _date, ...template } = rent(ids[0], ids, TODAY);
		return { ...template, unit: 'month', interval: 1, nextDate: '2026-12-01', ...patch };
	}

	it('editing the series changes the ones to come, never the ones logged', () => {
		const { householdId, owner, ids } = household();
		const first = createExpense(
			householdId,
			owner.id,
			rent(ids[0], ids, '2026-10-01'),
			TODAY,
			MONTHLY
		);
		const [series] = listSeries(householdId);
		materializeDue(householdId, TODAY);

		updateSeries(
			householdId,
			series.id,
			seriesInput(ids, {
				amountMinor: 95000,
				splitMode: 'percent',
				rows: [
					{ id: ids[0], input: 6000 },
					{ id: ids[1], input: 4000 }
				]
			}),
			TODAY
		);

		const before = listLedger(householdId).filter((item) => item.recurrenceId === series.id);
		assert.deepEqual(
			before.map((item) => item.amountMinor),
			[90000, 90000]
		);
		assert.ok(before.some((item) => item.id === first));

		const [next] = materializeDue(householdId, '2026-12-01');
		const logged = listLedger(householdId).find((item) => item.id === next);
		assert.equal(logged?.amountMinor, 95000);
		assert.deepEqual(
			logged?.shares.map((share) => share.shareMinor),
			[57000, 38000]
		);
	});

	it('editing one occurrence leaves the series alone', () => {
		const { householdId, owner, ids } = household();
		const first = createExpense(
			householdId,
			owner.id,
			rent(ids[0], ids, '2026-11-01'),
			TODAY,
			MONTHLY
		);

		updateExpense(householdId, owner.id, first, rent(ids[0], ids, '2026-11-01', 12000), TODAY);
		const [series] = listSeries(householdId);
		assert.equal(series.amountMinor, 90000);
		assert.equal(series.nextDate, '2026-12-01');
	});

	it('the next date can’t be in the past; moving it re-anchors, keeping it doesn’t', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-01-31'), '2026-01-31', MONTHLY);
		const [series] = listSeries(householdId);
		materializeDue(householdId, '2026-01-31');
		assert.equal(getSeries(householdId, series.id)?.nextDate, '2026-02-28');

		assert.throws(
			() =>
				updateSeries(
					householdId,
					series.id,
					seriesInput(ids, { nextDate: '2026-02-01' }),
					'2026-02-10'
				),
			rejects('next-date')
		);

		// Due yesterday and not swept yet: saving it unchanged is fine.
		updateSeries(
			householdId,
			series.id,
			seriesInput(ids, { nextDate: '2026-02-28' }),
			'2026-03-01'
		);
		assert.equal(getSeries(householdId, series.id)?.nextDate, '2026-02-28');

		// Saved unchanged on the clamped day: still the 31st's series.
		updateSeries(
			householdId,
			series.id,
			seriesInput(ids, { nextDate: '2026-02-28' }),
			'2026-02-10'
		);
		assert.equal(getSeries(householdId, series.id)?.anchorDay, 31);

		updateSeries(
			householdId,
			series.id,
			seriesInput(ids, { nextDate: '2026-03-15' }),
			'2026-02-10'
		);
		assert.equal(getSeries(householdId, series.id)?.anchorDay, 15);
	});

	it('changing the interval re-anchors on the next date and steps by the new interval', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-11-15'), TODAY, MONTHLY);
		const [series] = listSeries(householdId);

		updateSeries(
			householdId,
			series.id,
			seriesInput(ids, { interval: 2, nextDate: '2026-12-15' }),
			TODAY
		);
		const edited = getSeries(householdId, series.id);
		assert.equal(edited?.interval, 2);
		assert.equal(edited?.anchorDay, 15);

		materializeDue(householdId, '2027-04-15');
		assert.deepEqual(occurrences(householdId, series.id), [
			'2026-11-15',
			'2026-12-15',
			'2027-02-15',
			'2027-04-15'
		]);
	});

	it('an interval outside 1–99 is refused', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-11-15'), TODAY, MONTHLY);
		const [series] = listSeries(householdId);

		for (const interval of [0, 100, 1.5]) {
			assert.throws(
				() => updateSeries(householdId, series.id, seriesInput(ids, { interval }), TODAY),
				rejects('split')
			);
		}
		assert.equal(getSeries(householdId, series.id)?.interval, 1);
	});

	it('stopping ends the series and keeps every occurrence', () => {
		const { householdId, owner, ids } = household();
		createExpense(householdId, owner.id, rent(ids[0], ids, '2026-09-01'), TODAY, MONTHLY);
		const [series] = listSeries(householdId);
		materializeDue(householdId, TODAY);
		assert.equal(getSeries(householdId, series.id)?.occurrences, 3);

		assert.equal(stopSeries(householdId, series.id), true);
		assert.equal(stopSeries(householdId, series.id), false);
		assert.equal(getSeries(householdId, series.id), null);
		assert.equal(countSeries(householdId), 0);

		assert.deepEqual(materializeDue(householdId, '2027-03-01'), []);
		const kept = listLedger(householdId).filter((item) => item.recurrenceId === series.id);
		assert.equal(kept.length, 3);
		assert.ok(kept.every((item) => item.repeats === null));
	});

	it('another household can neither see, edit nor stop a series', () => {
		const a = household();
		const b = household();
		createExpense(a.householdId, a.owner.id, rent(a.ids[0], a.ids, TODAY), TODAY, MONTHLY);
		const [series] = listSeries(a.householdId);

		assert.equal(getSeries(b.householdId, series.id), null);
		assert.equal(stopSeries(b.householdId, series.id), false);
		assert.throws(
			() => updateSeries(b.householdId, series.id, seriesInput(a.ids), TODAY),
			rejects('not-found')
		);
	});
});

describe('when someone leaves', () => {
	it('every series they pay or share in stops; the others run on, and the past stays', () => {
		const { householdId, owner, members, ids } = household(['Elisabeth', 'Marco']);
		const [lukas, elisabeth] = ids;
		createExpense(
			householdId,
			owner.id,
			{ ...rent(lukas, ids, '2026-10-01'), description: 'Rent' },
			TODAY,
			MONTHLY
		);
		createExpense(
			householdId,
			owner.id,
			{ ...rent(elisabeth, [elisabeth], '2026-10-05', 1399), description: 'Netflix' },
			TODAY,
			MONTHLY
		);
		createExpense(
			householdId,
			owner.id,
			{ ...rent(lukas, [lukas], '2026-10-07', 3990), description: 'Internet' },
			TODAY,
			MONTHLY
		);
		materializeDue(householdId, TODAY);

		assert.deepEqual(seriesByMember(householdId)[members[1].id]?.sort(), ['Netflix', 'Rent']);

		leaveHousehold(householdId, members[1].id);

		assert.deepEqual(
			listSeries(householdId).map((series) => series.description),
			['Internet']
		);
		// Rent and Netflix logged twice each before the leave, and never again; only
		// Internet (Dec 7) comes due after it.
		assert.equal(materializeDue(householdId, '2026-12-31').length, 1);
		const counts = Object.fromEntries(
			['Rent', 'Netflix', 'Internet'].map((what) => [
				what,
				listLedger(householdId).filter((item) => item.description === what).length
			])
		);
		assert.deepEqual(counts, { Rent: 2, Netflix: 2, Internet: 3 });
	});

	it('removal stops them too, and never another household’s', () => {
		const a = household(['Elisabeth']);
		const b = household(['Elisabeth']);
		createExpense(a.householdId, a.owner.id, rent(a.ids[0], a.ids, TODAY), TODAY, MONTHLY);
		createExpense(b.householdId, b.owner.id, rent(b.ids[0], b.ids, TODAY), TODAY, MONTHLY);

		removeMember(a.householdId, a.owner.id, a.members[1].id);
		assert.equal(countSeries(a.householdId), 0);
		assert.equal(countSeries(b.householdId), 1);
	});

	it('the confirm names the first three, then counts', () => {
		const en = catalog('en');
		assert.equal(en.expenses.leaveSeries(['Rent']), 'Rent will stop repeating.');
		assert.equal(
			en.expenses.leaveSeries(['Rent', 'Netflix', 'Internet', 'Gym']),
			'Rent, Netflix, and 2 more will stop repeating.'
		);
		assert.equal(
			catalog('de').expenses.leaveSeries(['Miete', 'Netflix']),
			'Miete und Netflix wiederholen sich dann nicht mehr.'
		);
	});
});

describe('notices', () => {
	function titles(householdId: string, event: ExpenseEvent, locale: 'en' | 'de' = 'en') {
		return expenseNotices(householdId, event).map((notice) => ({
			memberId: notice.memberId,
			title: notice.payload(catalog(locale)).title
		}));
	}

	it('an added expense tells the others in it — not the actor, not who isn’t in it', () => {
		const { householdId, members, ids } = household(['Elisabeth', 'Marco']);
		const [lukas, elisabeth] = members;
		const id = createExpense(
			householdId,
			lukas.id,
			{ ...rent(ids[0], [ids[0], ids[1]], TODAY, 4210), description: 'Weekly shop · Billa' },
			TODAY
		);

		assert.deepEqual(
			titles(householdId, { kind: 'added', expenseId: id, actorMemberId: lukas.id }),
			[
				{
					memberId: elisabeth.id,
					title: '🧾 Owner added Weekly shop · Billa · €42.10 · your share €21.05'
				}
			]
		);
	});

	it('speaks the recipient’s language', () => {
		const { householdId, members, ids } = household();
		const id = createExpense(
			householdId,
			members[0].id,
			{ ...rent(ids[0], ids, TODAY, 4210), description: 'Wocheneinkauf' },
			TODAY
		);
		const [notice] = titles(
			householdId,
			{ kind: 'added', expenseId: id, actorMemberId: members[0].id },
			'de'
		);
		assert.equal(
			notice.title,
			'🧾 Owner hat Wocheneinkauf eingetragen · € 42,10 · dein Anteil € 21,05'
		);
	});

	it('skips whoever switched expense notifications off', () => {
		const { householdId, members, ids } = household();
		db.update(tables.members)
			.set({ notifyExpenses: false })
			.where(eq(tables.members.id, members[1].id))
			.run();
		const id = createExpense(householdId, members[0].id, rent(ids[0], ids, TODAY), TODAY);

		assert.deepEqual(
			titles(householdId, { kind: 'added', expenseId: id, actorMemberId: members[0].id }),
			[]
		);
	});

	it('an edit tells only those whose share changed — and nobody when none did', () => {
		const { householdId, members, ids } = household(['Elisabeth', 'Marco']);
		const [lukas, elisabeth, marco] = members;
		const id = createExpense(householdId, lukas.id, rent(ids[0], ids, TODAY, 3000), TODAY);
		const before = Object.fromEntries(ids.map((personId) => [personId, 1000]));

		// New wording, same money: nothing to say.
		updateExpense(
			householdId,
			lukas.id,
			id,
			{ ...rent(ids[0], ids, TODAY, 3000), description: 'Miete' },
			TODAY
		);
		assert.deepEqual(
			titles(householdId, { kind: 'changed', expenseId: id, actorMemberId: lukas.id, before }),
			[]
		);

		// Marco out: Elisabeth's share goes up, Marco's to nothing.
		updateExpense(householdId, lukas.id, id, rent(ids[0], [ids[0], ids[1]], TODAY, 3000), TODAY);
		assert.deepEqual(
			titles(householdId, { kind: 'changed', expenseId: id, actorMemberId: lukas.id, before }),
			[
				{ memberId: elisabeth.id, title: '🧾 Owner changed Rent · your share is now €15.00' },
				{ memberId: marco.id, title: '🧾 Owner changed Rent · your share is now €0.00' }
			]
		);
	});

	it('a payment tells its recipient, unless the recipient recorded it', () => {
		const { householdId, members, ids } = household(['Elisabeth', 'Marco']);
		const [lukas, elisabeth, marco] = members;

		const byPayer = createPayment(
			householdId,
			lukas.id,
			{ fromId: ids[0], toId: ids[1], amountMinor: 2450, date: TODAY },
			TODAY
		);
		assert.deepEqual(
			titles(householdId, { kind: 'paid', expenseId: byPayer, actorMemberId: lukas.id }),
			[{ memberId: elisabeth.id, title: '💸 Owner paid you €24.50' }]
		);

		// Marco recorded it for the two of them: Elisabeth still hears it from Lukas.
		const byThird = createPayment(
			householdId,
			marco.id,
			{ fromId: ids[0], toId: ids[1], amountMinor: 500, date: TODAY },
			TODAY
		);
		assert.deepEqual(
			titles(householdId, { kind: 'paid', expenseId: byThird, actorMemberId: marco.id }).map(
				(notice) => notice.memberId
			),
			[elisabeth.id]
		);

		const byRecipient = createPayment(
			householdId,
			elisabeth.id,
			{ fromId: ids[0], toId: ids[1], amountMinor: 500, date: TODAY },
			TODAY
		);
		assert.deepEqual(
			titles(householdId, { kind: 'paid', expenseId: byRecipient, actorMemberId: elisabeth.id }),
			[]
		);
	});

	it('a repeat tells everyone with a share, the payer included — nobody did it', () => {
		const { householdId, members, ids } = household();
		createExpense(householdId, members[0].id, rent(ids[0], ids, '2026-10-24'), TODAY, MONTHLY);
		const [expenseId] = materializeDue(householdId, TODAY);

		assert.deepEqual(titles(householdId, { kind: 'repeated', expenseId }), [
			{ memberId: members[0].id, title: '🔁 Rent was added · your share €450.00' },
			{ memberId: members[1].id, title: '🔁 Rent was added · your share €450.00' }
		]);
	});

	it('a deleted expense, or another household’s, tells nobody', () => {
		const a = household();
		const b = household();
		const id = createExpense(a.householdId, a.owner.id, rent(a.ids[0], a.ids, TODAY), TODAY);

		assert.deepEqual(
			titles(b.householdId, { kind: 'added', expenseId: id, actorMemberId: b.owner.id }),
			[]
		);

		deleteExpense(a.householdId, id);
		assert.deepEqual(
			titles(a.householdId, { kind: 'added', expenseId: id, actorMemberId: a.owner.id }),
			[]
		);
	});
});
