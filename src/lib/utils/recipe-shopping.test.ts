/**
 * A recipe's rows as the shopping list receives them (→ plan 43, DECISIONS #313).
 * The picker and the submit both run this, so these are the sheet's promises.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { shoppingAmount, shoppingLines } from './recipe-shopping';

describe('shoppingAmount', () => {
	it('keeps the units a list shops in', () => {
		assert.deepEqual(shoppingAmount(500, 'g'), { quantity: 500, unit: 'g' });
		assert.deepEqual(shoppingAmount(2, null), { quantity: 2, unit: null });
		assert.deepEqual(shoppingAmount(1, 'pack'), { quantity: 1, unit: 'pack' });
	});

	it('turns a container into a pack with its number', () => {
		assert.deepEqual(shoppingAmount(1, 'Dose'), { quantity: 1, unit: 'pack' });
		assert.deepEqual(shoppingAmount(2, 'Becher'), { quantity: 2, unit: 'pack' });
		assert.deepEqual(shoppingAmount(3, 'jars'), { quantity: 3, unit: 'pack' });
	});

	it('puts the name alone for any other counting word, and for spoons', () => {
		for (const unit of ['Zehen', 'Bund', 'Prise', 'Msp.', 'tbsp', 'tsp', 'EL']) {
			assert.deepEqual(shoppingAmount(2, unit), { quantity: null, unit: null }, unit);
		}
	});
});

describe('shoppingLines', () => {
	const row = (
		id: string,
		name: string,
		quantity: number | null,
		unit: string | null,
		section: string | null = null
	) => ({ id, name, quantity, unit, section });

	it('gathers one name from two parts into one line, the amounts added', () => {
		const lines = shoppingLines([
			row('a', 'Butter', 30, 'g', 'Bolognese'),
			row('b', 'Mehl', 40, 'g', 'Béchamel'),
			row('c', 'butter', 50, 'g', 'Béchamel')
		]);
		assert.deepEqual(
			lines.map((line) => [line.id, line.ids, line.name, line.quantity, line.unit, line.parts]),
			[
				['a', ['a', 'c'], 'Butter', 80, 'g', ['Bolognese', 'Béchamel']],
				['b', ['b'], 'Mehl', 40, 'g', ['Béchamel']]
			]
		);
	});

	it('keeps the first amount when two cannot be added', () => {
		const [line] = shoppingLines([row('a', 'Butter', 30, 'g'), row('b', 'Butter', 1, null)]);
		assert.equal(line.quantity, 30);
		assert.equal(line.unit, 'g');
	});

	it('never lets a row taken by name alone erase an amount, whatever the order', () => {
		const spoonFirst = shoppingLines([
			row('a', 'Butter', 2, 'tbsp'),
			row('b', 'Butter', 30, 'g'),
			row('c', 'Butter', 50, 'g')
		]);
		const spoonLast = shoppingLines([
			row('b', 'Butter', 30, 'g'),
			row('c', 'Butter', 50, 'g'),
			row('a', 'Butter', 2, 'tbsp')
		]);
		for (const [line] of [spoonFirst, spoonLast]) {
			assert.equal(line.quantity, 80);
			assert.equal(line.unit, 'g');
		}
		assert.deepEqual(spoonFirst[0].ids, ['a', 'b', 'c']);
	});

	it('names no parts for a recipe without any', () => {
		assert.deepEqual(shoppingLines([row('a', 'Salz', null, null)])[0].parts, []);
	});
});
