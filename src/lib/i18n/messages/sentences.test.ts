/**
 * The expense tab's sentences [10a] [10b] (→ SPEC §11.2, §11.3): who they name,
 * when they start counting, and where each language puts its words. A wrong
 * plural or a missing "and" reads as a broken app, and only shows up with the
 * right number of housemates in debt — easier pinned here than clicked into.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { catalog } from '../index';
import type { RichText } from './en';

const text = (rich: RichText) => rich.map((part) => part.text).join('');
const strong = (rich: RichText) => rich.filter((part) => part.strong).map((part) => part.text);

describe('balance sentences', () => {
	const en = catalog('en').expenses.balance;
	const de = catalog('de').expenses.balance;

	it('names one, two or three people, and agrees the verb', () => {
		assert.equal(text(en.owedBy(['Elisabeth'], '€24.50')), 'Elisabeth owes you €24.50');
		assert.equal(
			text(en.owedBy(['Elisabeth', 'Marco'], '€41.30')),
			'Elisabeth and Marco owe you €41.30'
		);
		assert.equal(
			text(en.youOwe(['Elisabeth', 'Marco', 'Jana'], '€40.00')),
			'You owe Elisabeth, Marco, and Jana €40.00'
		);
		assert.equal(text(de.owedBy(['Elisabeth'], '€ 24,50')), 'Elisabeth schuldet dir € 24,50');
		assert.equal(
			text(de.owedBy(['Elisabeth', 'Marco'], '€ 41,30')),
			'Elisabeth und Marco schulden dir € 41,30'
		);
	});

	it('counts from four, capitalised only when it opens the sentence', () => {
		const four = ['Elisabeth', 'Marco', 'Jana', 'Theo'];
		assert.equal(text(en.owedBy(four, '€81.30')), 'Four people owe you €81.30');
		assert.equal(text(en.youOwe(four, '€81.30')), 'You owe four people €81.30');
		assert.equal(text(de.owedBy(four, '€ 81,30')), 'Vier Personen schulden dir € 81,30');
		assert.equal(text(de.youOwe(four, '€ 81,30')), 'Du schuldest vier Personen € 81,30');
	});

	it('emphasises the amount and nothing else', () => {
		assert.deepEqual(strong(en.youOwe(['Marco'], '€12.00')), ['€12.00']);
		assert.deepEqual(strong(en.between('Elisabeth', 'Marco', '€8.40', true)), ['€8.40']);
	});

	it('says "also" only when the reader has a debt of their own', () => {
		assert.equal(
			text(en.between('Elisabeth', 'Marco', '€8.40', true)),
			'Elisabeth also owes Marco €8.40'
		);
		assert.equal(
			text(en.between('Elisabeth', 'Marco', '€8.40', false)),
			'Elisabeth owes Marco €8.40'
		);
		assert.equal(
			text(de.between('Elisabeth', 'Marco', '€ 8,40', true)),
			'Elisabeth schuldet außerdem Marco € 8,40'
		);
	});
});

describe('the add-expense sentence', () => {
	const words = (parts: ReturnType<ReturnType<typeof catalog>['expenses']['form']['sentence']>) =>
		parts.map((part) => (typeof part === 'string' ? part : `[${part.field}]`)).join(' ');

	it('reads in each language’s order, the verb last in German', () => {
		assert.equal(
			words(catalog('en').expenses.form.sentence(true)),
			'[payer] paid [amount] for [what]'
		);
		assert.equal(
			words(catalog('de').expenses.form.sentence(true)),
			'[payer] hast [amount] für [what] bezahlt'
		);
		assert.equal(
			words(catalog('de').expenses.form.sentence(false)),
			'[payer] hat [amount] für [what] bezahlt'
		);
	});
});
