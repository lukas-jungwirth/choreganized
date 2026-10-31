/**
 * The ledger's arithmetic (→ utils/money.ts, SPEC §11, DECISIONS #169): money
 * in integer minor units, splits that always add up to the cent, and the
 * payments that settle a household.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	currencyAfter,
	formatAmountInput,
	formatMoney,
	formatPercent,
	minorDigits,
	netBalances,
	parseAmount,
	parsePercent,
	settlePayments,
	splitAmount,
	type LedgerEntry
} from './money';

describe('parseAmount', () => {
	it('reads either decimal separator, in either language', () => {
		assert.equal(parseAmount('12,50', 'EUR'), 1250);
		assert.equal(parseAmount('12.50', 'EUR'), 1250);
		assert.equal(parseAmount('12,5', 'EUR'), 1250);
		assert.equal(parseAmount('42', 'EUR'), 4200);
		assert.equal(parseAmount(' € 3.10 ', 'EUR'), 310);
		assert.equal(parseAmount('0,99', 'EUR'), 99);
	});

	it('reads thousands groups the way they were meant', () => {
		assert.equal(parseAmount('1.234,50', 'EUR'), 123450);
		assert.equal(parseAmount('1,234.50', 'EUR'), 123450);
		assert.equal(parseAmount('1.000.000', 'EUR'), 100000000);
		assert.equal(parseAmount('1 234,50', 'EUR'), 123450);
	});

	it('refuses one mark with three digits after it — a thousand, or three decimals?', () => {
		for (const text of ['1,234', '12.505', '12,345', '0,005', '0,001', '01.234,50']) {
			assert.equal(parseAmount(text, 'EUR'), null, text);
		}
	});

	it('refuses what is not an amount', () => {
		for (const text of ['', '0', '0,00', '-5', 'abc', '12,345,6', '1.23.4', ',', '1e3']) {
			assert.equal(parseAmount(text, 'EUR'), null, text);
		}
	});

	it('caps at a million and respects a currency without cents', () => {
		assert.equal(parseAmount('1000000', 'EUR'), 100_000_000);
		assert.equal(parseAmount('1000000,01', 'EUR'), null);
		assert.equal(minorDigits('JPY'), 0);
		assert.equal(parseAmount('500', 'JPY'), 500);
		assert.equal(parseAmount('500,5', 'JPY'), null);
	});
});

describe('formatting', () => {
	it('writes the currency the way the reader expects', () => {
		assert.equal(formatMoney(2450, 'EUR', 'en-GB'), '€24.50');
		assert.equal(formatMoney(2450, 'EUR', 'de-AT').replace(/\s/g, ' '), '€ 24,50');
		assert.equal(formatMoney(500, 'JPY', 'en-GB'), 'JP¥500');
	});

	it('puts the currency mark where the reader writes it', () => {
		assert.equal(currencyAfter('EUR', 'en-US'), false);
		assert.equal(currencyAfter('EUR', 'de-AT'), false);
		assert.equal(currencyAfter('EUR', 'de-DE'), true);
		assert.equal(currencyAfter('CHF', 'de-AT'), false);
	});

	it('gives an amount back to its field in the shape parseAmount reads', () => {
		assert.equal(formatAmountInput(2450, 'EUR', false), '24.50');
		assert.equal(formatAmountInput(2405, 'EUR', true), '24,05');
		assert.equal(parseAmount(formatAmountInput(123456, 'EUR', true), 'EUR'), 123456);
	});

	it('reads and writes percentages with one decimal', () => {
		assert.equal(parsePercent('30'), 3000);
		assert.equal(parsePercent('33,3'), 3330);
		assert.equal(parsePercent('33.3 %'), 3330);
		assert.equal(parsePercent('100'), 10000);
		assert.equal(parsePercent('100.1'), null);
		assert.equal(parsePercent('33.33'), null);
		assert.equal(formatPercent(3330, true), '33,3');
		assert.equal(formatPercent(7000), '70');
	});
});

describe('splitAmount', () => {
	const three = [
		{ id: 'a', input: null },
		{ id: 'b', input: null },
		{ id: 'c', input: null }
	];
	const sum = (result: ReturnType<typeof splitAmount>) =>
		result.ok ? result.shares.reduce((total, share) => total + share.shareMinor, 0) : NaN;

	it('splits €10 three ways as 3.34 / 3.33 / 3.33, the extra cent to the first', () => {
		const result = splitAmount(1000, 'equal', three);
		assert.ok(result.ok);
		assert.deepEqual(
			result.shares.map((share) => share.shareMinor),
			[334, 333, 333]
		);
	});

	it('gives leftover cents to the largest remainders, not the first rows', () => {
		// 30 / 70 of €0.05: exact 1.5 and 3.5 — a tie, so list order decides.
		const tie = splitAmount(5, 'percent', [
			{ id: 'a', input: 3000 },
			{ id: 'b', input: 7000 }
		]);
		assert.ok(tie.ok);
		assert.deepEqual(
			tie.shares.map((share) => share.shareMinor),
			[2, 3]
		);

		// 1 : 2 shares of €1.00: exact 33.33 and 66.67 — the second has the larger remainder.
		const shares = splitAmount(100, 'shares', [
			{ id: 'a', input: 1 },
			{ id: 'b', input: 2 }
		]);
		assert.ok(shares.ok);
		assert.deepEqual(
			shares.shares.map((share) => share.shareMinor),
			[33, 67]
		);
	});

	it('always adds up to the amount', () => {
		for (let amount = 1; amount < 400; amount += 7) {
			assert.equal(sum(splitAmount(amount, 'equal', three)), amount);
			assert.equal(
				sum(
					splitAmount(amount, 'percent', [
						{ id: 'a', input: 3330 },
						{ id: 'b', input: 3330 },
						{ id: 'c', input: 3340 }
					])
				),
				amount
			);
			assert.equal(
				sum(
					splitAmount(amount, 'shares', [
						{ id: 'a', input: 2 },
						{ id: 'b', input: 3 },
						{ id: 'c', input: 5 }
					])
				),
				amount
			);
		}
	});

	it('says how much is missing when amounts or percentages don’t add up', () => {
		assert.deepEqual(
			splitAmount(4210, 'amounts', [
				{ id: 'a', input: 2000 },
				{ id: 'b', input: 1890 }
			]),
			{ ok: false, reason: 'remainder', missing: 320 }
		);
		assert.deepEqual(
			splitAmount(4210, 'percent', [
				{ id: 'a', input: 6000 },
				{ id: 'b', input: 5000 }
			]),
			{ ok: false, reason: 'remainder', missing: -1000 }
		);
	});

	it('keeps typed amounts as typed and records what was typed', () => {
		const result = splitAmount(4210, 'amounts', [
			{ id: 'a', input: 2000 },
			{ id: 'b', input: 2210 }
		]);
		assert.deepEqual(result, {
			ok: true,
			shares: [
				{ id: 'a', shareMinor: 2000, input: 2000 },
				{ id: 'b', shareMinor: 2210, input: 2210 }
			]
		});
	});

	it('refuses an empty split, duplicates, and impossible inputs', () => {
		assert.equal(splitAmount(100, 'equal', []).ok, false);
		assert.equal(splitAmount(100, 'equal', [three[0], three[0]]).ok, false);
		assert.equal(splitAmount(100, 'shares', [{ id: 'a', input: 0 }]).ok, false);
		assert.equal(splitAmount(100, 'shares', [{ id: 'a', input: 1.5 }]).ok, false);
		assert.equal(splitAmount(100, 'amounts', [{ id: 'a', input: -100 }]).ok, false);
	});
});

describe('balances and settling up', () => {
	const entry = (paidById: string, amountMinor: number, ...owers: string[]): LedgerEntry => {
		const result = splitAmount(
			amountMinor,
			'equal',
			owers.map((id) => ({ id, input: null }))
		);
		assert.ok(result.ok);
		return {
			paidById,
			amountMinor,
			shares: result.shares.map(({ id, shareMinor }) => ({ personId: id, shareMinor }))
		};
	};

	it('a cycle of debts settles to nothing at all', () => {
		// A owes B €10, B owes C €10, C owes A €10 (→ SPEC §11.6).
		const balances = netBalances(
			['a', 'b', 'c'],
			[entry('b', 1000, 'a'), entry('c', 1000, 'b'), entry('a', 1000, 'c')]
		);
		assert.deepEqual([...balances.values()], [0, 0, 0]);
		assert.deepEqual(settlePayments(balances), []);
	});

	it('two people get exactly one line', () => {
		const balances = netBalances(
			['lukas', 'elisabeth'],
			[entry('lukas', 4210, 'lukas', 'elisabeth'), entry('elisabeth', 1000, 'lukas', 'elisabeth')]
		);
		assert.equal(balances.get('lukas'), 1605);
		assert.deepEqual(settlePayments(balances), [
			{ from: 'elisabeth', to: 'lukas', amountMinor: 1605 }
		]);
	});

	it('a payment is an entry like any other, and settles the line it pays', () => {
		const balances = netBalances(
			['lukas', 'elisabeth'],
			[entry('lukas', 4900, 'lukas', 'elisabeth'), entry('elisabeth', 2450, 'lukas')]
		);
		assert.deepEqual([...balances.values()], [0, 0]);
	});

	it('balances always sum to zero, and at most n − 1 payments settle them', () => {
		const people = ['a', 'b', 'c', 'd', 'e'];
		let seed = 7;
		const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;

		for (let round = 0; round < 50; round++) {
			const entries = Array.from({ length: 12 }, () => {
				const owers = people.filter(() => random() < 0.6);
				return entry(
					people[Math.floor(random() * people.length)],
					1 + Math.floor(random() * 20000),
					...(owers.length ? owers : ['a'])
				);
			});
			const balances = netBalances(people, entries);
			assert.equal(
				[...balances.values()].reduce((total, balance) => total + balance, 0),
				0
			);

			const payments = settlePayments(balances);
			assert.ok(payments.length <= people.length - 1);

			const after = new Map(balances);
			for (const { from, to, amountMinor } of payments) {
				assert.ok(amountMinor > 0);
				after.set(from, (after.get(from) ?? 0) + amountMinor);
				after.set(to, (after.get(to) ?? 0) - amountMinor);
			}
			assert.ok([...after.values()].every((balance) => balance === 0));
		}
	});
});
