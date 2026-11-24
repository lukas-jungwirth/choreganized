/**
 * One recipe [7a] and everything the ••• menu [7c] does to it.
 *
 * `tidy` (→ plan 48) runs the saved recipe through the import's model call and
 * gate and hands the draft back to the menu, which keeps it in the tab and
 * opens the review under `tidy/`. Nothing is stored here: the review's Save
 * does that, through `updateRecipe`.
 *
 * `plan` and `remove` are literally the week's — the plan sheet is raised from
 * both screens and posts to whichever page it's mounted on, so both spread the
 * same pair (→ `lib/server/meal-actions`).
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { mealPlanActions } from '$lib/server/meal-actions';
import { getPlan } from '$lib/server/services/meals';
import { pickFor } from '$lib/server/services/recipe-shopping';
import { getAiConnections, isAiEnabled } from '$lib/server/services/ai';
import { aiImportErrorMessage, tidyRecipe } from '$lib/server/services/ai-import';
import { listUnits } from '$lib/server/services/units';
import type { RecipePrefill } from '$lib/utils/recipes';
import {
	deleteRecipe,
	duplicateRecipe,
	getRecipe,
	listRecipes,
	setFavourite
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
		 * opens: this page has already read the recipe — `pickFor` takes that
		 * reading rather than repeating it — and a picker that pauses before it
		 * can show you what you're about to buy is a picker nobody waits for.
		 * What it previews is re-read on submit, so a housemate adding cucumbers
		 * meanwhile changes the outcome, not the truth of the outcome.
		 */
		pick: pickFor(householdId, recipe),
		/** "Tidy with AI" is offered only with a provider set up (→ plan 48); never the key. */
		aiEnabled: isAiEnabled(householdId)
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

	/** The heart [7a] (→ plan 40): the form says which way, so a double tap can't flip it back. */
	favourite: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		if (!setFavourite(householdId, event.params.id, form.get('favourite') === '1')) {
			error(404, catalog(event.locals.locale).errors.recipes.gone);
		}

		return { favourite: true };
	},

	/**
	 * "Tidy with AI" [7c] (→ plan 48): the saved recipe through the import's
	 * call and gate, as a draft for the review. The recipe is this household's
	 * or a 404; nothing is written.
	 */
	tidy: async (event) => {
		const { householdId } = requireMember(event);
		const m = catalog(event.locals.locale);

		const recipe = getRecipe(householdId, event.params.id);
		if (!recipe) error(404, m.errors.recipes.gone);

		const connections = getAiConnections(householdId);
		if (!connections.length) return fail(400, { tidyError: m.ai.error.noKey });
		if (!recipe.ingredients.length && !recipe.steps.length) {
			return fail(400, { tidyError: m.cooking.tidy.empty });
		}

		try {
			const result = await tidyRecipe(connections, recipe, {
				labels: m.units.labels,
				units: listUnits(householdId).map((unit) => unit.word)
			});
			const { fellBackFrom, used } = result;
			const draft: RecipePrefill = { ...result.value, photo: null, suggested: null };
			return {
				tidy: {
					recipeId: recipe.id,
					draft,
					notice: [
						m.cooking.tidy.note,
						fellBackFrom
							? m.cooking.import.ai.usedBackup(
									m.ai.providers[used.provider].short,
									m.ai.providers[fellBackFrom.provider].short
								)
							: ''
					]
						.filter(Boolean)
						.join(' ')
				}
			};
		} catch (cause) {
			return fail(422, { tidyError: aiImportErrorMessage(cause, m) });
		}
	},

	delete: async (event) => {
		const { householdId } = requireMember(event);

		deleteRecipe(householdId, event.params.id);

		redirect(303, '/cooking/recipes');
	}
};
