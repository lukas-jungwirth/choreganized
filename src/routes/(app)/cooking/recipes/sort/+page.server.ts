/**
 * "Sort your recipes" (→ plan 41, SPEC §4.3): the recipes nobody has tagged
 * yet, one card at a time — the library's dashed row leads here.
 *
 * The pass lives in the URL like the library does: `?total=` is how many there
 * were to sort when it started (so the progress bar doesn't shrink as it
 * fills), `?skip=` the ids passed over this time. A skipped recipe comes back
 * on the next visit; nothing about the pass is stored.
 *
 * `next` saves one card through the same tag writer the form uses — unless a
 * housemate tagged it meanwhile, whose tags stand. A card with nothing ticked
 * is a skip — saving "no tags" would show it again at
 * once. `suggest` asks the AI about every recipe still to sort in one call and
 * hands the suggestions back for the page to keep while the cards go by;
 * nothing is saved until each card's Next.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { getAiConnections, isAiEnabled } from '$lib/server/services/ai';
import { aiImportErrorMessage, suggestRecipeTags } from '$lib/server/services/ai-import';
import { listUntaggedRecipes, setRecipeTags } from '$lib/server/services/recipes';
import { guessDiet } from '$lib/utils/diet-guess';
import {
	readRecipeDiet,
	readRecipeTags,
	type RecipeDiet,
	type RecipeTag
} from '$lib/utils/recipe-tags';
import type { Actions, PageServerLoad } from './$types';

/** The pass's own address, carrying how many there were and what was skipped. */
function passUrl(total: number, skip: string[]): string {
	const params = new URLSearchParams({ total: String(total) });
	if (skip.length) params.set('skip', skip.join(','));
	return `/cooking/recipes/sort?${params}`;
}

function readPass(url: URL): { total: number | null; skip: string[] } {
	const total = Number(url.searchParams.get('total'));
	return {
		total: Number.isInteger(total) && total > 0 ? total : null,
		skip: (url.searchParams.get('skip') ?? '').split(',').filter(Boolean).slice(0, 500)
	};
}

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);
	const { total: asked, skip } = readPass(event.url);

	const untagged = listUntaggedRecipes(householdId);
	const remaining = untagged.filter((recipe) => !skip.includes(recipe.id));
	const current = remaining[0];

	// Nothing (left) to sort: back to the library, which no longer offers the row.
	if (!current) redirect(303, '/cooking/recipes');

	// A count the URL lost or never had is the count now; one that the household
	// grew past meanwhile (a recipe added in another tab) grows with it.
	const total = Math.max(asked ?? 0, untagged.length);

	return {
		recipe: current,
		/** The diet the ingredients point to — dotted, never saved on its own. */
		guess: guessDiet(current.ingredients),
		total,
		/** Sorted ones only: a skipped card isn't done, it's for next time. */
		done: total - untagged.length,
		skip,
		skipHref: passUrl(total, [...skip, current.id]),
		aiEnabled: isAiEnabled(householdId)
	};
};

export const actions: Actions = {
	next: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();
		const { total, skip } = readPass(event.url);

		const recipeId = String(form.get('recipeId') ?? '');
		// The card carries the count it was shown with: the first visit's URL has
		// none, and starting over from what's left would make the bar jump back.
		const posted = Number(form.get('total'));
		const count = Number.isInteger(posted) && posted > 0 ? posted : (total ?? 1);
		const tags = readRecipeTags(form.getAll('tag'));
		const diet = readRecipeDiet(form.get('diet'));

		if (!tags.length && !diet) redirect(303, passUrl(count, [...skip, recipeId]));

		// Another household's id and a recipe deleted meanwhile answer alike. One a
		// housemate tagged in the meantime keeps their tags; the pass just moves on.
		if (setRecipeTags(householdId, recipeId, tags, diet, { onlyUntagged: true }) === 'gone') {
			error(404, catalog(event.locals.locale).errors.recipes.gone);
		}

		redirect(303, passUrl(count, skip));
	},

	suggest: async (event) => {
		const { householdId } = requireMember(event);
		const m = catalog(event.locals.locale);
		const { skip } = readPass(event.url);

		const pending = listUntaggedRecipes(householdId).filter((recipe) => !skip.includes(recipe.id));

		try {
			const answer = await suggestRecipeTags(getAiConnections(householdId), pending);
			const suggestions: Record<string, { tags: RecipeTag[]; diet: RecipeDiet | null }> = {};
			for (const [index, guess] of answer.value) suggestions[pending[index].id] = guess;
			return { suggestions };
		} catch (cause) {
			return fail(502, { aiError: aiImportErrorMessage(cause, m) });
		}
	}
};
