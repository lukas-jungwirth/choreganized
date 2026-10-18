/**
 * AI recipe extraction (→ SPEC §4.7, plans 13 & 20) — the fallback for what plan
 * 12's JSON-LD link import can't read: a page with no `Recipe` markup, text
 * pasted from a bot-blocked site, or photos of a cookbook page. One model call,
 * on the household's own provider and model (→ `services/ai.ts`), turns text or
 * images into the same `RecipePrefill` the link importer produces, so every path
 * lands in the same editor — **the AI never saves anything on its own**
 * (→ SPEC §4.7).
 *
 * Ingredients come back as **raw lines**, exactly as the recipe writes them, and
 * flow through the editor's own `$lib/utils/ingredients` parse — one convergent
 * path from typed input, link import, and here.
 *
 * The call goes through `generateWithFallback`, so a household with a backup
 * gets an answer when its main provider is at its limit; which one answered
 * rides back with the draft for the screen to say.
 */
import type { AiProvider } from '$lib/ai';
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
import { generateWithFallback, type Answered, type Connection, type RunOptions } from '../ai/run';
import { array, integer, nullable, object, string } from '../ai/schema';
import { AiError, type AiPart } from '../ai/types';
import { aiErrorMessage } from './ai';

/** A generous ceiling on pasted / page-stripped text; past this it isn't a recipe. */
const MAX_TEXT_CHARS = 40_000;

/** Room for a long recipe's JSON — and for a model that thinks before it answers. */
const MAX_OUTPUT_TOKENS = 16_000;

export type AiImportErrorCode =
	/** No connection configured — the UI gates on this, so it's a guard, not a path. */
	| 'no-key'
	/** The model returned nothing usable, or the input held no recipe. */
	| 'no-recipe';

/** The import's own refusals; provider failures are `AiError`s (→ `server/ai`). */
export class AiImportError extends Error {
	constructor(readonly code: AiImportErrorCode) {
		super(code);
		this.name = 'AiImportError';
	}
}

/** Any extraction failure in the import screen's words. */
export function aiImportErrorMessage(cause: unknown, m: Messages): string {
	if (cause instanceof AiImportError) {
		return cause.code === 'no-key' ? m.ai.error.noKey : m.cooking.import.ai.error.noRecipe;
	}
	return aiErrorMessage(cause, m);
}

/** A draft, and which connection produced it. */
export type Extracted = Answered<RecipePrefill>;

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
 * The shape the model must return, in the strict subset every provider takes
 * (→ `server/ai/schema.ts`): everything required, "not stated" as null.
 */
const RESPONSE_SCHEMA = object({
	name: string({ description: 'The recipe title, in its own language.' }),
	timeMinutes: nullable(
		integer({ description: 'Total time in whole minutes, or null if not stated.' })
	),
	servings: nullable(integer({ description: 'Number of servings, or null if not stated.' })),
	ingredients: array(string(), {
		description: 'Raw ingredient lines, each with amount and name together.'
	}),
	steps: array(string(), { description: 'The method, one step per item, in order.' })
});

/** A recipe from pasted text, or from a page stripped to readable text (→ recipe-import.ts). */
export async function extractRecipeFromText(
	connections: Connection[],
	text: string,
	options?: RunOptions
): Promise<Extracted> {
	const trimmed = text.slice(0, MAX_TEXT_CHARS).trim();
	// Nothing to read — a page that stripped to no prose, or an empty paste. Don't
	// spend a (billed) call to be told the input was empty; that's simply "no recipe".
	if (!trimmed) throw new AiImportError('no-recipe');
	return extract(connections, [{ type: 'text', text: trimmed }], options);
}

/**
 * A recipe from 1–3 photos, already validated and re-encoded to WebP by the
 * caller (→ uploads.ts). The images lead and the instruction follows, the way
 * multimodal prompts read best on every provider.
 */
export function extractRecipeFromImages(
	connections: Connection[],
	images: Buffer[],
	options?: RunOptions
): Promise<Extracted> {
	const parts: AiPart[] = [
		...images.map((webp) => ({ type: 'image' as const, webp })),
		{ type: 'text', text: 'Extract the recipe shown in these photos.' }
	];

	return extract(connections, parts, { ...options, needsVision: true });
}

/** The single model call both paths share. */
function extract(
	connections: Connection[],
	parts: AiPart[],
	options?: RunOptions
): Promise<Extracted> {
	if (!connections.length) throw new AiImportError('no-key');

	return generateWithFallback(
		connections,
		{
			system: SYSTEM_INSTRUCTION,
			parts,
			schema: RESPONSE_SCHEMA,
			schemaName: 'recipe',
			maxOutputTokens: MAX_OUTPUT_TOKENS
		},
		toPrefill,
		options
	);
}

/**
 * The model's object → the editor's prefill, clamped to the same limits typed and
 * link-imported recipes are (→ `$lib/utils/recipes`) so a long or paste-bomb reply
 * can't overfill the editor. A reply with no name and no ingredients and no steps
 * is "couldn't find a recipe" — a photo of a cat, a page that wasn't one.
 */
function toPrefill(data: unknown, provider: AiProvider): RecipePrefill {
	// Not the object the schema promised: the provider's failure, so the backup
	// gets a turn (→ `server/ai/run.ts`). An empty recipe below is not — that is
	// the model saying there was nothing to find.
	if (!isObject(data)) throw new AiError('bad-output', provider);

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
