/**
 * Recipe import [3c as the preview] (→ SPEC §4.7, plan 12).
 *
 * Two actions, one page. `fetch` reads a URL's Schema.org Recipe and returns the
 * draft (→ `server/recipe-import.ts`); the page then renders the ordinary recipe
 * editor prefilled from it, so the preview *is* the editor. `save` is the recipe
 * editor's usual create — with the extra job of attaching the photo the import
 * already downloaded, and cleaning it up when the user picked a different one.
 *
 * Nothing is persisted before Save but the temp photo file; an abandoned import's
 * photo is collected by the nightly sweep (→ `cron.ts`, `uploads.ts`).
 */
import { fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { importErrorMessage, importRecipe } from '$lib/server/recipe-import';
import { claimImportedPhoto, createRecipe } from '$lib/server/services/recipes';
import { deleteUpload, storePhotoFromForm, uploadErrorMessage } from '$lib/server/uploads';
import { readRecipeForm } from '$lib/utils/recipes';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	requireMember(event);
	// The share target hands the link in `?url=`, but Android browsers often drop
	// it into `?text=` (with or without a title) instead (→ SPEC §4.7).
	return { url: sharedUrl(event.url.searchParams) };
};

function sharedUrl(params: URLSearchParams): string {
	const direct = params.get('url')?.trim();
	if (direct) return direct;

	for (const key of ['text', 'title']) {
		const found = /https?:\/\/\S+/i.exec(params.get(key) ?? '');
		if (found) return found[0];
	}
	return '';
}

export const actions: Actions = {
	/** Fetch and parse a URL → the draft the editor opens on, or a typed error. */
	fetch: async (event) => {
		requireMember(event);
		const form = await event.request.formData();
		const url = String(form.get('url') ?? '').trim();

		if (!url) {
			return fail(400, {
				fetchError: catalog(event.locals.locale).cooking.import.error.invalidUrl,
				url
			});
		}

		try {
			return { draft: await importRecipe(url) };
		} catch (cause) {
			return fail(422, {
				fetchError: importErrorMessage(cause, catalog(event.locals.locale)),
				url
			});
		}
	},

	/** Create the recipe — the new-recipe path, plus the imported photo. */
	save: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const parsed = readRecipeForm(form, catalog(event.locals.locale));
		if ('error' in parsed) return fail(400, parsed);

		const imported = String(form.get('importedPhoto') ?? '');

		let picked: string | null;
		try {
			picked = await storePhotoFromForm(form);
		} catch (cause) {
			// A rejected pick leaves the imported temp alone — the user still has it,
			// and may drop the bad pick and keep it. The nightly sweep gets it if not.
			return fail(400, {
				error: uploadErrorMessage(cause, catalog(event.locals.locale)),
				field: 'photo' as const
			});
		}

		let imagePath: string | null;
		if (picked) {
			// A fresh pick wins; the imported photo is now litter.
			imagePath = picked;
			if (imported) deleteUpload(imported);
		} else if (form.get('removePhoto') === '1') {
			imagePath = null;
			if (imported) deleteUpload(imported);
		} else {
			// Attach the imported temp — but only if it's genuinely an unclaimed
			// temp file (→ `claimImportedPhoto`); a forged path drops to no photo.
			imagePath = imported ? claimImportedPhoto(imported) : null;
		}

		const id = createRecipe(householdId, member.id, parsed.input, imagePath);
		redirect(303, `/cooking/recipes/${id}`);
	}
};
