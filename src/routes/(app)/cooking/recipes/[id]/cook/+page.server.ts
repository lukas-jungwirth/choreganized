/**
 * Cook mode's data: the recipe, and whatever timers this person already has
 * running (→ SPEC §4.6).
 *
 * The timers belong to the app rather than to this screen (→ DECISIONS #103),
 * so the `(app)` layout loads them too — but they are read *here as well*,
 * because that layout load reads no `event.url` and therefore does not re-run
 * on a client-side navigation. Without this, walking in from the recipe screen
 * would miss a timer started on the other phone. The store merges the two by
 * row id, so hydrating twice costs nothing.
 *
 * This route is a notification's destination as much as a button's [7h·2]:
 * tapping "⏲️ Mushrooms is done — back to step 2" lands here, and so does a
 * reload with two minutes still on the clock. Either way the ring should
 * already be turning.
 *
 * `?step=` is read on the client, from `page.url` — the step you're on is not a
 * reason to ask the server anything.
 */
import { error } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { listActiveTimers } from '$lib/server/services/cook-timers';
import { getRecipe } from '$lib/server/services/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId, user } = requireMember(event);

	const recipe = getRecipe(householdId, event.params.id);
	if (!recipe) error(404, catalog(event.locals.locale).errors.recipes.gone);

	// `timersFetchedAt` for the same reason the layout sends one — see there.
	return { recipe, timers: listActiveTimers(householdId, user.id), timersFetchedAt: Date.now() };
};
