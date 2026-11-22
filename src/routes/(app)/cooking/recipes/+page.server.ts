/**
 * The recipe library (→ SPEC §4.3).
 *
 * Search and filters run here rather than in the browser — this is the one
 * cooking screen whose list can genuinely grow, and the URL makes a filtered
 * list a place you can reload, bookmark and go back to (`?q=&meal=dinner…`,
 * → `$lib/utils/recipe-filter`). (The plan sheet, which can't navigate,
 * filters the same list client-side instead.)
 *
 * Alongside the grid the load sends the **searched** library unfiltered — the
 * filter sheet counts its draft against it in the browser with the same
 * function that filtered the grid, so "Show 6 recipes" opens six (→ plan 40).
 */
import { requireMember } from '$lib/server/guards';
import { isAiEnabled } from '$lib/server/services/ai';
import { countRecipes, listRecipes } from '$lib/server/services/recipes';
import {
	applyRecipeFilter,
	parseRecipeFilter,
	recipeFacets,
	type FilterableRecipe
} from '$lib/utils/recipe-filter';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	const { today } = await event.parent();

	const search = event.url.searchParams.get('q')?.trim() ?? '';
	const filter = parseRecipeFilter(event.url.searchParams);

	const library = listRecipes(householdId, { today });
	const searched = search ? listRecipes(householdId, { search, today }) : library;

	return {
		recipes: applyRecipeFilter(searched, filter, new Intl.Collator(event.locals.locale)),
		/** The whole library, so "no matches" and "no recipes" can differ [7e]. */
		total: countRecipes(householdId),
		search,
		filter,
		/** What the sheet counts against: the search applied, the filters not. */
		index: searched.map((recipe): FilterableRecipe => ({
			id: recipe.id,
			name: recipe.name,
			timeMinutes: recipe.timeMinutes,
			createdAt: recipe.createdAt,
			tags: recipe.tags,
			diet: recipe.diet,
			favourite: recipe.favourite,
			lastPlanned: recipe.lastPlanned
		})),
		/** Which filters the whole library could use — a group nobody tagged isn't offered. */
		facets: recipeFacets(library),
		/** Whether the "Add a recipe" chooser offers the AI options (→ plan 14). */
		aiEnabled: isAiEnabled(householdId)
	};
};
