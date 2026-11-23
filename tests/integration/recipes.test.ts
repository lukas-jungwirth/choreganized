/**
 * A step's own timer through the recipe service (→ plan 21, DECISIONS #147):
 * written on create, replaced on update, carried by a duplicate, and refused —
 * quietly, as "no timer" — when it isn't one cook mode could run, whoever the
 * caller is (the form reader has its own check; an import may not).
 *
 * And an import's temp photo, thrown away when the person picks another: only
 * a real unclaimed temp, never a recipe's photo named by a forged form field.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	createRecipe,
	discardImportedPhoto,
	duplicateRecipe,
	getRecipe,
	updateRecipe
} from '$lib/server/services/recipes';
import { addRecipeIngredients, buildIngredientPick } from '$lib/server/services/recipe-shopping';
import { listOpenItems } from '$lib/server/services/shopping';
import { storeRecipePhoto, uploadExists } from '$lib/server/uploads';
import type { RecipeInput } from '$lib/utils/recipes';
import { MAX_TIMER_SECONDS } from '$lib/utils/timer-parse';
import { makeHousehold } from '../helpers/db';

function input(steps: RecipeInput['steps']): RecipeInput {
	return {
		name: 'Pasta',
		timeMinutes: 20,
		servings: 2,
		ingredientLines: ['200 g Nudeln', '1 Prise Salz'],
		steps
	};
}

/**
 * A counting word belongs to the amount (→ plan 42, DECISIONS #313): "2 Zehen
 * Knoblauch" is stored as 2 · Zehen · Knoblauch, so the name that reaches the
 * shopping list, the cupboard and the step matcher is the thing itself.
 */
describe('an ingredient counted in a counting word', () => {
	const lines = [
		'2 Zehen Knoblauch',
		'1 Bund Petersilie (oder TK)',
		'20 dag Extrawurst',
		'Mehl 500g'
	];

	it('is stored as amount, word and a clean name, and survives an edit', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, { ...input([]), ingredientLines: lines });

		const stored = () =>
			getRecipe(householdId, id)!.ingredients.map((row) => [row.quantity, row.unit, row.name]);
		const expected = [
			[2, 'Zehen', 'Knoblauch'],
			[1, 'Bund', 'Petersilie (oder TK)'],
			[200, 'g', 'Extrawurst'],
			[500, 'g', 'Mehl']
		];
		assert.deepEqual(stored(), expected);

		// The editor posts each row back as the line it shows: nothing may drift.
		const shown = [
			'2 Zehen Knoblauch',
			'1 Bund Petersilie (oder TK)',
			'200 g Extrawurst',
			'500 g Mehl'
		];
		updateRecipe(householdId, id, { ...input([]), ingredientLines: shown });
		assert.deepEqual(stored(), expected);
	});

	it('puts the name on the shopping list, not the word', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, { ...input([]), ingredientLines: lines });

		const pick = buildIngredientPick(householdId, id)!;
		assert.deepEqual(
			pick.rows.map((row) => row.name),
			['Knoblauch', 'Petersilie (oder TK)', 'Extrawurst', 'Mehl']
		);

		const ids = pick.rows.map((row) => row.id);
		addRecipeIngredients(householdId, owner.id, {
			recipeId: id,
			chosen: ids,
			offered: ids,
			cookingFor: null
		});

		const garlic = listOpenItems(householdId).find((item) => item.name === 'Knoblauch');
		assert.ok(garlic, 'the list has "Knoblauch", not "Zehen Knoblauch"');
		assert.equal(garlic.quantity, 2);
		assert.equal(garlic.unit, 'Zehen');
	});
});

describe('step timers', () => {
	it('are stored as given, and a step without one reads its text', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(
			householdId,
			owner.id,
			input([
				{ text: 'Wasser aufkochen.', uses: null, timer: null },
				{
					text: 'Nudeln 90 Sekunden kürzer als angegeben kochen.',
					uses: null,
					timer: { seconds: 90, label: 'Nudeln' }
				},
				{ text: 'Abseihen.', uses: null, timer: { seconds: 300, label: null } }
			])
		);

		const steps = getRecipe(householdId, id)!.steps;
		assert.deepEqual(
			steps.map((step) => step.timer),
			[null, { seconds: 90, label: 'Nudeln' }, { seconds: 300, label: null }]
		);
	});

	it('are replaced on update — set, changed, and taken away', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(
			householdId,
			owner.id,
			input([
				{ text: 'Kochen.', uses: null, timer: { seconds: 600, label: 'Nudeln' } },
				{ text: 'Abseihen.', uses: null, timer: null }
			])
		);

		updateRecipe(
			householdId,
			id,
			input([
				{ text: 'Kochen.', uses: null, timer: null },
				{ text: 'Abseihen.', uses: null, timer: { seconds: 60, label: 'Sieb' } }
			])
		);

		assert.deepEqual(
			getRecipe(householdId, id)!.steps.map((step) => step.timer),
			[null, { seconds: 60, label: 'Sieb' }]
		);
	});

	it('travel with a duplicate', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(
			householdId,
			owner.id,
			input([{ text: 'Backen.', uses: null, timer: { seconds: 1500, label: 'Ofen' } }])
		);

		const copy = duplicateRecipe(householdId, owner.id, id)!;
		assert.deepEqual(getRecipe(householdId, copy)!.steps[0].timer, {
			seconds: 1500,
			label: 'Ofen'
		});
	});

	it('are dropped, not saved, when no cook-mode timer could run them', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(
			householdId,
			owner.id,
			input([
				{ text: 'A.', uses: null, timer: { seconds: 0, label: 'Never' } },
				{ text: 'B.', uses: null, timer: { seconds: MAX_TIMER_SECONDS + 1, label: null } },
				{ text: 'C.', uses: null, timer: { seconds: Number.NaN, label: null } },
				{ text: 'D.', uses: null, timer: { seconds: 89.6, label: '  Reis  ' } }
			])
		);

		assert.deepEqual(
			getRecipe(householdId, id)!.steps.map((step) => step.timer),
			[null, null, null, { seconds: 90, label: 'Reis' }]
		);
	});
});

describe('discardImportedPhoto', () => {
	it('deletes an unclaimed import temp', () => {
		const temp = storeRecipePhoto(Buffer.from('webp'));
		discardImportedPhoto(temp);
		assert.equal(uploadExists(temp), false);
	});

	it('leaves a recipe’s own photo alone, whatever the form claims', () => {
		const { householdId, owner } = makeHousehold();
		const photo = storeRecipePhoto(Buffer.from('webp'));
		createRecipe(householdId, owner.id, input([]), photo);

		discardImportedPhoto(photo);
		assert.equal(uploadExists(photo), true);
	});
});
