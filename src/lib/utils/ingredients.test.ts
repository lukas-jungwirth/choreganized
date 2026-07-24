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
	RECIPE_UNITS
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
