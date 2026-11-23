/**
 * The household's own units (→ plan 44, DECISIONS #321, `services/units.ts`):
 * a word added on purpose is read as a unit by the household's saves, and by
 * nobody else's.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createRecipe, getRecipe } from '$lib/server/services/recipes';
import {
	addUnit,
	knownUnitWords,
	listUnits,
	removeUnit,
	UnitError
} from '$lib/server/services/units';
import { makeHousehold } from '../helpers/db';

const ring = {
	name: 'Wurstsalat',
	timeMinutes: null,
	servings: 2,
	ingredientLines: ['2 Ringe Fleischwurst'],
	steps: []
};

describe('household units', () => {
	it('adds a word once, however it is written, and lists it', () => {
		const { householdId, owner } = makeHousehold();
		const added = addUnit(householdId, owner.id, ' Ring ');
		assert.equal(added.word, 'Ring');
		assert.throws(
			() => addUnit(householdId, owner.id, 'RING'),
			(cause: unknown) => cause instanceof UnitError && cause.code === 'known'
		);
		assert.deepEqual(
			listUnits(householdId).map((unit) => unit.word),
			['Ring']
		);
		assert.deepEqual([...knownUnitWords(householdId)], ['ring']);
	});

	it('refuses a unit or counting word the reader knows, and what is no word', () => {
		const { householdId, owner } = makeHousehold();
		for (const word of ['g', 'EL', 'Zehe', 'Dose']) {
			assert.throws(
				() => addUnit(householdId, owner.id, word),
				(cause: unknown) => cause instanceof UnitError && cause.code === 'known',
				word
			);
		}
		for (const word of ['', '2', 'g/ml', 'x'.repeat(21)]) {
			assert.throws(
				() => addUnit(householdId, owner.id, word),
				(cause: unknown) => cause instanceof UnitError && cause.code === 'invalid',
				word
			);
		}
	});

	it('reads "2 Ringe Fleischwurst" with the Ring in this household only', () => {
		const ours = makeHousehold();
		const theirs = makeHousehold();
		addUnit(ours.householdId, ours.owner.id, 'Ring');

		const mine = getRecipe(
			ours.householdId,
			createRecipe(ours.householdId, ours.owner.id, ring, null)
		);
		assert.deepEqual(
			mine?.ingredients.map(({ quantity, unit, name }) => ({ quantity, unit, name })),
			[{ quantity: 2, unit: 'Ringe', name: 'Fleischwurst' }]
		);

		const other = getRecipe(
			theirs.householdId,
			createRecipe(theirs.householdId, theirs.owner.id, ring, null)
		);
		assert.equal(other?.ingredients[0].name, 'Ringe Fleischwurst');
	});

	it('removes a word only inside its household', () => {
		const ours = makeHousehold();
		const theirs = makeHousehold();
		const added = addUnit(ours.householdId, ours.owner.id, 'Kugel');
		assert.equal(removeUnit(theirs.householdId, added.id), false);
		assert.equal(removeUnit(ours.householdId, added.id), true);
		assert.deepEqual(listUnits(ours.householdId), []);
	});
});
