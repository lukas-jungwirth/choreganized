/**
 * Recipes with parts, notes and stored links (→ plan 43, DECISIONS #312–#314):
 * through the service and the form reader, onto the shopping list, and through
 * the migration that added them.
 */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { describe, it } from 'vitest';
import { catalog } from '$lib/i18n';
import { addRecipeIngredients, buildIngredientPick } from '$lib/server/services/recipe-shopping';
import {
	createRecipe,
	duplicateRecipe,
	getRecipe,
	updateRecipe
} from '$lib/server/services/recipes';
import { listOpenItems } from '$lib/server/services/shopping';
import { readRecipeForm, recipeShareText, type RecipeInput } from '$lib/utils/recipes';
import { makeHousehold } from '../helpers/db';

const m = catalog('en');

/** A small two-part lasagne, as plan 44's import would write it. */
function lasagne(): RecipeInput {
	return {
		name: 'Lasagne',
		timeMinutes: 100,
		servings: 4,
		ingredientLines: [
			'1 Zwiebel',
			'1 - 2 EL Olivenöl',
			'500 g Faschiertes',
			'1 Dose Tomaten',
			'2 Zehen Knoblauch',
			'30 g Butter',
			'40 g Mehl',
			'50 g Butter'
		],
		ingredientDetails: [
			{ note: null, section: 'Bolognese' },
			{ note: null, section: 'Bolognese' },
			{ note: 'gemischt', section: 'Bolognese' },
			{ note: 'geschält, 800 g', section: 'Bolognese' },
			{ note: null, section: 'Bolognese' },
			{ note: null, section: 'Béchamel' },
			{ note: null, section: 'Béchamel' },
			{ note: 'für die Form', section: 'Béchamel' }
		],
		steps: [
			{
				text: 'Zwiebel schälen und fein würfeln. 1 - 2 EL Olivenöl erhitzen, die Zwiebelwürfel anschwitzen.',
				uses: [
					{ ingredient: 0, quantity: null, phrase: 'Zwiebel', amountPhrase: null },
					{ ingredient: 0, quantity: null, phrase: 'Zwiebelwürfel', amountPhrase: null },
					{ ingredient: 1, quantity: null, phrase: 'Olivenöl', amountPhrase: '1 - 2 EL' }
				],
				timer: null,
				section: 'Bolognese'
			},
			{
				text: 'Restliche Zutaten unterheben.',
				uses: [{ ingredient: 2, quantity: null, phrase: null, amountPhrase: null }],
				timer: null,
				section: 'Bolognese'
			},
			{ text: 'Butter schmelzen, Mehl einrühren.', uses: null, timer: null, section: 'Béchamel' }
		]
	};
}

describe('a recipe with parts, notes and links', () => {
	it('round-trips every note, part, phrase and amount phrase', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, lasagne());
		const recipe = getRecipe(householdId, id)!;

		const hack = recipe.ingredients[2];
		assert.equal(hack.name, 'Faschiertes');
		assert.equal(hack.note, 'gemischt');
		assert.equal(hack.section, 'Bolognese');
		assert.equal(recipe.ingredients[0].note, null);
		assert.deepEqual(
			recipe.steps.map((step) => step.section),
			['Bolognese', 'Bolognese', 'Béchamel']
		);

		const [first, second, third] = recipe.steps;
		const zwiebel = recipe.ingredients[0].id;
		// One ingredient named by two phrases in one step.
		assert.deepEqual(
			first.uses?.map((use) => [use.ingredientId, use.phrase, use.amountPhrase]),
			[
				[zwiebel, 'Zwiebel', null],
				[zwiebel, 'Zwiebelwürfel', null],
				[recipe.ingredients[1].id, 'Olivenöl', '1 - 2 EL']
			]
		);
		assert.deepEqual(
			second.uses?.map((use) => use.phrase),
			[null]
		);
		assert.equal(third.uses, null);
	});

	it('survives an edit in the old editor, through its hidden fields', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, lasagne());
		const before = getRecipe(householdId, id)!;

		// What `RecipeForm` posts for this recipe, untouched.
		const form = new FormData();
		form.set('name', before.name);
		form.set('servings', '4');
		for (const row of before.ingredients) {
			form.append('ingredient', m.units.ingredient(row));
			form.append('ingredientNote', row.note ?? '');
			form.append('ingredientSection', row.section ?? '');
		}
		const index = new Map(before.ingredients.map((row, at) => [row.id, at]));
		for (const step of before.steps) {
			form.append('step', step.text);
			form.append(
				'stepUses',
				step.uses
					? JSON.stringify(
							step.uses.map((use) => ({
								ingredient: index.get(use.ingredientId),
								quantity: use.quantity,
								phrase: use.phrase,
								amountPhrase: use.amountPhrase
							}))
						)
					: ''
			);
			form.append('stepTimer', '');
			form.append('stepSection', step.section ?? '');
		}

		const read = readRecipeForm(form, m);
		assert.ok('input' in read);
		updateRecipe(householdId, id, read.input);

		const strip = (recipe: NonNullable<ReturnType<typeof getRecipe>>) => ({
			ingredients: recipe.ingredients.map(({ id: _, ...row }) => row),
			steps: recipe.steps.map((step) => ({
				text: step.text,
				section: step.section,
				uses: step.uses?.map((use) => [
					recipe.ingredients.findIndex((row) => row.id === use.ingredientId),
					use.phrase,
					use.amountPhrase
				])
			}))
		});
		assert.deepEqual(strip(getRecipe(householdId, id)!), strip(before));
	});

	it('clamps what a hand-rolled POST sends', () => {
		const form = new FormData();
		form.set('name', 'X');
		form.append('ingredient', '1 Zwiebel');
		form.append('ingredientNote', `  ${'n'.repeat(200)}  `);
		form.append('ingredientSection', '   ');
		form.append('step', 'Zwiebel würfeln.');
		form.append(
			'stepUses',
			JSON.stringify([{ ingredient: 0, quantity: null, phrase: 7, amountPhrase: 'x'.repeat(99) }])
		);
		form.append('stepTimer', '');
		form.append('stepSection', 's'.repeat(99));

		const read = readRecipeForm(form, m);
		assert.ok('input' in read);
		assert.equal(read.input.ingredientDetails?.[0]?.note?.length, 120);
		assert.equal(read.input.ingredientDetails?.[0]?.section, null);
		assert.equal(read.input.steps[0].section?.length, 40);
		assert.equal(read.input.steps[0].uses?.[0].phrase, null);
		assert.equal(read.input.steps[0].uses?.[0].amountPhrase?.length, 30);
	});

	it('is carried whole by a duplicate', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, lasagne());
		const copy = getRecipe(householdId, duplicateRecipe(householdId, owner.id, id)!)!;

		assert.equal(copy.ingredients[2].note, 'gemischt');
		assert.equal(copy.ingredients[5].section, 'Béchamel');
		assert.equal(copy.steps[2].section, 'Béchamel');
		assert.equal(copy.steps[0].uses?.[1].phrase, 'Zwiebelwürfel');
		assert.equal(copy.steps[0].uses?.[1].ingredientId, copy.ingredients[0].id);
		assert.equal(copy.steps[0].uses?.[2].amountPhrase, '1 - 2 EL');
	});

	it('stays in its household', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const id = createRecipe(a.householdId, a.owner.id, lasagne());

		assert.equal(getRecipe(b.householdId, id), null);
		assert.equal(updateRecipe(b.householdId, id, { ...lasagne(), ingredientDetails: [] }), false);
		assert.equal(getRecipe(a.householdId, id)!.ingredients[2].note, 'gemischt');
	});
});

describe('the shared text of a recipe with parts', () => {
	it('heads each part, keeps each note, and numbers the steps straight through', () => {
		const { householdId, owner } = makeHousehold();
		const recipe = getRecipe(householdId, createRecipe(householdId, owner.id, lasagne()))!;

		const text = recipeShareText(recipe, m);
		assert.match(text, /Ingredients\nBolognese\n• 1 Zwiebel\n/);
		assert.match(text, /• 500 g Faschiertes, gemischt\n/);
		assert.match(text, /\nBéchamel\n• 30 g Butter\n/);
		assert.match(text, /• 50 g Butter, für die Form$/m);
		assert.match(text, /Steps\nBolognese\n1\. Zwiebel schälen/);
		assert.match(text, /\nBéchamel\n3\. Butter schmelzen, Mehl einrühren\.$/);
	});

	it('reads as before for a recipe without parts or notes', () => {
		const text = recipeShareText(
			{
				name: 'Toast',
				timeMinutes: null,
				servings: null,
				ingredients: [{ name: 'Brot', quantity: 2, unit: null }],
				steps: [{ text: 'Toasten.' }]
			},
			m
		);
		assert.equal(text, 'Toast\n\nIngredients\n• 2 Brot\n\nSteps\n1. Toasten.');
	});
});

describe('a recipe with parts on the way to the shopping list', () => {
	function pourAll(householdId: string, memberId: string, recipeId: string) {
		const pick = buildIngredientPick(householdId, recipeId)!;
		const ids = pick.rows.map((row) => row.id);
		addRecipeIngredients(householdId, memberId, {
			recipeId,
			chosen: ids,
			offered: ids,
			cookingFor: null
		});
		return pick;
	}

	it('offers one row per name, its parts named, and the amounts added', () => {
		const { householdId, owner } = makeHousehold();
		const pick = buildIngredientPick(householdId, createRecipe(householdId, owner.id, lasagne()))!;

		const butter = pick.rows.filter((row) => row.name === 'Butter');
		assert.equal(butter.length, 1);
		assert.equal(butter[0].quantity, 80);
		assert.equal(butter[0].unit, 'g');
		assert.deepEqual(butter[0].parts, ['Béchamel']);
		assert.equal(pick.rows.length, 7);
	});

	it('names both parts when one name is gathered from two', () => {
		const { householdId, owner } = makeHousehold();
		const recipe = lasagne();
		recipe.ingredientDetails![5] = { note: null, section: 'Bolognese' };
		const pick = buildIngredientPick(householdId, createRecipe(householdId, owner.id, recipe))!;

		assert.deepEqual(pick.rows.find((row) => row.name === 'Butter')?.parts, [
			'Bolognese',
			'Béchamel'
		]);
	});

	it('puts names on the list, never notes, and only amounts a list can shop for', () => {
		const { householdId, owner } = makeHousehold();
		pourAll(householdId, owner.id, createRecipe(householdId, owner.id, lasagne()));

		const list = new Map(listOpenItems(householdId).map((item) => [item.name, item]));
		assert.ok(list.has('Faschiertes'), 'Faschiertes without "gemischt"');
		assert.ok(![...list.keys()].some((name) => name.includes('gemischt')));
		assert.equal(list.get('Faschiertes')?.quantity, 500);

		// A container is a pack with its number…
		assert.equal(list.get('Tomaten')?.quantity, 1);
		assert.equal(list.get('Tomaten')?.unit, 'pack');
		// …any other counting word, and tbsp and tsp, the name alone.
		assert.equal(list.get('Knoblauch')?.quantity, null);
		assert.equal(list.get('Knoblauch')?.unit, null);
		assert.equal(list.get('Olivenöl')?.quantity, null);
		// The same name in two parts is one row, added up.
		assert.equal(list.get('Butter')?.quantity, 80);
		assert.equal(listOpenItems(householdId).filter((item) => item.name === 'Butter').length, 1);
	});

	it('scales the container’s number with the count cooked for', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, lasagne());
		const pick = buildIngredientPick(householdId, id)!;
		const tomatoes = pick.rows.find((row) => row.name === 'Tomaten')!;

		addRecipeIngredients(householdId, owner.id, {
			recipeId: id,
			chosen: [tomatoes.id],
			offered: [tomatoes.id],
			cookingFor: 8
		});
		const row = listOpenItems(householdId).find((item) => item.name === 'Tomaten');
		assert.equal(row?.quantity, 2);
		assert.equal(row?.unit, 'pack');
	});
});

describe('migration 0029: parts, notes and links', () => {
	it('keeps every existing pin and lets one ingredient be named by two phrases', () => {
		const migrations = readMigrationFiles({ migrationsFolder: 'src/lib/server/db/migrations' });
		const target = migrations.findIndex((migration) =>
			migration.sql.some((statement) => statement.includes('recipe_step_ingredients_link_unique'))
		);
		assert.ok(target > 0, 'the migration exists');

		const sqlite = new Database(':memory:');
		sqlite.pragma('foreign_keys = ON');
		const run = (index: number) => {
			for (const statement of migrations[index].sql) if (statement.trim()) sqlite.exec(statement);
		};
		for (let index = 0; index < target; index++) run(index);

		const now = Date.now();
		sqlite
			.prepare('INSERT INTO households (id, name, timezone, created_at) VALUES (?, ?, ?, ?)')
			.run('h', 'Home', 'Europe/Vienna', now);
		sqlite
			.prepare(
				'INSERT INTO recipes (id, household_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run('r', 'h', 'Pasta', now, now);
		sqlite
			.prepare(
				'INSERT INTO recipe_ingredients (id, recipe_id, name, quantity, unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run('i', 'r', 'Zwiebel', 1, null, 0);
		sqlite
			.prepare(
				'INSERT INTO recipe_steps (id, recipe_id, text, ingredients_set, sort_order) VALUES (?, ?, ?, ?, ?)'
			)
			.run('s', 'r', 'Zwiebel würfeln.', 1, 0);
		sqlite
			.prepare(
				'INSERT INTO recipe_step_ingredients (id, step_id, ingredient_id, quantity, sort_order) VALUES (?, ?, ?, ?, ?)'
			)
			.run('p', 's', 'i', 0.5, 0);

		run(target);

		assert.deepEqual(
			sqlite
				.prepare('SELECT id, quantity, phrase, amount_phrase FROM recipe_step_ingredients')
				.all(),
			[{ id: 'p', quantity: 0.5, phrase: null, amount_phrase: null }]
		);
		assert.deepEqual(sqlite.prepare('SELECT note, section FROM recipe_ingredients').all(), [
			{ note: null, section: null }
		]);

		const link = sqlite.prepare(
			'INSERT INTO recipe_step_ingredients (id, step_id, ingredient_id, phrase, sort_order) VALUES (?, ?, ?, ?, ?)'
		);
		link.run('p2', 's', 'i', 'Zwiebelwürfel', 1);
		assert.throws(() => link.run('p3', 's', 'i', 'Zwiebelwürfel', 2), /UNIQUE/);
	});
});
