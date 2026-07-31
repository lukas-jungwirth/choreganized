/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 *
 * `parseIngredient` and `formatIngredient` have always claimed to be inverses,
 * and the recipe form leaned on that once a save: read the stored row out as a
 * line, take the line back in unchanged. The ingredient sheet [3c] now runs that
 * round trip on **every edit**, and it runs it through the *labels* — it writes
 * "2 EL Öl" and the server reads the "EL" back through `UNIT_ALIASES`
 * (→ DECISIONS #97, #101). That coupling is what this file guards: a ninth unit,
 * or a German label nobody aliased, would silently store the wrong thing.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	composeIngredientLine,
	formatIngredient,
	parseIngredient,
	RECIPE_UNITS,
	scaleIngredients,
	servingsFactor
} from './ingredients.ts';

describe('formatIngredient → parseIngredient', () => {
	it('reads every label the app shows back to the unit it labels', () => {
		// The two `UNITS` maps at the top of en.ts and de.ts, copied rather than
		// imported: `$lib` doesn't resolve under `node --test`. A ninth unit added
		// without an alias still fails here — the copy misses the label,
		// `unitLabel` falls back to the canonical spelling, which has no alias.
		const en = {
			pcs: 'pcs',
			g: 'g',
			kg: 'kg',
			ml: 'ml',
			L: 'L',
			pack: 'pack',
			tbsp: 'tbsp',
			tsp: 'tsp'
		};
		const de = {
			pcs: 'Stk.',
			g: 'g',
			kg: 'kg',
			ml: 'ml',
			L: 'l',
			pack: 'Pck.',
			tbsp: 'EL',
			tsp: 'TL'
		};

		for (const labels of [en, de]) {
			for (const unit of RECIPE_UNITS) {
				const line = formatIngredient({ quantity: 2, unit, name: 'Öl' }, labels);
				assert.deepEqual(parseIngredient(line), { quantity: 2, unit, name: 'Öl' }, line);
			}
		}
	});

	it('keeps a fraction as the glyph it was typed as', () => {
		assert.equal(formatIngredient({ quantity: 0.5, unit: 'tsp', name: 'salt' }, {}), '½ tsp salt');
	});

	it('reads the amounts the sheet now lets you type', () => {
		const written = [
			['1 1/2', 1.5],
			['1,5', 1.5],
			['½', 0.5],
			['0.5', 0.5]
		] as const;

		for (const [text, quantity] of written) {
			assert.equal(parseIngredient(`${text} L milk`)?.quantity, quantity, text);
		}
	});

	it('drops a unit that measures nothing', () => {
		assert.deepEqual(parseIngredient('g flour'), { quantity: null, unit: null, name: 'g flour' });
	});
});

describe('composeIngredientLine', () => {
	it('writes a line the parser reads back the same way', () => {
		const { line, reading } = composeIngredientLine('pasta', '400', 'g');

		assert.equal(line, '400 g pasta');
		assert.deepEqual(reading, { quantity: 400, unit: 'g', name: 'pasta' });
	});

	it('leaves out the parts that were not filled in', () => {
		assert.equal(composeIngredientLine('salt', '', '').line, 'salt');
		assert.equal(composeIngredientLine('eggs', '2', '').line, '2 eggs');
	});

	it('reports the reading a name it cannot escape will get', () => {
		// Not a bug to fix — a limit to show (→ DECISIONS #101). The sheet prints
		// each of these under the fields before anything is committed.
		assert.deepEqual(composeIngredientLine('Nudeln', '1', 'Packung').reading, {
			quantity: 1,
			unit: 'pack',
			name: 'Nudeln'
		});
		assert.deepEqual(composeIngredientLine('Packung Nudeln', '1', '').reading, {
			quantity: 1,
			unit: 'pack',
			name: 'Nudeln'
		});
		assert.deepEqual(composeIngredientLine('7up', '', '').reading, {
			quantity: 7,
			unit: null,
			name: 'up'
		});
	});
});

describe('servingsFactor', () => {
	it('is the ratio of what you are cooking to what it was written for', () => {
		assert.equal(servingsFactor(4, 6), 1.5);
		assert.equal(servingsFactor(4, 2), 0.5);
		assert.equal(servingsFactor(4, 4), 1);
	});

	it('is 1 when there is nothing to scale from', () => {
		// Half of an unknown is unknown — the screens hide the control instead.
		assert.equal(servingsFactor(null, 6), 1);
		assert.equal(servingsFactor(0, 6), 1);
	});

	it('is 1 for a number of people nobody can cook for', () => {
		assert.equal(servingsFactor(4, 0), 1);
		assert.equal(servingsFactor(4, -2), 1);
		assert.equal(servingsFactor(4, Number.NaN), 1);
	});
});

describe('scaleIngredients', () => {
	const RECIPE = [
		{ name: 'Pasta', quantity: 400, unit: 'g' },
		{ name: 'Cream', quantity: 200, unit: 'ml' },
		{ name: 'Salt', quantity: null, unit: null }
	];

	it('writes the amounts out for the new number of people', () => {
		assert.deepEqual(scaleIngredients(RECIPE, servingsFactor(4, 6)), [
			{ name: 'Pasta', quantity: 600, unit: 'g' },
			{ name: 'Cream', quantity: 300, unit: 'ml' },
			// No number in it to multiply — "Salt" is still "Salt" for six.
			{ name: 'Salt', quantity: null, unit: null }
		]);
	});

	it('leaves names and units alone', () => {
		const [pasta] = scaleIngredients(RECIPE, 0.5);
		assert.equal(pasta.name, 'Pasta');
		assert.equal(pasta.unit, 'g');
		assert.equal(pasta.quantity, 200);
	});

	it('hands back the same rows when there is nothing to do', () => {
		assert.equal(scaleIngredients(RECIPE, 1), RECIPE);
	});

	it('keeps the fraction where the fraction is the amount', () => {
		// Two thirds of an egg, half a teaspoon — these are instructions.
		const [egg] = scaleIngredients([{ quantity: 1, unit: 'pcs' }], servingsFactor(3, 2));
		assert.equal(egg.quantity, 0.67);

		const [tsp] = scaleIngredients([{ quantity: 1, unit: 'tsp' }], servingsFactor(4, 6));
		assert.equal(tsp.quantity, 1.5);
	});

	it('rounds a weight to something a scale can weigh', () => {
		// "187½ g mushrooms" is precision no kitchen has; 188 g is what you'd do.
		const [mushrooms] = scaleIngredients([{ quantity: 250, unit: 'g' }], servingsFactor(4, 3));
		assert.equal(mushrooms.quantity, 188);

		const [butter] = scaleIngredients([{ quantity: 30, unit: 'g' }], servingsFactor(4, 3));
		assert.equal(butter.quantity, 23);
	});

	it('never rounds an amount away to nothing', () => {
		// 0.0025 would store as null, and a row that loses its amount reads as
		// "some", which is a different instruction than "a very little".
		const [pinch] = scaleIngredients([{ quantity: 0.01, unit: 'tsp' }], 0.25);
		assert.equal(pinch.quantity, 0.01);
	});

	it('does not invent an amount for a line that never had one', () => {
		const [salt] = scaleIngredients([{ quantity: null, unit: null }], 4);
		assert.equal(salt.quantity, null);
	});
});
