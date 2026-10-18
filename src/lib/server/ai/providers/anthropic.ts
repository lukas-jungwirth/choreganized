/**
 * Anthropic Claude (→ plan 20), over the Messages API with **structured
 * outputs** (`output_config.format`): the answer is a text block holding JSON
 * that matches the schema.
 *
 * Not a forced tool call — the current models (Opus 5.5, Sonnet 5.5, Fable 5.1)
 * refuse `tool_choice: tool` with a 400, while every model that does structured
 * outputs takes `output_config`. The live list is filtered to those models by
 * the capability flags the Models API reports.
 *
 * No `temperature` (removed on the current models) and no thinking settings:
 * the defaults are what every model accepts, and `max_tokens` leaves room for a
 * model that thinks before it answers.
 */
import { AiError, type ModelInfo, type ProviderAdapter } from '../types';
import { isRecord, parseJsonText, requestJson } from '../http';

const PROVIDER = 'anthropic';

/** The API version header every request carries. */
const VERSION = '2023-06-01';

function headers(apiKey: string): Record<string, string> {
	return { 'x-api-key': apiKey, 'anthropic-version': VERSION };
}

/** `capabilities.<name>.supported`, or null when the listing doesn't carry capabilities. */
function supports(entry: Record<string, unknown>, name: string): boolean | null {
	const capabilities = entry.capabilities;
	if (!isRecord(capabilities)) return null;
	const capability = capabilities[name];
	return isRecord(capability) && typeof capability.supported === 'boolean'
		? capability.supported
		: null;
}

export const anthropic: ProviderAdapter = {
	defaultBaseUrl: 'https://api.anthropic.com',

	async generate(call, request) {
		const body = await requestJson(
			PROVIDER,
			`${call.baseUrl}/v1/messages`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json', ...headers(call.apiKey) },
				body: JSON.stringify({
					model: call.model,
					max_tokens: request.maxOutputTokens,
					system: request.system,
					messages: [
						{
							role: 'user',
							content: request.parts.map((part) =>
								part.type === 'text'
									? { type: 'text', text: part.text }
									: {
											type: 'image',
											source: {
												type: 'base64',
												media_type: 'image/webp',
												data: part.webp.toString('base64')
											}
										}
							)
						}
					],
					output_config: { format: { type: 'json_schema', schema: request.schema } }
				}),
				signal: call.signal
			},
			call.fetch
		);

		// A refusal or a cut-off answer may not match the schema — don't read it.
		if (!isRecord(body) || body.stop_reason === 'refusal' || body.stop_reason === 'max_tokens') {
			throw new AiError('bad-output', PROVIDER);
		}

		const text = (Array.isArray(body.content) ? body.content : [])
			.filter((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
			.map((block) => (block as { text: string }).text)
			.join('');

		return parseJsonText(text, PROVIDER);
	},

	async listModels(call) {
		const models: ModelInfo[] = [];
		let after = '';

		for (let page = 0; page < 3; page++) {
			const query = new URLSearchParams({ limit: '1000' });
			if (after) query.set('after_id', after);

			const body = await requestJson(
				PROVIDER,
				`${call.baseUrl}/v1/models?${query}`,
				{ headers: headers(call.apiKey), signal: call.signal },
				call.fetch
			);
			if (!isRecord(body)) break;

			for (const entry of Array.isArray(body.data) ? body.data : []) {
				if (!isRecord(entry) || typeof entry.id !== 'string') continue;
				// Older models without structured outputs would 400 on every import.
				if (supports(entry, 'structured_outputs') === false) continue;

				const created = typeof entry.created_at === 'string' ? Date.parse(entry.created_at) : NaN;
				models.push({
					id: entry.id,
					label: typeof entry.display_name === 'string' ? entry.display_name : entry.id,
					created: Number.isFinite(created) ? created : null,
					free: null,
					vision: supports(entry, 'image_input') ?? true
				});
			}

			if (body.has_more !== true || typeof body.last_id !== 'string') break;
			after = body.last_id;
		}

		return models.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
	},

	recommend(models) {
		// Newest first already: the current Haiku is fast and cheap enough that a
		// recipe costs a fraction of a cent.
		return models.find((model) => /haiku/i.test(model.id))?.id ?? models[0]?.id ?? null;
	}
};
