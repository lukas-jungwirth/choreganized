/**
 * The recipe library (→ SPEC §4.3).
 *
 * Search runs here rather than in the browser — this is the one cooking screen
 * whose list can genuinely grow, and `?q=` makes a search a place you can
 * reload, bookmark and go back to. (The plan sheet, which can't navigate,
 * filters the same list client-side instead.)
 */
import { requireMember } from '$lib/server/guards';
import { getAiImportStatus } from '$lib/server/services/household';
import { countRecipes, listRecipes } from '$lib/server/services/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);
	const search = event.url.searchParams.get('q')?.trim() ?? '';

	return {
		recipes: listRecipes(householdId, { search }),
		/** The whole library, so "no matches" and "no recipes" can differ [7e]. */
		total: countRecipes(householdId),
		search,
		/** Whether the "Add a recipe" chooser offers the AI options (→ plan 14). */
		aiEnabled: getAiImportStatus(householdId).set
	};
};
