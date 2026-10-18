/**
 * Google Gemini (→ plan 20), over the Generative Language REST API:
 * `models/{model}:generateContent` with JSON output constrained by a
 * `responseSchema`, and `models` for the live list.
 *
 * The key travels in the `x-goog-api-key` header rather than `?key=` so it
 * never lands in a URL — a URL is what proxies and error reports print.
 *
 * No `temperature`: Google asks for the default on its current models (lower
 * values make them loop), and the schema already pins the answer's shape.
 */
import { AiError, type ModelInfo, type ProviderAdapter } from '../types';
import { isRecord, parseJsonText, requestJson } from '../http';
import { toGeminiSchema } from '../schema';

const PROVIDER = 'gemini';

/** The aliases Google keeps pointed at its current models — the ones that never go stale. */
const LATEST = /-latest$/;

/**
 * Generation models that can't answer a text-and-images prompt with JSON:
 * embeddings, image/video/music/speech generators, live audio, and Gemma (which
 * the API serves without system instructions or JSON mode).
 */
const NOT_FOR_JSON =
	/embed|aqa|imagen|veo|lyria|tts|audio|live|image|learnlm|gemma|robotics|computer-use/i;

/** A model id as the sheet shows it — the API prefixes every name with `models/`. */
function bare(name: string): string {
	return name.replace(/^models\//, '');
}

export const gemini: ProviderAdapter = {
	defaultBaseUrl: 'https://generativelanguage.googleapis.com',

	async generate(call, request) {
		const body = await requestJson(
			PROVIDER,
			`${call.baseUrl}/v1beta/models/${encodeURIComponent(bare(call.model))}:generateContent`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-goog-api-key': call.apiKey },
				body: JSON.stringify({
					systemInstruction: { parts: [{ text: request.system }] },
					contents: [
						{
							role: 'user',
							parts: request.parts.map((part) =>
								part.type === 'text'
									? { text: part.text }
									: { inlineData: { mimeType: 'image/webp', data: part.webp.toString('base64') } }
							)
						}
					],
					generationConfig: {
						responseMimeType: 'application/json',
						responseSchema: toGeminiSchema(request.schema),
						maxOutputTokens: request.maxOutputTokens
					}
				}),
				signal: call.signal
			},
			call.fetch
		);

		if (!isRecord(body)) throw new AiError('bad-output', PROVIDER);

		const candidate = Array.isArray(body.candidates) ? body.candidates[0] : undefined;
		// Blocked prompts come back with no candidate and a `promptFeedback.blockReason`;
		// a cut-off answer says MAX_TOKENS. Neither is the JSON we asked for.
		if (!isRecord(candidate) || candidate.finishReason === 'MAX_TOKENS') {
			throw new AiError('bad-output', PROVIDER);
		}

		const content = candidate.content;
		const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
		// A thinking model may return its thought summary as a part of its own.
		const text = parts
			.filter((part) => isRecord(part) && typeof part.text === 'string' && !part.thought)
			.map((part) => (part as { text: string }).text)
			.join('');

		return parseJsonText(text, PROVIDER);
	},

	async listModels(call) {
		const models: ModelInfo[] = [];
		let pageToken = '';

		// One page of 1000 holds today's list several times over; the loop is for
		// the day it doesn't, capped so a misbehaving token can't spin.
		for (let page = 0; page < 3; page++) {
			const query = new URLSearchParams({ pageSize: '1000' });
			if (pageToken) query.set('pageToken', pageToken);

			const body = await requestJson(
				PROVIDER,
				`${call.baseUrl}/v1beta/models?${query}`,
				{ headers: { 'x-goog-api-key': call.apiKey }, signal: call.signal },
				call.fetch
			);
			if (!isRecord(body)) break;

			for (const entry of Array.isArray(body.models) ? body.models : []) {
				if (!isRecord(entry) || typeof entry.name !== 'string') continue;
				const methods = Array.isArray(entry.supportedGenerationMethods)
					? entry.supportedGenerationMethods
					: [];
				const id = bare(entry.name);
				if (!methods.includes('generateContent') || NOT_FOR_JSON.test(id)) continue;

				models.push({
					id,
					label: typeof entry.displayName === 'string' ? entry.displayName : id,
					created: null,
					free: null,
					// Every Gemini model reads images; the listing just doesn't say so.
					vision: id.startsWith('gemini') ? true : null
				});
			}

			pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : '';
			if (!pageToken) break;
		}

		// No dates in this listing: the `-latest` aliases first (they follow Google's
		// releases by themselves), then newest-looking ids, so "gemini-3…" sorts
		// above "gemini-2.5…".
		return models.sort((a, b) => {
			const latest = Number(LATEST.test(b.id)) - Number(LATEST.test(a.id));
			return latest || b.id.localeCompare(a.id, 'en', { numeric: true });
		});
	},

	recommend(models) {
		const ids = models.map((model) => model.id);
		if (ids.includes('gemini-flash-latest')) return 'gemini-flash-latest';
		return ids.find((id) => /flash/.test(id) && !/lite/.test(id)) ?? ids[0] ?? null;
	}
};
