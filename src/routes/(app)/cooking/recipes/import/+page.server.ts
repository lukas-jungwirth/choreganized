/**
 * Recipe import [3c as the preview] (→ SPEC §4.7, plans 12 & 13).
 *
 * Plan 12 stood this up: `fetch` reads a URL's Schema.org Recipe and returns the
 * draft the editor opens on. Plan 13 adds the fallbacks for what that can't read,
 * each landing in the *same* editor with an "AI-extracted" note — the AI never
 * saves on its own:
 *   - `extractPage`  — a fetched page with no Recipe markup, read by the model.
 *   - `extractText`  — recipe text pasted by hand (the answer for 403 sites).
 *   - `extractPhotos`— 1–3 photos of a cookbook / magazine page.
 * All three need the household's own Gemini key (→ services/ai-import.ts); the UI
 * only offers them when one is set.
 *
 * `save` is the recipe editor's usual create, plus attaching whatever photo the
 * import produced. Nothing is persisted before Save but the temp photo file; an
 * abandoned import's photo is collected by the nightly sweep (→ cron.ts, uploads.ts).
 */
import { fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import {
	importErrorMessage,
	importRecipeOrText,
	RecipeImportError
} from '$lib/server/recipe-import';
import {
	aiImportErrorMessage,
	extractRecipeFromImages,
	extractRecipeFromText
} from '$lib/server/services/ai-import';
import { getAiImportStatus, getGeminiApiKey } from '$lib/server/services/household';
import { claimImportedPhoto, createRecipe } from '$lib/server/services/recipes';
import {
	deleteUpload,
	reencodeUpload,
	storePhotoFromForm,
	storeRecipePhoto,
	uploadErrorMessage
} from '$lib/server/uploads';
import { readRecipeForm, type RecipePrefill } from '$lib/utils/recipes';
import type { Actions, PageServerLoad } from './$types';

/** A cookbook spread is a page or two — more than three photos is a different job. */
const MAX_PHOTOS = 3;

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);
	// The share target hands the link in `?url=`, but Android browsers often drop
	// it into `?text=` (with or without a title) instead (→ SPEC §4.7).
	return {
		url: sharedUrl(event.url.searchParams),
		// Which focused method the "Add a recipe" chooser routed to (→ plan 14).
		mode: readMode(event.url.searchParams),
		// Only whether AI import is available — never the key itself (→ SPEC §4.7).
		aiEnabled: getAiImportStatus(householdId).set
	};
};

/** The chooser lands here with `?mode=`; anything else (incl. the share target) is a link. */
function readMode(params: URLSearchParams): 'link' | 'photo' | 'text' {
	const mode = params.get('mode');
	return mode === 'photo' || mode === 'text' ? mode : 'link';
}

function sharedUrl(params: URLSearchParams): string {
	const direct = params.get('url')?.trim();
	if (direct) return direct;

	for (const key of ['text', 'title']) {
		const found = /https?:\/\/\S+/i.exec(params.get(key) ?? '');
		// `\S+` grabs any trailing sentence punctuation ("…recipe." → drop the dot),
		// which would otherwise make the auto-fetched URL a 404.
		if (found) return found[0].replace(/[.,;:!?]+$/, '');
	}
	return '';
}

export const actions: Actions = {
	/** Fetch and parse a URL → the draft the editor opens on, or a typed error. */
	fetch: async (event) => {
		requireMember(event);
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);
		const url = String(form.get('url') ?? '').trim();

		if (!url) return fail(400, { fetchError: m.cooking.import.error.invalidUrl, url });

		try {
			const result = await importRecipeOrText(url);
			if ('draft' in result) return { draft: result.draft };
			// Fetched fine, but no Recipe markup: the AI fallback can read the page
			// text (→ plan 13). `noRecipe` tells the screen to offer that — the button
			// when a key is set, the Settings hint when it isn't.
			return fail(422, { fetchError: m.cooking.import.error.noRecipe, url, noRecipe: true });
		} catch (cause) {
			return fail(422, { fetchError: importErrorMessage(cause, m), url });
		}
	},

	/**
	 * "Try AI extraction" on a page with no Recipe markup. Re-fetches the URL the
	 * screen still shows (a fresh, explicit tap — cheaper than shipping the stripped
	 * page back and forth) and reads the text with the model. A `RecipeImportError`
	 * here is a fetch problem, an `AiImportError` a model one; both keep the URL
	 * screen and its button (`noRecipe`) so text or photos are still one tap away.
	 */
	extractPage: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);
		const url = String(form.get('url') ?? '').trim();

		const key = getGeminiApiKey(householdId);
		if (!key) return fail(400, { aiError: m.cooking.import.ai.error.noKey, url, noRecipe: true });
		if (!url) return fail(400, { fetchError: m.cooking.import.error.invalidUrl, url });

		try {
			const result = await importRecipeOrText(url);
			// JSON-LD may have appeared on the re-fetch; use it directly if so.
			if ('draft' in result) return { draft: result.draft };
			const draft = await extractRecipeFromText(key, result.text);
			return { draft, aiExtracted: true };
		} catch (cause) {
			const message =
				cause instanceof RecipeImportError
					? importErrorMessage(cause, m)
					: aiImportErrorMessage(cause, m);
			return fail(422, { aiError: message, url, noRecipe: true });
		}
	},

	/** Extract from pasted text — the answer for bot-blocked (Cloudflare 403) sites. */
	extractText: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);
		const text = String(form.get('text') ?? '').trim();

		const key = getGeminiApiKey(householdId);
		if (!key) return fail(400, { aiError: m.cooking.import.ai.error.noKey });
		// Keep whatever was pasted on screen so a miss isn't retyped.
		if (!text) return fail(400, { aiError: m.cooking.import.ai.error.noRecipe, aiText: text });

		try {
			const draft = await extractRecipeFromText(key, text);
			return { draft, aiExtracted: true };
		} catch (cause) {
			return fail(422, { aiError: aiImportErrorMessage(cause, m), aiText: text });
		}
	},

	/**
	 * Extract from 1–3 photos. Each is validated and re-encoded to WebP (EXIF
	 * stripped, ≤1200px) *before* it reaches the model (→ uploads.ts); the first is
	 * kept as the recipe's photo on success. File problems are the uploader's
	 * words, model problems the AI import's.
	 */
	extractPhotos: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);

		const files = form
			.getAll('photos')
			.filter((entry): entry is File => entry instanceof File && entry.size > 0)
			.slice(0, MAX_PHOTOS);

		const key = getGeminiApiKey(householdId);
		if (!key) return fail(400, { aiError: m.cooking.import.ai.error.noKey });
		if (!files.length) return fail(400, { aiError: m.cooking.import.ai.error.noPhotos });

		let webps: Buffer[];
		try {
			webps = await Promise.all(files.map((file) => reencodeUpload(file)));
		} catch (cause) {
			return fail(400, { aiError: uploadErrorMessage(cause, m) });
		}

		let draft: RecipePrefill;
		try {
			draft = await extractRecipeFromImages(key, webps);
		} catch (cause) {
			return fail(422, { aiError: aiImportErrorMessage(cause, m) });
		}

		// Keep the first photo as the recipe's — already re-encoded, so store the
		// bytes as they are rather than running them through sharp twice. A photo is
		// non-fatal (→ SPEC §4.7): if the disk balks, the extraction still stands and
		// the draft just opens without one, rather than losing a good result.
		try {
			const imagePath = storeRecipePhoto(webps[0]);
			draft.photo = {
				path: imagePath,
				preview: `data:image/webp;base64,${webps[0].toString('base64')}`
			};
		} catch {
			// Disk trouble — the recipe is still worth showing, just photo-less.
		}

		return { draft, aiExtracted: true };
	},

	/** Create the recipe — the new-recipe path, plus the imported/extracted photo. */
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
