/**
 * AI recipe extraction (→ SPEC §4.7, plan 13) — the fallback for what plan 12's
 * JSON-LD link import can't read: a page with no `Recipe` markup, text pasted
 * from a bot-blocked site, or photos of a cookbook page. Given a household's own
 * Google Gemini key, one model call turns text or images into the same
 * `RecipePrefill` the link importer produces, so every path lands in the same
 * editor — **the AI never saves anything on its own** (→ SPEC §4.7).
 *
 * Ingredients come back as **raw lines**, exactly as the recipe writes them, and
 * flow through the editor's own `$lib/utils/ingredients` parse — one convergent
 * path from typed input, link import, and here.
 *
 * The key is built into a client **per call** (it's per household, never a module
 * singleton) and never logged. The model is asked for structured JSON via a
 * `responseSchema`; failures are a typed `AiImportError` the import screen
 * translates. Gemini has no typed error hierarchy — a rejected key is a 400
 * "API key not valid" rather than an auth-error class — so mapping branches on
 * `ApiError.status` (→ DECISIONS).
 */
import { ApiError, GoogleGenAI, Type, type ContentListUnion } from '@google/genai';
import { env } from '$env/dynamic/private';
import type { Messages } from '$lib/i18n';
import {
	INGREDIENT_LINE_MAX,
	INGREDIENTS_MAX,
	RECIPE_NAME_MAX,
	RECIPE_SERVINGS_MAX,
	RECIPE_TIME_MAX,
	STEP_TEXT_MAX,
	STEPS_MAX,
	type RecipePrefill
} from '$lib/utils/recipes';

/**
 * The Gemini model, resolved per call. `gemini-flash-latest` is an **alias Google
 * keeps pointed at the current Flash model** — vision-capable, cents an extraction
 * — so it survives Google's aggressive (often early) model retirements: a pinned
 * `gemini-2.5-flash` started 404-ing "no longer available" mid-2026, weeks before
 * its own scheduled shutdown (→ DECISIONS). `GEMINI_MODEL` in the env overrides it
 * without a code change if a rotation ever needs a specific id. Read lazily
 * because `$env/dynamic/private` is empty during the build (→ uploads.ts).
 */
function resolveModel(): string {
	return env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
}

/** A generous ceiling on pasted / page-stripped text; past this it isn't a recipe. */
const MAX_TEXT_CHARS = 40_000;

/** Photos arrive already re-encoded to WebP (→ uploads.ts); Gemini decodes it natively. */
const IMAGE_MIME = 'image/webp';

export type AiImportErrorCode =
	/** No key configured — the UI gates on this, so it's a guard, not a path. */
	| 'no-key'
	/** The key was refused (400 "API key not valid", or 401 / 403). */
	| 'bad-key'
	/** Rate limited (429) — most likely the free tier's per-minute cap. */
	| 'rate-limited'
	/** The model 404'd — retired, or a bad `GEMINI_MODEL` override (→ resolveModel). */
	| 'model-unavailable'
	/** The model returned nothing usable, or the input held no recipe. */
	| 'no-recipe'
	/** Anything else — network, a 5xx, a shape we didn't expect. */
	| 'failed';

export class AiImportError extends Error {
	constructor(readonly code: AiImportErrorCode) {
		super(code);
		this.name = 'AiImportError';
	}
}

/** The service's refusals, in the import screen's words (→ `cooking.import.ai.error`). */
export function aiImportErrorMessage(cause: unknown, m: Messages): string {
	const code: AiImportErrorCode = cause instanceof AiImportError ? cause.code : 'failed';

	switch (code) {
		case 'no-key':
			return m.cooking.import.ai.error.noKey;
		case 'bad-key':
			return m.cooking.import.ai.error.badKey;
		case 'rate-limited':
			return m.cooking.import.ai.error.rateLimited;
		case 'model-unavailable':
			return m.cooking.import.ai.error.modelUnavailable;
		case 'no-recipe':
			return m.cooking.import.ai.error.noRecipe;
		case 'failed':
			return m.cooking.import.ai.error.failed;
	}
}

/**
 * The rules every extraction runs under, kept in the system instruction so the
 * same prompt governs text and photos. Extraction only: no invented amounts, and
 * **no translating** — recipe content is the household's, in its own language
 * (→ SPEC §9).
 */
const SYSTEM_INSTRUCTION = [
	'You extract a single cooking recipe from the text or images the user provides.',
	'Return only what is actually present — never invent or guess amounts, times, or steps.',
	'Keep the source language exactly: a German recipe stays German, do not translate anything.',
	'Each ingredient is one raw line as written ("500 g Mehl", "2 eggs") — amount and name together, no bullet or numbering.',
	'Steps are the method in order, one instruction per step, with no leading step numbers.',
	'If the input contains no recipe, return an empty name with empty ingredients and steps.'
].join(' ');

/**
 * The shape the model must return — a hand-written schema (no zod in the tree).
 * Name/ingredients/steps are required; time and servings are optional and may be
 * null. `propertyOrdering` keeps the JSON stable across calls.
 */
const RESPONSE_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		name: { type: Type.STRING, description: 'The recipe title, in its own language.' },
		timeMinutes: {
			type: Type.INTEGER,
			nullable: true,
			description: 'Total time in whole minutes, or null if not stated.'
		},
		servings: {
			type: Type.INTEGER,
			nullable: true,
			description: 'Number of servings, or null if not stated.'
		},
		ingredients: {
			type: Type.ARRAY,
			items: { type: Type.STRING },
			description: 'Raw ingredient lines, each with amount and name together.'
		},
		steps: {
			type: Type.ARRAY,
			items: { type: Type.STRING },
			description: 'The method, one step per item, in order.'
		}
	},
	required: ['name', 'ingredients', 'steps'],
	propertyOrdering: ['name', 'timeMinutes', 'servings', 'ingredients', 'steps']
};

/** A recipe from pasted text, or from a page stripped to readable text (→ recipe-import.ts). */
export async function extractRecipeFromText(apiKey: string, text: string): Promise<RecipePrefill> {
	const trimmed = text.slice(0, MAX_TEXT_CHARS).trim();
	// Nothing to read — a page that stripped to no prose, or an empty paste. Don't
	// spend a (billed) call to be told the input was empty; that's simply "no recipe".
	if (!trimmed) throw new AiImportError('no-recipe');
	return extract(apiKey, trimmed);
}

/**
 * A recipe from 1–3 photos, already validated and re-encoded to WebP by the
 * caller (→ uploads.ts). The images lead and the instruction follows, the way
 * Gemini's multimodal prompts read.
 */
export function extractRecipeFromImages(apiKey: string, images: Buffer[]): Promise<RecipePrefill> {
	const parts = [
		...images.map((webp) => ({
			inlineData: { mimeType: IMAGE_MIME, data: webp.toString('base64') }
		})),
		{ text: 'Extract the recipe shown in these photos.' }
	];

	return extract(apiKey, parts);
}

/**
 * A "does this key work?" probe for Settings (→ plan 14): a tiny generation on
 * the same model extraction uses, so a green result really means "extraction
 * will work", not merely "the key is well-formed". Resolves on success; throws a
 * typed `AiImportError` (`bad-key` / `rate-limited` / `failed`) otherwise.
 */
export async function testGeminiKey(apiKey: string): Promise<void> {
	const ai = new GoogleGenAI({ apiKey });
	try {
		await ai.models.generateContent({
			model: resolveModel(),
			contents: 'ping',
			config: { maxOutputTokens: 16, temperature: 0 }
		});
	} catch (cause) {
		throw mapSdkError(cause);
	}
}

/** The single model call both paths share. `contents` is text or an array of parts. */
async function extract(apiKey: string, contents: ContentListUnion): Promise<RecipePrefill> {
	const ai = new GoogleGenAI({ apiKey });

	let raw: string | undefined;
	try {
		const response = await ai.models.generateContent({
			model: resolveModel(),
			contents,
			config: {
				systemInstruction: SYSTEM_INSTRUCTION,
				responseMimeType: 'application/json',
				responseSchema: RESPONSE_SCHEMA,
				// Extraction, not invention: pin it to the single most likely reading.
				temperature: 0
			}
		});
		raw = response.text;
	} catch (cause) {
		throw mapSdkError(cause);
	}

	return toPrefill(parseJson(raw));
}

/**
 * Map the SDK's errors to ours. Gemini throws a single `ApiError` carrying the
 * HTTP status (no `AuthenticationError`/`RateLimitError` classes to catch), so
 * the reading is by status — a rejected key is a 400 whose message names the key,
 * or a 401/403 (→ DECISIONS). The raw error is never surfaced.
 */
function mapSdkError(cause: unknown): AiImportError {
	if (cause instanceof ApiError) {
		if (cause.status === 429) return new AiImportError('rate-limited');
		if (cause.status === 401 || cause.status === 403) return new AiImportError('bad-key');
		if (cause.status === 400 && /api[\s_-]?key/i.test(cause.message)) {
			return new AiImportError('bad-key');
		}
		// 404 = the model path wasn't found: retired (Google does this early), or a
		// bad `GEMINI_MODEL` override. Distinct from a transient failure (→ DECISIONS).
		if (cause.status === 404) return new AiImportError('model-unavailable');
	}
	return new AiImportError('failed');
}

/** Structured output is meant to be valid JSON; an empty or unparseable reply is "no recipe". */
function parseJson(raw: string | undefined): unknown {
	if (!raw || !raw.trim()) throw new AiImportError('no-recipe');
	try {
		return JSON.parse(raw);
	} catch {
		throw new AiImportError('no-recipe');
	}
}

/**
 * The model's object → the editor's prefill, clamped to the same limits typed and
 * link-imported recipes are (→ `$lib/utils/recipes`) so a long or paste-bomb reply
 * can't overfill the editor. A reply with no name and no ingredients and no steps
 * is "couldn't find a recipe" — a photo of a cat, a page that wasn't one.
 */
function toPrefill(data: unknown): RecipePrefill {
	if (!isObject(data)) throw new AiImportError('no-recipe');

	const name = typeof data.name === 'string' ? data.name.trim() : '';
	const ingredientLines = toLines(data.ingredients, INGREDIENT_LINE_MAX, INGREDIENTS_MAX);
	const steps = toLines(data.steps, STEP_TEXT_MAX, STEPS_MAX);

	if (!name && !ingredientLines.length && !steps.length) {
		throw new AiImportError('no-recipe');
	}

	return {
		name: name.slice(0, RECIPE_NAME_MAX),
		timeMinutes: clampCount(data.timeMinutes, RECIPE_TIME_MAX),
		servings: clampCount(data.servings, RECIPE_SERVINGS_MAX),
		ingredientLines,
		steps,
		// The photo, when there is one, is attached by the action from the first
		// uploaded image — the model never sees or returns it.
		photo: null
	};
}

/** String items only, whitespace-collapsed, blanks dropped, capped by length then count. */
function toLines(value: unknown, lineMax: number, rowMax: number): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === 'string')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.map((line) => line.slice(0, lineMax))
		.slice(0, rowMax);
}

/** Whole, positive, capped — or nothing, which the editor's two number fields allow. */
function clampCount(value: unknown, max: number): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	const rounded = Math.round(Math.min(Math.max(value, 0), max));
	return rounded > 0 ? rounded : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
