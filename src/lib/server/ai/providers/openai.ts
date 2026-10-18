/**
 * OpenAI (→ plan 20), over Chat Completions with `response_format: json_schema`
 * in strict mode — the request shape OpenRouter speaks too, which is why the
 * body and the reading are exported for `openrouter.ts`.
 *
 * No `temperature`: OpenAI's reasoning models reject anything but the default,
 * and a household can pick one of those as easily as not.
 */
import type { AiProvider } from '$lib/ai';
import { AiError, type GenerateRequest, type ProviderAdapter } from '../types';
import { isRecord, parseJsonText, requestJson } from '../http';

const PROVIDER = 'openai';

/** The Chat Completions body both OpenAI and OpenRouter take. */
export function chatCompletionsBody(
	model: string,
	request: GenerateRequest,
	/** OpenAI's reasoning models want `max_completion_tokens`; OpenRouter normalises `max_tokens`. */
	tokensField: 'max_completion_tokens' | 'max_tokens'
): Record<string, unknown> {
	return {
		model,
		messages: [
			{ role: 'system', content: request.system },
			{
				role: 'user',
				content: request.parts.map((part) =>
					part.type === 'text'
						? { type: 'text', text: part.text }
						: {
								type: 'image_url',
								image_url: { url: `data:image/webp;base64,${part.webp.toString('base64')}` }
							}
				)
			}
		],
		response_format: {
			type: 'json_schema',
			json_schema: { name: request.schemaName, strict: true, schema: request.schema }
		},
		[tokensField]: request.maxOutputTokens
	};
}

/** The first choice's JSON — or `bad-output` for a refusal, a cut-off, or no choice at all. */
export function readChatCompletion(body: unknown, provider: AiProvider): unknown {
	if (!isRecord(body)) throw new AiError('bad-output', provider);

	const choice = Array.isArray(body.choices) ? body.choices[0] : undefined;
	if (!isRecord(choice) || choice.finish_reason === 'length') {
		throw new AiError('bad-output', provider);
	}

	const message = choice.message;
	if (!isRecord(message) || message.refusal) throw new AiError('bad-output', provider);

	return parseJsonText(message.content, provider);
}

/**
 * Chat models only, as aliases rather than dated snapshots — the list a person
 * picks from, not every id the key can technically reach:
 * - audio, realtime, speech, image, search, embedding and moderation models
 *   don't answer this kind of prompt;
 * - `*-pro` models are Responses-API-only;
 * - `gpt-3.5` and the original `gpt-4` predate strict JSON output;
 * - `…-2025-08-07`, `…-0613` are snapshots of an alias that is already listed.
 */
const NOT_FOR_JSON =
	/audio|realtime|transcribe|tts|search|image|embedding|moderation|instruct|codex|computer-use|deep-research|oss|-pro\b|^gpt-3\.5|^gpt-4(?:-|$)|-\d{4}-\d{2}-\d{2}$|-\d{4}$/;

const CHAT = /^(?:gpt-|o\d)/;

export const openai: ProviderAdapter = {
	defaultBaseUrl: 'https://api.openai.com',

	async generate(call, request) {
		const body = await requestJson(
			PROVIDER,
			`${call.baseUrl}/v1/chat/completions`,
			{
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${call.apiKey}`
				},
				body: JSON.stringify(chatCompletionsBody(call.model, request, 'max_completion_tokens')),
				signal: call.signal
			},
			call.fetch
		);

		return readChatCompletion(body, PROVIDER);
	},

	async listModels(call) {
		const body = await requestJson(
			PROVIDER,
			`${call.baseUrl}/v1/models`,
			{ headers: { authorization: `Bearer ${call.apiKey}` }, signal: call.signal },
			call.fetch
		);
		const data = isRecord(body) && Array.isArray(body.data) ? body.data : [];

		return data
			.filter(
				(entry): entry is { id: string; created?: unknown } =>
					isRecord(entry) && typeof entry.id === 'string'
			)
			.filter((entry) => CHAT.test(entry.id) && !NOT_FOR_JSON.test(entry.id))
			.map((entry) => ({
				id: entry.id,
				label: entry.id,
				created: typeof entry.created === 'number' ? entry.created * 1000 : null,
				free: null,
				// The two early reasoning minis are text-only; the rest of the chat line reads images.
				vision: /^o[13]-mini/.test(entry.id) ? false : true
			}))
			.sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
	},

	recommend(models) {
		// Newest first already, so the first "-mini" is the current small model.
		return (
			models.find((model) => /^gpt-[\d.]+-mini$/.test(model.id))?.id ??
			models.find((model) => model.id.startsWith('gpt-'))?.id ??
			models[0]?.id ??
			null
		);
	}
};
