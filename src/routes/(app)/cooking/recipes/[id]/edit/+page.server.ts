/**
 * Edit recipe [3c] — the same form and the same photo rules as `new`, plus the
 * two things only an edit can do: replace the photo, and take it away.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { getRecipe, updateRecipe, type ImageChange } from '$lib/server/services/recipes';
import { deleteUpload, storePhotoFromForm, uploadErrorMessage } from '$lib/server/uploads';
import { readRecipeForm } from '$lib/utils/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	const recipe = getRecipe(householdId, event.params.id);
	if (!recipe) error(404, catalog(event.locals.locale).errors.recipes.gone);

	return { recipe };
};

export const actions: Actions = {
	save: async (event) => {
		const { householdId } = requireMember(event);
		const id = event.params.id;
		const form = await event.request.formData();

		const parsed = readRecipeForm(form, catalog(event.locals.locale));
		if ('error' in parsed) return fail(400, parsed);

		let stored: string | null;
		try {
			stored = await storePhotoFromForm(form);
		} catch (cause) {
			return fail(400, {
				error: uploadErrorMessage(cause, catalog(event.locals.locale)),
				field: 'photo' as const
			});
		}

		// One service call, one transaction: the text, the ingredients, the steps
		// and the photo column move together or not at all.
		const image: ImageChange = stored
			? { set: stored }
			: form.get('removePhoto') === '1'
				? { clear: true }
				: undefined;

		if (!updateRecipe(householdId, id, parsed.input, image)) {
			// Deleted from another phone while this form was open: the file that
			// was just written now belongs to nothing.
			if (stored) deleteUpload(stored);
			error(404, catalog(event.locals.locale).errors.recipes.gone);
		}

		redirect(303, `/cooking/recipes/${id}`);
	}
};
