/**
 * New recipe [3c].
 *
 * The photo is validated, resized and written to disk **before** the row is
 * inserted (→ `server/uploads.ts`): everything that can go wrong with a picture
 * goes wrong while the answer is still "pick another one", and the recipe is
 * complete the first time it exists.
 */
import { fail, redirect } from '@sveltejs/kit';
import { requireMember } from '$lib/server/guards';
import { createRecipe } from '$lib/server/services/recipes';
import { storePhotoFromForm, uploadErrorMessage } from '$lib/server/uploads';
import { readRecipeForm } from '$lib/utils/recipes';
import type { Actions } from './$types';

export const actions: Actions = {
	save: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const parsed = readRecipeForm(form);
		if ('error' in parsed) return fail(400, parsed);

		let imagePath: string | null;
		try {
			imagePath = await storePhotoFromForm(form);
		} catch (cause) {
			return fail(400, { error: uploadErrorMessage(cause), field: 'photo' as const });
		}

		const id = createRecipe(householdId, member.id, parsed.input, imagePath);

		redirect(303, `/cooking/recipes/${id}`);
	}
};
