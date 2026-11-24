/**
 * Recipe import [3c as the preview] (→ SPEC §4.7, plans 12, 13, 20, 22, 44).
 *
 * Every way in lands in the *same* editor — the AI never saves on its own:
 *   - `fetch`        — a link. With an AI provider set up, the model reads the
 *                      page's recipe card and its text in one call and the gate
 *                      checks the answer (→ `services/ai-import.ts`); without
 *                      one, or when both providers fail, the card is read by
 *                      rules (→ `utils/rule-draft.ts`). No switch: setting up a
 *                      provider is the go-ahead (DECISIONS #315). A page with
 *                      no card needs the model.
 *   - `extractText`  — recipe text pasted by hand (the answer for 403 sites).
 *   - `extractPhotos`— 1–3 photos of a cookbook / magazine page.
 * The AI paths need the household's own AI connection (→ services/ai.ts) and
 * take its standing instructions plus a line typed for this import. Every
 * draft carries the gate's check items, which the review screen (plan 45,
 * `?draft=`) marks on the recipe; the page keeps the draft in the browser.
 *
 * `save` is the recipe editor's usual create, plus attaching whatever photo the
 * import produced. Nothing is persisted before Save but the temp photo file; an
 * abandoned import's photo is collected by the nightly sweep (→ cron.ts, uploads.ts).
 */
import { fail, redirect } from '@sveltejs/kit';
import { cleanInstructions } from '$lib/ai';
import { catalog, type Messages } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import {
	cardSuggestion,
	importErrorMessage,
	importPagePhoto,
	readRecipePage,
	RecipeImportError,
	type RecipePage
} from '$lib/server/recipe-import';
import { getAiConnections, getAiInstructions, isAiEnabled } from '$lib/server/services/ai';
import {
	aiImportErrorMessage,
	importPage,
	importRecipe,
	type Extracted,
	type ImportContext
} from '$lib/server/services/ai-import';
import {
	claimImportedPhoto,
	createRecipe,
	discardImportedPhoto
} from '$lib/server/services/recipes';
import { listUnits } from '$lib/server/services/units';
import {
	reencodeUpload,
	storePhotoFromForm,
	storeRecipePhoto,
	uploadErrorMessage
} from '$lib/server/uploads';
import { readDraftId } from '$lib/utils/recipe-review';
import { mergeSuggestions, readRecipeForm, type RecipePrefill } from '$lib/utils/recipes';
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
		aiInstructions: getAiInstructions(householdId),
		// The household's own unit words: the draft's lines are read with them,
		// and the unit panel offers them (→ plan 46).
		units: listUnits(householdId).map((unit) => unit.word),
		// An import under review (→ plan 45): its id names the draft this tab keeps
		// in `sessionStorage`, so the address survives a reload; `edit` opens it in
		// the full editor.
		draft: readDraftId(event.url.searchParams),
		edit: event.url.searchParams.get('edit') === '1'
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

/**
 * What every import here is read with: both instruction lines, the reader's
 * units, and the household's own unit words (→ plan 44, DECISIONS #321).
 */
function contextFor(householdId: string, form: FormData, m: Messages): ImportContext {
	return {
		instructions: {
			household: getAiInstructions(householdId),
			now: cleanInstructions(form.get('instructions'))
		},
		labels: m.units.labels,
		units: listUnits(householdId).map((unit) => unit.word)
	};
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

export const actions: Actions = {
	/**
	 * A link → its draft. A fetch problem keeps the link on screen with its
	 * message; a page with no card and no provider says so (and points at
	 * Settings); a card the model could not read still opens, by rules, with the
	 * reason.
	 */
	fetch: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();
		const m = catalog(event.locals.locale);
		const url = String(form.get('url') ?? '').trim();

		if (!url) return fail(400, { fetchError: m.cooking.import.error.invalidUrl, url });

		let page: RecipePage;
		try {
			page = await readRecipePage(url);
		} catch (cause) {
			// A site that turns the server away still opens in the browser: the screen
			// points at the ways to bring the recipe over from there.
			const refused = cause instanceof RecipeImportError && cause.code === 'refused';
			return fail(422, { fetchError: importErrorMessage(cause, m), url, refused });
		}

		const connections = getAiConnections(householdId);
		// Fetched fine, but no card and nobody to read the text: the screen says so.
		if (!page.card && !connections.length) {
			return fail(422, { fetchError: m.cooking.import.error.noRecipe, url, noRecipe: true });
		}

		const context = contextFor(householdId, form, m);
		// The photo downloads while the model works.
		const photo = importPagePhoto(page);
		const fromPage = page.card ? cardSuggestion(page.card) : null;

		try {
			const imported = await importPage(connections, page, context);
			if (imported.by === 'ai') {
				return {
					draft: {
						...imported.result.value,
						photo: await photo,
						// The page's own word first; the model's fills what it left out (→ plan 41).
						suggested: mergeSuggestions(fromPage, imported.result.value.suggested)
					},
					notice: aiNotice(imported.result, context, m)
				};
			}
			return {
				draft: { ...imported.draft, photo: await photo, suggested: fromPage },
				notice: imported.cause
					? m.cooking.import.ai.withoutAi(aiImportErrorMessage(imported.cause, m))
					: undefined
			};
		} catch (cause) {
			await photo.then((taken) => taken && discardImportedPhoto(taken.path)).catch(() => {});
			return fail(422, { aiError: aiImportErrorMessage(cause, m), url, noRecipe: true });
		}
	},

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
			const result = await importRecipe(connections, { card: null, text }, context);
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
			result = await importRecipe(connections, { images: webps }, context);
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
			if (imported) discardImportedPhoto(imported);
		} else if (form.get('removePhoto') === '1') {
			imagePath = null;
			if (imported) discardImportedPhoto(imported);
		} else {
			// Attach the imported temp — but only if it's genuinely an unclaimed
			// temp file (→ `claimImportedPhoto`); a forged path drops to no photo.
			imagePath = imported ? claimImportedPhoto(imported) : null;
		}

		const id = createRecipe(householdId, member.id, parsed.input, imagePath);
		redirect(303, `/cooking/recipes/${id}`);
	}
};
