/**
 * A step's own timer through the recipe service (→ plan 21, DECISIONS #147):
 * written on create, replaced on update, carried by a duplicate, and refused —
 * quietly, as "no timer" — when it isn't one cook mode could run, whoever the
 * caller is (the form reader has its own check; an import may not).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	createRecipe,
	duplicateRecipe,
	getRecipe,
	updateRecipe
} from '$lib/server/services/recipes';
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
