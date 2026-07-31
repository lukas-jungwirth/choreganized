/**
 * One recipe [7a] and everything the ••• menu [7c] does to it.
 *
 * `plan` and `remove` are literally the week's — the plan sheet is raised from
 * both screens and posts to whichever page it's mounted on, so both spread the
 * same pair (→ `lib/server/meal-actions`).
 */
import { error, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { mealPlanActions } from '$lib/server/meal-actions';
import { getPlan } from '$lib/server/services/meals';
import { buildIngredientPick } from '$lib/server/services/recipe-shopping';
import {
	deleteRecipe,
	duplicateRecipe,
	getRecipe,
	listRecipes
} from '$lib/server/services/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	const { today } = await event.parent();

	const recipe = getRecipe(householdId, event.params.id);
	// Another household's id and a deleted recipe answer identically.
	if (!recipe) error(404, catalog(event.locals.locale).errors.recipes.gone);

	return {
		recipe,
		/**
		 * "Add to plan" picks a day first, so it needs both weeks [3d]. No
		 * `?week=` is read here: this screen offers them in one list rather than
		 * paging (→ DECISIONS #99).
		 */
		plan: getPlan(householdId, today, event.locals.locale),
		/** The plan sheet's list — it can be reopened on a different recipe. */
		recipes: listRecipes(householdId),
		/**
		 * The basket's sheet [3e], filled in here rather than fetched when it
		 * opens: this page has already read the recipe, and a picker that pauses
		 * before it can show you what you're about to buy is a picker nobody
		 * waits for. What it previews is re-read on submit, so a housemate adding
		 * cucumbers meanwhile changes the outcome, not the truth of the outcome.
		 */
		pick: buildIngredientPick(householdId, event.params.id)
	};
};

export const actions: Actions = {
	// The plan sheet's and the picker's, shared with the week
	// (→ `lib/server/meal-actions`).
	...mealPlanActions,

	duplicate: async (event) => {
		const { householdId, member } = requireMember(event);

		const copyId = duplicateRecipe(householdId, member.id, event.params.id);
		if (!copyId) error(404, catalog(event.locals.locale).errors.recipes.gone);

		// Land on the copy: it's the one being worked on now, and its "(copy)"
		// name says plainly what happened.
		redirect(303, `/cooking/recipes/${copyId}`);
	},

	delete: async (event) => {
		const { householdId } = requireMember(event);

		deleteRecipe(householdId, event.params.id);

		redirect(303, '/cooking/recipes');
	}
};
