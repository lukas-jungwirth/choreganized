/**
 * Cook mode's data: the recipe, and whatever timer this person already has
 * running (→ SPEC §4.6).
 *
 * The timer is loaded rather than assumed absent because this route is a
 * notification's destination as much as a button's [7h·2]: tapping "⏲️
 * Mushrooms is done — back to step 2" lands here, and so does a reload with two
 * minutes still on the clock. Either way the ring should already be turning.
 *
 * `?step=` is read on the client, from `page.url` — the step you're on is not a
 * reason to ask the server anything.
 */
import { error } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { getActiveTimer } from '$lib/server/services/cook-timers';
import { getRecipe } from '$lib/server/services/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId, user } = requireMember(event);

	const recipe = getRecipe(householdId, event.params.id);
	if (!recipe) error(404, catalog(event.locals.locale).errors.recipes.gone);

	return { recipe, timer: getActiveTimer(householdId, user.id) };
};
