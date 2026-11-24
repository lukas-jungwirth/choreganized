/**
 * A saved recipe's tidy, under review (→ plan 48, SPEC §4.5): the import's
 * review screen (plan 45) on a draft the recipe screen's "Tidy with AI" made,
 * kept in this tab's `sessionStorage` under `?draft=<id>`.
 *
 * `save` updates the recipe **in place** through `updateRecipe`, so its id,
 * and with it its plan entries, its favourite and its timers' links, stay.
 * The recipe is the address's, checked against the household here, never the
 * id the draft in the browser names. The photo stays unless "Edit
 * everything" replaced or removed it; tags and diet are the ones the form
 * posts (the review posts the recipe's own).
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { getRecipe, updateRecipe, type ImageChange } from '$lib/server/services/recipes';
import { listUnits } from '$lib/server/services/units';
import { deleteUpload, storePhotoFromForm, uploadErrorMessage } from '$lib/server/uploads';
import { readDraftId } from '$lib/utils/recipe-review';
import { readRecipeForm } from '$lib/utils/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	const recipe = getRecipe(householdId, event.params.id);
	if (!recipe) error(404, catalog(event.locals.locale).errors.recipes.gone);

	// No draft named: nothing to review here, the recipe is as it was.
	const draft = readDraftId(event.url.searchParams);
	if (!draft) redirect(303, `/cooking/recipes/${recipe.id}`);

	return {
		recipe,
		units: listUnits(householdId).map((unit) => unit.word),
		draft,
		edit: event.url.searchParams.get('edit') === '1'
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { householdId } = requireMember(event);
		const id = event.params.id;
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);

		const parsed = readRecipeForm(form, m);
		if ('error' in parsed) return fail(400, parsed);

		let stored: string | null;
		try {
			stored = await storePhotoFromForm(form);
		} catch (cause) {
			return fail(400, { error: uploadErrorMessage(cause, m), field: 'photo' as const });
		}

		const image: ImageChange = stored
			? { set: stored }
			: form.get('removePhoto') === '1'
				? { clear: true }
				: undefined;

		if (!updateRecipe(householdId, id, parsed.input, image)) {
			if (stored) deleteUpload(stored);
			error(404, m.errors.recipes.gone);
		}

		redirect(303, `/cooking/recipes/${id}`);
	}
};
