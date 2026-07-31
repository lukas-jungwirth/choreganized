/**
 * The meal plan and the two most recent recipes (→ SPEC §4.1).
 *
 * The plan sheet searches the library in the browser rather than over the wire,
 * so the whole (short) list of summaries ships with the page — a household has
 * tens of recipes, and a sheet that pauses between keystrokes would be a worse
 * trade than a few kilobytes. The browse page, where the list can actually be
 * long, searches server-side instead.
 *
 * Which week is on screen lives in the URL (`?week=YYYY-MM-DD`, a Monday), so
 * switching weeks is a link rather than client state — and **reading
 * `event.url` is what makes SvelteKit re-run this load when one is followed**.
 * The service validates and clamps the value; this stays thin.
 */
import { requireMember } from '$lib/server/guards';
import { mealPlanActions } from '$lib/server/meal-actions';
import { getPlan } from '$lib/server/services/meals';
import { listRecipes } from '$lib/server/services/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	// `today` from the layout, so the strip's sage day and the tab badge can
	// never straddle household midnight differently.
	const { today } = await event.parent();

	return {
		plan: getPlan(householdId, today, event.locals.locale, event.url.searchParams.get('week')),
		recipes: listRecipes(householdId)
	};
};

/**
 * The plan sheet's `plan`/`remove` and the ingredient picker's `addToList`,
 * shared with the recipe page (→ `lib/server/meal-actions`).
 */
export const actions: Actions = mealPlanActions;
