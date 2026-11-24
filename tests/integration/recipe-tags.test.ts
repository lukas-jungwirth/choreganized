/**
 * Recipe tags, diet, the heart and what the library reads about them through
 * the recipe service (→ plan 40, SPEC §4.3–4.5): tags are replaced with the
 * recipe and die with it, unknown ones are dropped, the search reads
 * ingredients, and "last planned" counts this household's past days only.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { planMeal } from '$lib/server/services/meals';
import {
	createRecipe,
	deleteRecipe,
	duplicateRecipe,
	getRecipe,
	listRecipes,
	listUntaggedRecipes,
	setFavourite,
	setRecipeTags,
	updateRecipe
} from '$lib/server/services/recipes';
import type { RecipeTag } from '$lib/utils/recipe-tags';
import type { RecipeInput } from '$lib/utils/recipes';
import { db } from '$lib/server/db';
import { recipeTags } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { makeHousehold } from '../helpers/db';

const TODAY = '2026-11-22';

function soup(overrides: Partial<RecipeInput> = {}): RecipeInput {
	return {
		name: 'Pumpkin soup',
		timeMinutes: 40,
		servings: 4,
		ingredientLines: ['1 Hokkaido pumpkin', '400 ml coconut milk', '1 lemon'],
		steps: [{ text: 'Roast, blend, season.', uses: null, timer: null }],
		tags: ['kind:soup', 'meal:dinner', 'meal:lunch'],
		diet: 'vegan',
		...overrides
	};
}

function plan(householdId: string, memberId: string, date: string, recipeId: string) {
	return planMeal(householdId, memberId, {
		date,
		slot: 'dinner',
		mealId: null,
		recipeId,
		title: null,
		cookMemberId: null,
		addIngredients: false
	});
}

describe('recipe tags', () => {
	it('are saved with the recipe, in list order, with its diet', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, soup());

		const recipe = getRecipe(householdId, id)!;
		assert.deepEqual(recipe.tags, ['meal:lunch', 'meal:dinner', 'kind:soup']);
		assert.equal(recipe.diet, 'vegan');
		assert.equal(recipe.favourite, false);
	});

	it('are replaced on update, and cleared with the diet', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, soup());

		updateRecipe(householdId, id, soup({ tags: ['free:gluten'], diet: null }));
		let recipe = getRecipe(householdId, id)!;
		assert.deepEqual(recipe.tags, ['free:gluten']);
		assert.equal(recipe.diet, null);

		updateRecipe(householdId, id, soup({ tags: [], diet: 'vegetarian' }));
		recipe = getRecipe(householdId, id)!;
		assert.deepEqual(recipe.tags, []);
		assert.equal(recipe.diet, 'vegetarian');
	});

	it('stay as they are for a caller that says nothing about them', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, soup());

		updateRecipe(householdId, id, soup({ tags: undefined, diet: undefined, name: 'Soup' }));
		const recipe = getRecipe(householdId, id)!;
		assert.equal(recipe.name, 'Soup');
		assert.deepEqual(recipe.tags, ['meal:lunch', 'meal:dinner', 'kind:soup']);
		assert.equal(recipe.diet, 'vegan');
	});

	it('drop a key that is not on the list', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(
			householdId,
			owner.id,
			soup({ tags: ['kind:soup', 'cuisine:austrian' as RecipeTag, 'kind:soup'] })
		);
		assert.deepEqual(getRecipe(householdId, id)!.tags, ['kind:soup']);
	});

	it('go with the recipe, and travel with a duplicate without its heart', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, soup());
		setFavourite(householdId, id, true);

		const copyId = duplicateRecipe(householdId, owner.id, id)!;
		const copy = getRecipe(householdId, copyId)!;
		assert.deepEqual(copy.tags, ['meal:lunch', 'meal:dinner', 'kind:soup']);
		assert.equal(copy.diet, 'vegan');
		assert.equal(copy.favourite, false);

		deleteRecipe(householdId, id);
		const left = db.select().from(recipeTags).where(eq(recipeTags.recipeId, id)).all();
		assert.deepEqual(left, []);
		assert.equal(getRecipe(householdId, copyId)!.tags.length, 3);
	});
});

describe('the heart', () => {
	it('is set and taken off, and only in its own household', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const id = createRecipe(a.householdId, a.owner.id, soup());

		assert.equal(setFavourite(b.householdId, id, true), false);
		assert.equal(getRecipe(a.householdId, id)!.favourite, false);

		assert.equal(setFavourite(a.householdId, id, true), true);
		assert.equal(getRecipe(a.householdId, id)!.favourite, true);
		setFavourite(a.householdId, id, false);
		assert.equal(getRecipe(a.householdId, id)!.favourite, false);
	});
});

describe('the library list', () => {
	it('carries tags, and never another household’s', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		createRecipe(a.householdId, a.owner.id, soup());
		createRecipe(b.householdId, b.owner.id, soup({ tags: ['meal:breakfast'], diet: 'meat' }));

		const [mine] = listRecipes(a.householdId);
		assert.deepEqual(mine.tags, ['meal:lunch', 'meal:dinner', 'kind:soup']);
		assert.equal(mine.diet, 'vegan');
	});

	it('searches ingredient names as well as recipe names', () => {
		const { householdId, owner } = makeHousehold();
		createRecipe(householdId, owner.id, soup());
		createRecipe(householdId, owner.id, soup({ name: 'Lemon tart', ingredientLines: ['3 eggs'] }));
		createRecipe(householdId, owner.id, soup({ name: 'Toast', ingredientLines: ['bread'] }));

		const names = listRecipes(householdId, { search: 'lemon' }).map((r) => r.name);
		assert.deepEqual(names.sort(), ['Lemon tart', 'Pumpkin soup']);
		assert.deepEqual(
			listRecipes(householdId, { search: '50%' }).map((r) => r.name),
			[],
			'a % is a character, not a wildcard'
		);
	});

	it('does not find another household’s recipe by its ingredients', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		createRecipe(b.householdId, b.owner.id, soup());

		assert.deepEqual(listRecipes(a.householdId, { search: 'pumpkin' }), []);
	});

	it('knows the last day up to today each recipe was planned', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const id = createRecipe(a.householdId, a.owner.id, soup());
		const never = createRecipe(a.householdId, a.owner.id, soup({ name: 'Never' }));
		const theirs = createRecipe(b.householdId, b.owner.id, soup());

		plan(a.householdId, a.owner.id, '2026-11-01', id);
		plan(a.householdId, a.owner.id, '2026-11-15', id);
		// Thursday's dinner hasn't been cooked yet.
		plan(a.householdId, a.owner.id, '2026-11-26', id);
		plan(b.householdId, b.owner.id, '2026-11-21', theirs);

		const byId = new Map(listRecipes(a.householdId, { today: TODAY }).map((r) => [r.id, r]));
		assert.equal(byId.get(id)!.lastPlanned, '2026-11-15');
		assert.equal(byId.get(never)!.lastPlanned, null);

		// Without a today, nobody asked.
		assert.equal(listRecipes(a.householdId).find((r) => r.id === id)!.lastPlanned, null);
	});

	it('counts today as planned', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, soup());
		plan(householdId, owner.id, TODAY, id);

		assert.equal(listRecipes(householdId, { today: TODAY })[0].lastPlanned, TODAY);
	});
});

describe('the sorting pass (→ plan 41)', () => {
	it('lists recipes with no tag and no diet, newest first, with their ingredient names', () => {
		const { householdId, owner } = makeHousehold();
		createRecipe(householdId, owner.id, soup());
		createRecipe(householdId, owner.id, soup({ name: 'Diet only', tags: [], diet: 'meat' }));
		createRecipe(
			householdId,
			owner.id,
			soup({ name: 'Tag only', tags: ['kind:soup'], diet: null })
		);
		const bare = createRecipe(householdId, owner.id, soup({ name: 'Bare', tags: [], diet: null }));

		assert.deepEqual(listUntaggedRecipes(householdId), [
			{
				id: bare,
				name: 'Bare',
				imagePath: null,
				timeMinutes: 40,
				ingredients: ['Hokkaido pumpkin', 'coconut milk', 'lemon']
			}
		]);
	});

	it('never lists another household’s', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		createRecipe(b.householdId, b.owner.id, soup({ tags: [], diet: null }));
		assert.deepEqual(listUntaggedRecipes(a.householdId), []);
	});

	it('saves one recipe’s tags and diet, and only in its own household', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const id = createRecipe(a.householdId, a.owner.id, soup({ tags: [], diet: null }));

		assert.equal(setRecipeTags(b.householdId, id, ['kind:soup'], 'vegan'), 'gone');
		assert.deepEqual(getRecipe(a.householdId, id)!.tags, []);

		assert.equal(setRecipeTags(a.householdId, id, ['kind:soup', 'nope'], 'vegan'), 'saved');
		const recipe = getRecipe(a.householdId, id)!;
		assert.deepEqual(recipe.tags, ['kind:soup']);
		assert.equal(recipe.diet, 'vegan');
		assert.deepEqual(listUntaggedRecipes(a.householdId), []);
	});
});

describe('two people sorting at once (→ plan 41)', () => {
	it('keeps a housemate’s tags when the card was already tagged', () => {
		const { householdId, owner } = makeHousehold();
		const id = createRecipe(householdId, owner.id, soup({ tags: [], diet: null }));

		setRecipeTags(householdId, id, ['meal:dinner', 'kind:main'], null, { onlyUntagged: true });
		assert.equal(setRecipeTags(householdId, id, [], 'vegetarian', { onlyUntagged: true }), 'kept');
		const recipe = getRecipe(householdId, id)!;
		assert.deepEqual(recipe.tags, ['meal:dinner', 'kind:main']);
		assert.equal(recipe.diet, null);
	});
});
