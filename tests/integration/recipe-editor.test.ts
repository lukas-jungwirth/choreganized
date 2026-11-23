/**
 * The rebuilt recipe editor (→ plan 46) against the real service: what the
 * editor posts for a recipe it opened is read by `readRecipeForm` and saved by
 * `updateRecipe`, and saving again changes nothing. A recipe from before (a
 * step nobody linked) is saved with stored links, and nothing it had is lost.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { catalog } from '$lib/i18n';
import {
	createRecipe,
	getRecipe,
	updateRecipe,
	type RecipeDetail
} from '$lib/server/services/recipes';
import { addUnit, removeUnit, unitSpellings } from '$lib/server/services/units';
import { unitWordKey } from '$lib/utils/amounts';
import { fromRecipe, keyMaker, postedFields } from '$lib/utils/recipe-editor';
import { readRecipeForm, type RecipeInput } from '$lib/utils/recipes';
import { ruleRow } from '$lib/utils/rule-draft';
import { makeHousehold } from '../helpers/db';

const m = catalog('en');

/** Open the recipe in the editor and press Save without changing a thing. */
function openAndSave(householdId: string, recipe: RecipeDetail): RecipeDetail {
	const known = new Set(unitSpellings(householdId).keys());
	const form = new FormData();
	form.set('name', recipe.name);
	form.set('servings', String(recipe.servings ?? ''));
	for (const [name, value] of postedFields(fromRecipe(recipe, keyMaker()), known)) {
		form.append(name, value);
	}
	const read = readRecipeForm(form, m);
	assert.ok('input' in read);
	assert.ok(updateRecipe(householdId, recipe.id, read.input));
	const saved = getRecipe(householdId, recipe.id);
	assert.ok(saved);
	return saved;
}

/** A recipe without its ids, which a save mints anew: what a person sees. */
function shape(recipe: RecipeDetail) {
	const position = new Map(recipe.ingredients.map((row, at) => [row.id, at]));
	return {
		ingredients: recipe.ingredients.map(({ id: _, ...row }) => row),
		steps: recipe.steps.map(({ id: _, uses, ...step }) => ({
			...step,
			uses: uses?.map(({ ingredientId, ...use }) => ({ ...use, at: position.get(ingredientId) }))
		}))
	};
}

const old: RecipeInput = {
	name: 'Gemüsepfanne',
	timeMinutes: 30,
	servings: 2,
	ingredientLines: ['400 g Karotten', '2 Zehen Knoblauch', '1 Zwiebel', '2 EL Olivenöl'],
	ingredientDetails: [
		{ note: 'geschält', section: null },
		{ note: null, section: null },
		{ note: null, section: 'Sauce' },
		{ note: null, section: 'Sauce' }
	],
	steps: [
		// Written before plan 43: nobody linked it, cook mode reads its words.
		{ text: '200 g Karotten in Scheiben schneiden.', uses: null, timer: null },
		{
			text: 'Die Zwiebelwürfel in 2 EL Olivenöl anbraten.',
			uses: [
				{ ingredient: 2, quantity: null, phrase: 'Zwiebelwürfel', amountPhrase: null },
				{ ingredient: 3, quantity: null, phrase: 'Olivenöl', amountPhrase: '2 EL' }
			],
			timer: { seconds: 300, label: 'Anbraten' },
			section: 'Sauce'
		},
		// Pinned by hand in the old editor: a link without words.
		{
			text: 'Knoblauch dazu.',
			uses: [{ ingredient: 1, quantity: null }],
			timer: null,
			section: 'Sauce'
		}
	]
};

describe('opening and saving in the editor', () => {
	it('saves an old step’s matcher reading as stored links, amount and share included', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, old);
		const saved = openAndSave(householdId, getRecipe(householdId, id)!);

		assert.deepEqual(saved.steps[0].uses, [
			{
				ingredientId: saved.ingredients[0].id,
				quantity: 200,
				phrase: 'Karotten',
				amountPhrase: '200 g'
			}
		]);
	});

	it('loses nothing a recipe had: notes, parts, links with and without words, timers', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, old);
		const before = getRecipe(householdId, id)!;
		const after = openAndSave(householdId, before);

		const was = shape(before);
		const now = shape(after);
		assert.deepEqual(now.ingredients, [
			{ ...was.ingredients[0] },
			// A counting word is stored in its one form (→ DECISIONS #324).
			{ ...was.ingredients[1], unit: 'Zehe' },
			{ ...was.ingredients[2] },
			{ ...was.ingredients[3] }
		]);
		assert.deepEqual(now.steps.slice(1), was.steps.slice(1));
	});

	it('changes nothing when saved again', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, old);
		const once = openAndSave(householdId, getRecipe(householdId, id)!);
		const twice = openAndSave(householdId, once);
		assert.deepEqual(shape(twice), shape(once));
	});
});

describe('units in the editor', () => {
	it('stores a unit in its one form: the eight by key, a counting word singular', () => {
		const { householdId, owner } = makeHousehold();
		const form = new FormData();
		form.set('name', 'Knoblauchbrot');
		for (const [name, value] of [
			['ingredientName', 'Knoblauch'],
			['ingredientQuantity', '2'],
			['ingredientUnit', 'Zehen'],
			['ingredientName', 'Öl'],
			['ingredientQuantity', '1,5'],
			['ingredientUnit', 'EL'],
			['ingredientName', 'Salz'],
			['ingredientQuantity', ''],
			['ingredientUnit', 'Prise']
		]) {
			form.append(name, value);
		}
		const read = readRecipeForm(form, m);
		assert.ok('input' in read);
		const id = createRecipe(householdId, owner.id, read.input);
		const rows = getRecipe(householdId, id)!.ingredients;
		assert.deepEqual(
			rows.map(({ name, quantity, unit }) => [name, quantity, unit]),
			[
				['Knoblauch', 2, 'Zehe'],
				['Öl', 1.5, 'tbsp'],
				// A unit measures a quantity: no number, no unit.
				['Salz', null, null]
			]
		);
	});

	it('reads "2 Kugel Mozzarella" with Kugel for the household that added it, only', () => {
		const added = makeHousehold();
		const other = makeHousehold();
		addUnit(added.householdId, added.owner.id, 'Kugel');
		const known = (householdId: string) =>
			new Set([...unitSpellings(householdId).keys()].map(unitWordKey));

		assert.deepEqual(ruleRow('2 Kugel Mozzarella', known(added.householdId)), {
			quantity: 2,
			unit: 'Kugel',
			name: 'Mozzarella',
			note: null
		});
		assert.deepEqual(ruleRow('2 Kugel Mozzarella', known(other.householdId)), {
			quantity: 2,
			unit: null,
			name: 'Kugel Mozzarella',
			note: null
		});
		assert.deepEqual(ruleRow('500 rote Zwiebeln', known(other.householdId)), {
			quantity: 500,
			unit: null,
			name: 'rote Zwiebeln',
			note: null
		});
		assert.deepEqual(ruleRow('Salz 2 Prisen fein', known(other.householdId)), {
			quantity: null,
			unit: null,
			name: 'Salz 2 Prisen fein',
			note: null
		});
		assert.deepEqual(ruleRow('1 Karotte, in Scheiben geschnitten'), {
			quantity: 1,
			unit: null,
			name: 'Karotte',
			note: 'in Scheiben geschnitten'
		});
	});

	it('keeps a removed household word on the rows that use it', () => {
		const { householdId, owner } = makeHousehold();
		const kugel = addUnit(householdId, owner.id, 'Kugel');
		const id = createRecipe(householdId, owner.id, {
			name: 'Caprese',
			timeMinutes: null,
			servings: 2,
			ingredientLines: ['2 Kugel Mozzarella'],
			steps: []
		});
		removeUnit(householdId, kugel.id);
		const saved = openAndSave(householdId, getRecipe(householdId, id)!);
		assert.deepEqual(
			saved.ingredients.map(({ name, quantity, unit }) => [name, quantity, unit]),
			[['Mozzarella', 2, 'Kugel']]
		);
	});
});
