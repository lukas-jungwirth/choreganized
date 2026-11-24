/**
 * Cook mode's list under a step, its text size and its ticks (→ plan 47).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { scaleIngredients } from './ingredients';
import { renderStep } from './step-links';
import {
	readTicks,
	showsParts,
	stepIngredientLines,
	stepTextSize,
	tickKey,
	TICKS_KEEP_MS
} from './cook';

describe('tickKey', () => {
	it('survives a save that writes the rows anew, and tells two parts apart', () => {
		const before = { id: 'old', name: 'Salz', section: 'Bolognese' };
		const after = { id: 'new', name: 'Salz ', section: 'Bolognese' };
		assert.equal(tickKey(before), tickKey(after));
		assert.notEqual(tickKey(before), tickKey({ name: 'Salz', section: 'Béchamel' }));
		assert.notEqual(tickKey({ name: 'Salz', section: null }), tickKey(before));
	});
});

const row = (
	id: string,
	name: string,
	quantity: number | null,
	unit: string | null = null,
	note: string | null = null
) => ({ id, name, quantity, unit, note, section: null });

describe('stepTextSize', () => {
	it('keeps a short step large and steps down as it grows', () => {
		assert.equal(stepTextSize('Im Ofen bei 180 °C etwa 40 Min. backen.'), 'large');
		assert.equal(stepTextSize('x'.repeat(100)), 'large');
		assert.equal(stepTextSize('x'.repeat(101)), 'medium');
		assert.equal(stepTextSize('x'.repeat(220)), 'medium');
		assert.equal(stepTextSize('x'.repeat(221)), 'small');
		assert.equal(stepTextSize('x'.repeat(320)), 'small');
		assert.equal(stepTextSize('x'.repeat(400)), 'smallest');
	});

	it('goes one size down while a timer ring takes the lower half', () => {
		assert.equal(stepTextSize('x'.repeat(50), true), 'medium');
		assert.equal(stepTextSize('x'.repeat(150), true), 'small');
		assert.equal(stepTextSize('x'.repeat(400), true), 'smallest');
	});

	it('counts characters, not UTF-16 units, and ignores the edges', () => {
		assert.equal(stepTextSize(`  ${'ä'.repeat(100)}  `), 'large');
		assert.equal(stepTextSize('🍅'.repeat(100)), 'large');
	});
});

describe('stepIngredientLines', () => {
	const milch = row('milch', 'Milch', 0.5, 'L');
	const muskat = row('muskat', 'Muskatnuss', 1, 'Msp.', 'frisch gerieben');
	const salz = row('salz', 'Salz', null);
	const pfeffer = row('pfeffer', 'Pfeffer', null);

	it('gives each ingredient its amount and note, the amount-less ones one last line', () => {
		const list = [milch, salz, muskat, pfeffer];
		const lines = stepIngredientLines(list, list);

		assert.deepEqual(
			lines.map((line) => [line.names, line.quantity, line.unit, line.note, line.total]),
			[
				[['Milch'], 0.5, 'L', null, null],
				[['Muskatnuss'], 1, 'Msp.', 'frisch gerieben', null],
				[['Salz', 'Pfeffer'], null, null, null, null]
			]
		);
	});

	it('keeps an amount-less row with a note on its own line', () => {
		const butter = row('form', 'Butter', null, null, 'für die Form');
		const lines = stepIngredientLines([butter, salz], [butter, salz]);
		assert.deepEqual(
			lines.map((line) => [line.names, line.note]),
			[
				[['Butter'], 'für die Form'],
				[['Salz'], null]
			]
		);
	});

	it('says the whole when the step takes a share, and twice both for twice as many', () => {
		const butter = row('butter', 'Butter', 400, 'g');
		const share = { ...butter, quantity: 200 };

		const [line] = stepIngredientLines([share], [butter]);
		assert.equal(line.quantity, 200);
		assert.deepEqual(line.total, { quantity: 400, unit: 'g' });

		const [doubled] = stepIngredientLines(
			scaleIngredients([share], 2),
			scaleIngredients([butter], 2)
		);
		assert.equal(doubled.quantity, 400);
		assert.deepEqual(doubled.total, { quantity: 800, unit: 'g' });
	});

	it('scales with the list, from a step with stored links', () => {
		const ingredients = scaleIngredients([milch, muskat, salz], 2);
		const drawn = renderStep(
			{
				text: 'Milch in 3 - 4 Portionen zugeben. Mit Salz und Muskat abschmecken.',
				uses: [
					{ ingredientId: 'milch', quantity: null, phrase: 'Milch', amountPhrase: null },
					{ ingredientId: 'salz', quantity: null, phrase: 'Salz', amountPhrase: null },
					{ ingredientId: 'muskat', quantity: null, phrase: 'Muskat', amountPhrase: null }
				]
			},
			ingredients,
			2
		);
		const lines = stepIngredientLines(drawn.used, ingredients);
		assert.deepEqual(
			lines.map((line) => [line.names.join(' · '), line.quantity, line.unit]),
			[
				['Milch', 1, 'L'],
				['Muskatnuss', 2, 'Msp.'],
				['Salz', null, null]
			]
		);
	});

	it('reads an old step through the matcher and shows the same list', () => {
		const ingredients = [row('pasta', 'Pasta', 400, 'g'), row('mush', 'Mushrooms', 250, 'g')];
		const drawn = renderStep(
			{ text: 'Boil the pasta. Fry the mushrooms.', uses: null },
			ingredients,
			1
		);
		assert.deepEqual(
			stepIngredientLines(drawn.used, ingredients).map((line) => line.names[0]),
			['Pasta', 'Mushrooms']
		);
	});
});

describe('showsParts', () => {
	it('names parts only when there are two or more', () => {
		assert.equal(showsParts([{ section: 'Bolognese' }, { section: 'Bolognese' }]), false);
		assert.equal(showsParts([{ section: null }, { section: null }]), false);
		assert.equal(showsParts([{ section: 'Bolognese' }, { section: 'Béchamel' }]), true);
		assert.equal(showsParts([{ section: null }, { section: 'Béchamel' }]), true);
	});
});

describe('readTicks', () => {
	const now = 1_800_000_000_000;

	it('keeps the ticks of this cook', () => {
		assert.deepEqual(readTicks(JSON.stringify({ at: now - 60_000, ids: ['a', 'b'] }), now), [
			'a',
			'b'
		]);
	});

	it('drops a cook that is over, and anything it cannot read', () => {
		assert.deepEqual(
			readTicks(JSON.stringify({ at: now - TICKS_KEEP_MS - 1, ids: ['a'] }), now),
			[]
		);
		assert.deepEqual(readTicks('not json', now), []);
		assert.deepEqual(readTicks(null, now), []);
		assert.deepEqual(readTicks(JSON.stringify({ ids: ['a'] }), now), []);
		assert.deepEqual(readTicks(JSON.stringify({ at: now, ids: ['a', 3] }), now), ['a']);
	});
});
