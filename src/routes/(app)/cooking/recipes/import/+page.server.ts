/**
 * Recipe import [3c as the preview] (→ SPEC §4.7, plans 12, 13, 20, 22).
 *
 * Every way in lands in the *same* editor — the AI never saves on its own:
 *   - `fetch`        — a link. The page's own recipe card (JSON-LD, else
 *                      Microdata) opens as written; with **Improve with AI** on,
 *                      the model structures it (amounts, which step uses what,
 *                      timers), and a page with no card is read by the model
 *                      from its text. If the model can't, the card still opens,
 *                      with a note saying why it wasn't improved.
 *   - `extractPage`  — "Try with AI" on a page with no card: the same link
 *                      path with AI on, for the one tap after a plain fetch.
 *   - `extractText`  — recipe text pasted by hand (the answer for 403 sites).
 *   - `extractPhotos`— 1–3 photos of a cookbook / magazine page.
 * The AI paths need the household's own AI connection (→ services/ai.ts) and
 * take its standing instructions plus a line typed for this import.
 *
 * `save` is the recipe editor's usual create, plus attaching whatever photo the
 * import produced. Nothing is persisted before Save but the temp photo file; an
 * abandoned import's photo is collected by the nightly sweep (→ cron.ts, uploads.ts).
 */
import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { cleanInstructions } from '$lib/ai';
import { catalog, type Messages } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import {
	draftFromCard,
	importErrorMessage,
	importPagePhoto,
	readRecipePage,
	RecipeImportError,
	type RecipePage
} from '$lib/server/recipe-import';
import { getAiConnections, getAiInstructions, isAiEnabled } from '$lib/server/services/ai';
import { getRecipeWording } from '$lib/server/services/household';
import {
	aiImportErrorMessage,
	extractRecipe,
	improveRecipe,
	type Extracted,
	type ImportContext
} from '$lib/server/services/ai-import';
import { claimImportedPhoto, createRecipe } from '$lib/server/services/recipes';
import {
	deleteUpload,
	reencodeUpload,
	storePhotoFromForm,
	storeRecipePhoto,
	uploadErrorMessage
} from '$lib/server/uploads';
import { readRecipeForm, type RecipePrefill } from '$lib/utils/recipes';
import { applyWording, type RecipeWording } from '$lib/utils/wording';
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
		aiEnabled: isAiEnabled(householdId),
		// Shown beside the instructions field, so nobody is surprised by them.
		aiInstructions: getAiInstructions(householdId)
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

/** What every AI call here is asked with: both instruction lines, and the reader's units. */
function contextFor(householdId: string, form: FormData, m: Messages): ImportContext {
	return {
		instructions: {
			household: getAiInstructions(householdId),
			now: cleanInstructions(form.get('instructions'))
		},
		labels: m.units.labels,
		wording: getRecipeWording(householdId)
	};
}

/**
 * A page's card as written — in the household's wording, when it chose one
 * and the card is German: the ingredient names only, since without a model a
 * word swap inside a sentence would break its grammar (→ plan 24).
 */
function cardDraft(
	card: NonNullable<RecipePage['card']>,
	photo: RecipePrefill['photo'],
	wording: RecipeWording | null
): RecipePrefill {
	const draft = draftFromCard(card, photo);
	const steps = draft.steps.map((step) => step.text);
	return { ...draft, ingredientLines: applyWording(draft.ingredientLines, steps, wording) };
}

/**
 * The line above an AI-made draft: check it over; what it was asked to change,
 * quoted; and who answered, when the backup had to.
 */
function aiNotice(result: Extracted, context: ImportContext, m: Messages): string {
	const t = m.cooking.import.ai;
	const { fellBackFrom, used } = result;
	return [
		t.note,
		context.instructions.now ? t.adapted(context.instructions.now) : '',
		fellBackFrom
			? t.usedBackup(
					m.ai.providers[used.provider].short,
					m.ai.providers[fellBackFrom.provider].short
				)
			: ''
	]
		.filter(Boolean)
		.join(' ');
}

/**
 * A link, read with or without AI (→ `fetch` and `extractPage`). A fetch
 * problem keeps the link on screen with its message; a page with no card offers
 * AI (or Settings); and a card the model couldn't improve still opens, as the
 * site wrote it, with the reason.
 *
 * `ai` is what was asked: `'ask'` for the "Try with AI" button, which only
 * means anything with a connection; `'if-set-up'` for the toggle, which a
 * remembered "on" may still send after AI was removed in Settings — that
 * import simply runs without it.
 */
async function importLink(event: RequestEvent, ai: 'off' | 'if-set-up' | 'ask') {
	const { householdId } = requireMember(event);
	const form = await event.request.formData();
	const m = catalog(event.locals.locale);
	const url = String(form.get('url') ?? '').trim();

	if (!url) return fail(400, { fetchError: m.cooking.import.error.invalidUrl, url });

	const connections = ai === 'off' ? [] : getAiConnections(householdId);
	if (ai === 'ask' && !connections.length) {
		return fail(400, { aiError: m.ai.error.noKey, url, noRecipe: true });
	}
	const withAi = connections.length > 0;

	let page: RecipePage;
	try {
		page = await readRecipePage(url);
	} catch (cause) {
		return fail(422, { fetchError: importErrorMessage(cause, m), url });
	}

	const context = contextFor(householdId, form, m);

	if (page.card) {
		// The photo downloads while the model works; the card opens with it either way.
		const photo = importPagePhoto(page);
		if (!withAi) return { draft: cardDraft(page.card, await photo, context.wording ?? null) };

		try {
			const result = await improveRecipe(connections, page.card, context);
			return {
				draft: { ...result.value, photo: await photo },
				notice: aiNotice(result, context, m)
			};
		} catch (cause) {
			return {
				draft: cardDraft(page.card, await photo, context.wording ?? null),
				notice: m.cooking.import.ai.withoutAi(aiImportErrorMessage(cause, m))
			};
		}
	}

	// Fetched fine, but no recipe card: the model reads the page text — or, with
	// AI off, `noRecipe` tells the screen to offer it (the button when a
	// connection is set up, the Settings hint when it isn't).
	if (!withAi) {
		return fail(422, { fetchError: m.cooking.import.error.noRecipe, url, noRecipe: true });
	}

	try {
		const result = await extractRecipe(connections, { text: page.text }, context);
		const photo = await importPagePhoto(page);
		return { draft: { ...result.value, photo }, notice: aiNotice(result, context, m) };
	} catch (cause) {
		const message =
			cause instanceof RecipeImportError
				? importErrorMessage(cause, m)
				: aiImportErrorMessage(cause, m);
		return fail(422, { aiError: message, url, noRecipe: true });
	}
}

export const actions: Actions = {
	/** A link → its draft, improved by AI when the screen's toggle says so. */
	fetch: async (event) => {
		const form = await event.request.clone().formData();
		return importLink(event, form.get('ai') === '1' ? 'if-set-up' : 'off');
	},

	/**
	 * "Try with AI" on a page with no recipe card. Re-fetches the URL the screen
	 * still shows (a fresh, explicit tap — cheaper than shipping the stripped page
	 * back and forth, → DECISIONS #112) and reads it with the model.
	 */
	extractPage: (event) => importLink(event, 'ask'),

	/** Extract from pasted text — the answer for bot-blocked (Cloudflare 403) sites. */
	extractText: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);
		const text = String(form.get('text') ?? '').trim();

		const connections = getAiConnections(householdId);
		if (!connections.length) return fail(400, { aiError: m.ai.error.noKey });
		// Keep whatever was pasted on screen so a miss isn't retyped.
		if (!text) return fail(400, { aiError: m.cooking.import.ai.error.noRecipe, aiText: text });

		const context = contextFor(householdId, form, m);
		try {
			const result = await extractRecipe(connections, { text }, context);
			const draft: RecipePrefill = { ...result.value, photo: null };
			return { draft, notice: aiNotice(result, context, m) };
		} catch (cause) {
			return fail(422, { aiError: aiImportErrorMessage(cause, m), aiText: text });
		}
	},

	/**
	 * Extract from 1–3 photos. Each is validated and re-encoded to WebP (EXIF
	 * stripped, ≤1200px) *before* it reaches the model (→ uploads.ts); the first is
	 * kept as the recipe's photo — stored only once the model has answered, so a
	 * failed import leaves no file behind. File problems are the uploader's words,
	 * model problems the AI import's.
	 */
	extractPhotos: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);

		const files = form
			.getAll('photos')
			.filter((entry): entry is File => entry instanceof File && entry.size > 0)
			.slice(0, MAX_PHOTOS);

		const connections = getAiConnections(householdId);
		if (!connections.length) return fail(400, { aiError: m.ai.error.noKey });
		if (!files.length) return fail(400, { aiError: m.cooking.import.ai.error.noPhotos });

		let webps: Buffer[];
		try {
			webps = await Promise.all(files.map((file) => reencodeUpload(file)));
		} catch (cause) {
			return fail(400, { aiError: uploadErrorMessage(cause, m) });
		}

		const context = contextFor(householdId, form, m);
		let result: Extracted;
		try {
			result = await extractRecipe(connections, { images: webps }, context);
		} catch (cause) {
			return fail(422, { aiError: aiImportErrorMessage(cause, m) });
		}

		// Keep the first photo as the recipe's — already re-encoded, so store the
		// bytes as they are rather than running them through sharp twice. A photo is
		// non-fatal (→ SPEC §4.7): if the disk balks, the extraction still stands and
		// the draft just opens without one, rather than losing a good result.
		let photo: RecipePrefill['photo'] = null;
		try {
			const imagePath = storeRecipePhoto(webps[0]);
			photo = { path: imagePath, preview: `data:image/webp;base64,${webps[0].toString('base64')}` };
		} catch {
			// Disk trouble — the recipe is still worth showing, just photo-less.
		}

		return { draft: { ...result.value, photo }, notice: aiNotice(result, context, m) };
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
