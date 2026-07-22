/**
 * The week's meal plan and the two most recent recipes (→ SPEC §4.1).
 *
 * The plan sheet searches the library in the browser rather than over the wire,
 * so the whole (short) list of summaries ships with the page — a household has
 * tens of recipes, and a sheet that pauses between keystrokes would be a worse
 * trade than a few kilobytes. The browse page, where the list can actually be
 * long, searches server-side instead.
 */
import { requireMember } from '$lib/server/guards';
import { mealPlanActions } from '$lib/server/meal-actions';
import { getWeek } from '$lib/server/services/meals';
import { listRecipes } from '$lib/server/services/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	// `today` from the layout, so the strip's sage day and the tab badge can
	// never straddle household midnight differently.
	const { today } = await event.parent();

	return {
		week: getWeek(householdId, today),
		recipes: listRecipes(householdId)
	};
};

/** `plan` and `remove` are the plan sheet's, shared with the recipe page. */
export const actions: Actions = mealPlanActions;
