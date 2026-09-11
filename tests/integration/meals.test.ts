/**
 * Recipes and the week through their services (→ services/recipes.ts,
 * services/meals.ts, SPEC §4.1–4.2, DECISIONS #126).
 *
 * A meal is a (household, date, slot) — planning the same slot twice replaces
 * rather than duplicates, and a recipe from another household is not a recipe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { getPlan, planMeal, removeMeal } from '$lib/server/services/meals';
import { createRecipe, deleteRecipe, getRecipe, listRecipes } from '$lib/server/services/recipes';
import { startOfWeek } from '$lib/utils/dates';
import { makeHousehold } from '../helpers/db';

const TODAY = '2026-03-10';
const MONDAY = startOfWeek(TODAY);

const CURRY = {
	name: 'Lentil curry',
	timeMinutes: 35,
	servings: 4,
	ingredientLines: ['200 g red lentils', '400 ml coconut milk', '1 onion'],
	steps: [
		{ text: 'Fry the onion.', uses: [{ ingredient: 2, quantity: null }] },
		{ text: 'Add lentils and coconut milk, simmer 20 min.', uses: null }
	]
};

function mealsOn(householdId: string, date: string) {
	return getPlan(householdId, TODAY, 'en')
		.weeks.flatMap((week) => week.days)
		.filter((day) => day.date === date)
		.flatMap((day) => day.meals)
		.map((meal) => [meal.slot, meal.name, meal.cook?.displayName ?? null]);
}

describe('recipes', () => {
	it('round-trips name, time, servings, ingredients and steps', () => {
		const { householdId, owner } = makeHousehold();

		const id = createRecipe(householdId, owner.id, CURRY);
		const recipe = getRecipe(householdId, id);

		assert.ok(recipe);
		assert.equal(recipe.name, 'Lentil curry');
		assert.equal(recipe.timeMinutes, 35);
		assert.equal(recipe.servings, 4);
		assert.equal(recipe.ingredients.length, 3);
		assert.deepEqual(
			recipe.steps.map((step) => step.text),
			CURRY.steps.map((step) => step.text)
		);
	});

	it('is invisible to and undeletable by another household', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const id = createRecipe(a.householdId, a.owner.id, CURRY);

		assert.equal(getRecipe(b.householdId, id), null);
		assert.equal(listRecipes(b.householdId).length, 0);
		assert.equal(deleteRecipe(b.householdId, id), false);
		assert.equal(listRecipes(a.householdId).length, 1);
	});
});

describe('planMeal', () => {
	it('puts a recipe on a day, under its live name, with the cook', () => {
		const { householdId, owner } = makeHousehold();
		const recipeId = createRecipe(householdId, owner.id, CURRY);

		const result = planMeal(householdId, owner.id, {
			date: MONDAY,
			slot: 'dinner',
			mealId: null,
			recipeId,
			title: null,
			cookMemberId: owner.id,
			addIngredients: false
		});

		assert.equal(result.planned, true);
		assert.deepEqual(mealsOn(householdId, MONDAY), [['dinner', 'Lentil curry', 'Owner']]);
	});

	it('planning the same slot again replaces the meal instead of adding one', () => {
		const { householdId, owner } = makeHousehold();
		const base = {
			date: MONDAY,
			slot: 'dinner' as const,
			mealId: null,
			recipeId: null,
			cookMemberId: null,
			addIngredients: false
		};

		planMeal(householdId, owner.id, { ...base, title: 'Leftovers' });
		planMeal(householdId, owner.id, { ...base, title: 'Pizza night' });

		assert.deepEqual(mealsOn(householdId, MONDAY), [['dinner', 'Pizza night', null]]);
	});

	it('a recipe id from another household plans nothing', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		const foreignRecipe = createRecipe(b.householdId, b.owner.id, CURRY);

		const result = planMeal(a.householdId, a.owner.id, {
			date: MONDAY,
			slot: 'lunch',
			mealId: null,
			recipeId: foreignRecipe,
			title: null,
			cookMemberId: null,
			addIngredients: false
		});

		assert.equal(result.planned, false);
		assert.deepEqual(mealsOn(a.householdId, MONDAY), []);
	});

	it('a meal can only be removed by its own household', () => {
		const a = makeHousehold();
		const b = makeHousehold();
		planMeal(a.householdId, a.owner.id, {
			date: MONDAY,
			slot: 'breakfast',
			mealId: null,
			recipeId: null,
			title: 'Porridge',
			cookMemberId: null,
			addIngredients: false
		});
		const [meal] = getPlan(a.householdId, TODAY, 'en').weeks[0].days.flatMap((day) => day.meals);

		assert.equal(removeMeal(b.householdId, meal.id), false);
		assert.equal(removeMeal(a.householdId, meal.id), true);
		assert.deepEqual(mealsOn(a.householdId, MONDAY), []);
	});
});
