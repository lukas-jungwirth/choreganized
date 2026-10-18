/**
 * OpenRouter (→ plan 20): one key in front of many providers' models, free
 * ones among them — the easiest backup a household can add. It speaks OpenAI's
 * Chat Completions, so the request is `openai.ts`'s, plus
 * `provider.require_parameters` so a call is only routed to a host that
 * actually enforces the JSON schema.
 *
 * Its model list is public, so listing alone proves nothing about a key:
 * `GET /key` is asked first, and a refused key stops there.
 */
import type { ModelInfo, ProviderAdapter } from '../types';
import { isRecord, requestJson } from '../http';
import { chatCompletionsBody, readChatCompletion } from './openai';

const PROVIDER = 'openrouter';

function priced(value: unknown): number {
	return typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
}

export const openrouter: ProviderAdapter = {
	defaultBaseUrl: 'https://openrouter.ai/api/v1',

	async generate(call, request) {
		const body = await requestJson(
			PROVIDER,
			`${call.baseUrl}/chat/completions`,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${call.apiKey}`
				},
				body: JSON.stringify({
					...chatCompletionsBody(call.model, request, 'max_tokens'),
					provider: { require_parameters: true }
				}),
				signal: call.signal
			},
			call.fetch
		);

		return readChatCompletion(body, PROVIDER);
	},

	async listModels(call) {
		const auth = { authorization: `Bearer ${call.apiKey}` };

		// The key check — the listing below would answer for any key at all.
		await requestJson(
			PROVIDER,
			`${call.baseUrl}/key`,
			{ headers: auth, signal: call.signal },
			call.fetch
		);

		const body = await requestJson(
			PROVIDER,
			`${call.baseUrl}/models`,
			{ headers: auth, signal: call.signal },
			call.fetch
		);
		const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];

		const models: ModelInfo[] = [];
		for (const entry of data) {
			if (!isRecord(entry) || typeof entry.id !== 'string') continue;
			const parameters = Array.isArray(entry.supported_parameters)
				? entry.supported_parameters
				: [];
			// Without schema enforcement a model answers in whatever shape it likes.
			if (!parameters.includes('structured_outputs')) continue;

			const pricing = isRecord(entry.pricing) ? entry.pricing : {};
			const architecture = isRecord(entry.architecture) ? entry.architecture : {};
			const modalities = Array.isArray(architecture.input_modalities)
				? architecture.input_modalities
				: [];

			models.push({
				id: entry.id,
				label: typeof entry.name === 'string' ? entry.name : entry.id,
				created: typeof entry.created === 'number' ? entry.created * 1000 : null,
				free:
					entry.id.endsWith(':free') ||
					(priced(pricing.prompt) === 0 && priced(pricing.completion) === 0),
				vision: modalities.includes('image')
			});
		}

		// Free first — that is what a household comes to OpenRouter for — then newest.
		return models.sort(
			(a, b) => Number(b.free) - Number(a.free) || (b.created ?? 0) - (a.created ?? 0)
		);
	},

	recommend(models) {
		return (
			models.find((model) => model.free && model.vision)?.id ??
			models.find((model) => model.free)?.id ??
			models[0]?.id ??
			null
		);
	}
};
