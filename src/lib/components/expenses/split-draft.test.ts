/**
 * The split sheet's draft rules and a row's "your part" (→ split-draft.ts,
 * SPEC §11.2, §11.4).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { ExpenseItem, ExpensePerson } from '$lib/server/services/expenses';
import { netBalances, settlePayments } from '$lib/utils/money';
import {
	draftFromDefault,
	draftRows,
	pickablePeople,
	previewSplit,
	switchDraftMode,
	yourPart
} from './split-draft';

function item(paidById: string, shares: [string, number][]): ExpenseItem {
	return {
		id: 'e',
		kind: 'expense',
		description: 'Haircut',
		category: 'other',
		amountMinor: shares.reduce((sum, [, share]) => sum + share, 0),
		date: '2026-11-24',
		paidById,
		splitMode: 'equal',
		shares: shares.map(([personId, shareMinor]) => ({ personId, shareMinor, input: null })),
		createdBy: null,
		updatedBy: null,
		edited: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		recurrenceId: null,
		repeats: null
	};
}

describe('yourPart', () => {
	it('names lent, borrowed and not involved', () => {
		assert.deepEqual(
			yourPart(
				item('me', [
					['me', 500],
					['b', 500]
				]),
				'me'
			),
			{
				kind: 'lent',
				amountMinor: 500
			}
		);
		assert.deepEqual(
			yourPart(
				item('b', [
					['me', 500],
					['b', 500]
				]),
				'me'
			),
			{
				kind: 'borrowed',
				amountMinor: 500
			}
		);
		assert.equal(yourPart(item('b', [['c', 500]]), 'me').kind, 'none');
	});

	it('something you paid for yourself alone is yours, not "not involved"', () => {
		assert.equal(yourPart(item('me', [['me', 2000]]), 'me').kind, 'own');
	});
});

describe('drafts', () => {
	it('reads either decimal mark, treats an empty amount as nothing, and shows money while it does not add up', () => {
		const draft = { mode: 'amounts' as const, inIds: ['a', 'b'], inputs: { a: '20,00', b: '' } };
		assert.deepEqual(draftRows(draft, 'EUR'), [
			{ id: 'a', input: 2000 },
			{ id: 'b', input: 0 }
		]);
		const preview = previewSplit(draft, 4210, 'EUR');
		assert.equal(preview.result?.ok, false);
		assert.equal(preview.assigned, 2000);
		assert.deepEqual(preview.amounts, { a: 2000, b: 0 });
	});

	it('an empty shares field is one share', () => {
		const draft = { mode: 'shares' as const, inIds: ['a', 'b'], inputs: { a: '2' } };
		const preview = previewSplit(draft, 900, 'EUR');
		assert.deepEqual(preview.amounts, { a: 600, b: 300 });
	});
});

describe('switching mode', () => {
	const equal = { mode: 'equal' as const, inIds: ['a', 'b'], inputs: {} };

	it("does not read one mode's numbers in another's unit: % 50 / 50 → Amounts is the money, not €50 each", () => {
		const percent = switchDraftMode(equal, 'percent', {}, 3000, 'EUR', true);
		assert.deepEqual(percent.draft.inputs, { a: '50', b: '50' });
		const amounts = switchDraftMode(percent.draft, 'amounts', percent.typed, 3000, 'EUR', true);
		assert.deepEqual(amounts.draft.inputs, { a: '15,00', b: '15,00' });
		assert.equal(previewSplit(amounts.draft, 3000, 'EUR').result?.ok, true);
	});

	it('Amounts → % and → Shares start their own way, and coming back keeps what was typed', () => {
		const amounts = switchDraftMode(equal, 'amounts', {}, 4210, 'EUR', false);
		const typed = { ...amounts.draft, inputs: { a: '10.00', b: '32.10' } };
		const percent = switchDraftMode(typed, 'percent', amounts.typed, 4210, 'EUR', false);
		assert.deepEqual(percent.draft.inputs, { a: '50', b: '50' });
		const shares = switchDraftMode(percent.draft, 'shares', percent.typed, 4210, 'EUR', false);
		assert.deepEqual(shares.draft.inputs, { a: '1', b: '1' });
		const back = switchDraftMode(shares.draft, 'amounts', shares.typed, 4210, 'EUR', false);
		assert.deepEqual(back.draft.inputs, { a: '10.00', b: '32.10' });
	});
});

/* ── Guests (→ plan 38, SPEC §11.15) ────────────────────────────────────── */

function person(id: string, extra: Partial<ExpensePerson> = {}): ExpensePerson {
	return {
		id,
		name: id,
		color: '#5F8D72',
		memberId: `member-${id}`,
		guest: false,
		removed: false,
		includeInNew: false,
		defaultWeight: null,
		...extra
	};
}

const guest = (id: string, extra: Partial<ExpensePerson> = {}) =>
	person(id, { memberId: null, guest: true, ...extra });

describe('a weekend with a guest (the sketch’s four expenses)', () => {
	const split3 = (paidById: string, amount: number) =>
		item(paidById, [
			['lukas', amount / 3],
			['elisabeth', amount / 3],
			['jonas', amount / 3]
		]);

	it('gives Elisabeth → Lukas €167.60 and Jonas → Lukas €132.20', () => {
		const ledger = [
			split3('lukas', 42000), // the hut
			split3('elisabeth', 9660), // groceries for the hut
			split3('lukas', 14400), // dinner in Bozen
			split3('jonas', 13200) // fuel and toll, paid by the guest
		];
		const balances = netBalances(['lukas', 'elisabeth', 'jonas'], ledger);
		assert.deepEqual(Object.fromEntries(balances), {
			lukas: 29980,
			elisabeth: -16760,
			jonas: -13220
		});
		assert.deepEqual(settlePayments(balances), [
			{ from: 'elisabeth', to: 'lukas', amountMinor: 16760 },
			{ from: 'jonas', to: 'lukas', amountMinor: 13220 }
		]);
	});
});

describe('guests and the people a new expense starts with', () => {
	const people = [person('lukas'), person('elisabeth'), guest('jonas'), guest('anna')];

	it('an equal default is the members only, with the switch off', () => {
		const draft = draftFromDefault(people, { mode: 'equal', weights: {} }, false);
		assert.deepEqual(draft.inIds, ['lukas', 'elisabeth']);
	});

	it('"Include in new expenses" adds that guest, split equally, and nobody else', () => {
		const withJonas = people.map((row) =>
			row.id === 'jonas' ? { ...row, includeInNew: true } : row
		);
		const draft = draftFromDefault(withJonas, { mode: 'equal', weights: {} }, false);
		assert.deepEqual(draft, { mode: 'equal', inIds: ['lukas', 'elisabeth', 'jonas'], inputs: {} });
	});

	it('a % default leaves the switched-on guest out rather than invent a percentage', () => {
		const withJonas = people.map((row) =>
			row.id === 'jonas' ? { ...row, includeInNew: true } : row
		);
		const draft = draftFromDefault(
			withJonas,
			{ mode: 'percent', weights: { lukas: 3000, elisabeth: 7000 } },
			false
		);
		assert.deepEqual(draft.inIds, ['lukas', 'elisabeth']);
		assert.equal(draft.mode, 'percent');
	});

	it('an active guest is pickable with a zero balance; a removed one only while owing', () => {
		const roster = [
			person('lukas'),
			guest('jonas'),
			guest('anna', { removed: true }),
			person('marco', { memberId: null })
		];
		assert.deepEqual(
			pickablePeople(roster, {}).map((row) => row.id),
			['lukas', 'jonas']
		);
		assert.deepEqual(
			pickablePeople(roster, { anna: -100, marco: 100 }).map((row) => row.id),
			['lukas', 'jonas', 'anna', 'marco']
		);
	});
});
