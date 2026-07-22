/**
 * Cook mode's route exists from plan 07 so "Start cook mode" [7a] leads
 * somewhere real; plan 08 builds what's behind it (→ docs/plans/08-cook-mode.md).
 * The guard and the recipe lookup are already the ones it will need.
 */
import { error } from '@sveltejs/kit';
import { requireMember } from '$lib/server/guards';
import { getRecipe } from '$lib/server/services/recipes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	const recipe = getRecipe(householdId, event.params.id);
	if (!recipe) error(404, 'That recipe is gone.');

	return { recipe };
};
