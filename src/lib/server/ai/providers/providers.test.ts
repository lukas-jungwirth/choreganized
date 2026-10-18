/**
 * The four adapters against canned API answers (→ plan 20). Nothing here
 * talks to a provider: each test hands the adapter a fake `fetch`, then reads
 * back what it would have sent and what it made of the answer. That pins the
 * parts a real key can't cheaply re-check on every change — where the key goes
 * (a header, never the URL), the JSON-output switch each provider calls by a
 * different name, the absence of `temperature`, and which models a listing
 * keeps.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { object, string } from '../schema';
import { AiError, type AiCall, type GenerateRequest } from '../types';
import { anthropic } from './anthropic';
import { gemini } from './gemini';
import { openai } from './openai';
import { openrouter } from './openrouter';

type Sent = { url: string; init: RequestInit; body: Record<string, unknown> | null };

/** A fetch that records each request and answers from a list, in order. */
function recorder(...answers: Response[]) {
	const sent: Sent[] = [];
	const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
		const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
		sent.push({ url: String(input), init, body });
		const answer = answers.shift();
		if (!answer) throw new Error(`unexpected request to ${String(input)}`);
		return answer;
	}) as typeof fetch;
	return { sent, fetcher };
}

const KEY = 'test-key-0123456789abcdef';

const request: GenerateRequest = {
	system: 'Extract the recipe.',
	parts: [
		{ type: 'image', webp: Buffer.from('webp-bytes') },
		{ type: 'text', text: 'Pancakes: 200 g flour' }
	],
	schema: object({ name: string() }),
	schemaName: 'recipe',
	maxOutputTokens: 16000
};

function call(fetcher: typeof fetch, baseUrl: string): AiCall {
	return { baseUrl, apiKey: KEY, model: 'some-model', fetch: fetcher };
}

function headersOf(sent: Sent): Record<string, string> {
	return sent.init.headers as Record<string, string>;
}

describe('gemini', () => {
	const base = 'https://gemini.test';

	it('sends JSON mode with a Gemini-dialect schema, the key in a header, and no temperature', async () => {
		const { sent, fetcher } = recorder(
			Response.json({
				candidates: [
					{
						content: {
							parts: [{ text: 'thinking…', thought: true }, { text: '{"name":"Pancakes"}' }]
						},
						finishReason: 'STOP'
					}
				]
			})
		);

		const result = await gemini.generate(call(fetcher, base), request);

		assert.deepEqual(result, { name: 'Pancakes' });
		assert.equal(sent[0].url, `${base}/v1beta/models/some-model:generateContent`);
		assert.equal(headersOf(sent[0])['x-goog-api-key'], KEY);
		assert.ok(!sent[0].url.includes(KEY), 'the key never rides in the URL');

		const config = sent[0].body!.generationConfig as Record<string, unknown>;
		assert.equal(config.responseMimeType, 'application/json');
		assert.equal((config.responseSchema as Record<string, unknown>).type, 'OBJECT');
		assert.equal('temperature' in config, false);

		const parts = (sent[0].body!.contents as { parts: Record<string, unknown>[] }[])[0].parts;
		assert.deepEqual(parts[0], {
			inlineData: { mimeType: 'image/webp', data: Buffer.from('webp-bytes').toString('base64') }
		});
		assert.deepEqual(parts[1], { text: 'Pancakes: 200 g flour' });
	});

	it('calls a cut-off or blocked answer bad output', async () => {
		for (const answer of [
			{ candidates: [{ content: { parts: [{ text: '{"na' }] }, finishReason: 'MAX_TOKENS' }] },
			{ promptFeedback: { blockReason: 'SAFETY' } }
		]) {
			const { fetcher } = recorder(Response.json(answer));
			await assert.rejects(
				gemini.generate(call(fetcher, base), request),
				(cause: unknown) => cause instanceof AiError && cause.code === 'bad-output'
			);
		}
	});

	it('lists generateContent models, drops the non-JSON families, and puts the aliases first', async () => {
		const { sent, fetcher } = recorder(
			Response.json({
				models: [
					{
						name: 'models/gemini-2.5-flash',
						displayName: 'Gemini 2.5 Flash',
						supportedGenerationMethods: ['generateContent']
					},
					{
						name: 'models/gemini-3-flash',
						displayName: 'Gemini 3 Flash',
						supportedGenerationMethods: ['generateContent']
					},
					{
						name: 'models/gemini-flash-latest',
						displayName: 'Gemini Flash Latest',
						supportedGenerationMethods: ['generateContent']
					},
					{ name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
					{
						name: 'models/gemini-2.5-flash-preview-tts',
						supportedGenerationMethods: ['generateContent']
					},
					{ name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] },
					{ name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['predict'] }
				]
			})
		);

		const models = await gemini.listModels({ baseUrl: base, apiKey: KEY, fetch: fetcher });

		assert.deepEqual(
			models.map((model) => model.id),
			['gemini-flash-latest', 'gemini-3-flash', 'gemini-2.5-flash']
		);
		assert.equal(gemini.recommend(models), 'gemini-flash-latest');
		assert.equal(headersOf(sent[0])['x-goog-api-key'], KEY);
	});

	it('reads a refused key off the listing — the check before Save', async () => {
		const { fetcher } = recorder(
			Response.json(
				{
					error: {
						code: 400,
						message: 'API key not valid.',
						details: [{ reason: 'API_KEY_INVALID' }]
					}
				},
				{ status: 400 }
			)
		);
		await assert.rejects(
			gemini.listModels({ baseUrl: base, apiKey: KEY, fetch: fetcher }),
			(cause: unknown) =>
				cause instanceof AiError && cause.code === 'bad-key' && cause.provider === 'gemini'
		);
	});
});

describe('openai', () => {
	const base = 'https://openai.test';

	it('sends strict json_schema output, max_completion_tokens, a data-URL image, and no temperature', async () => {
		const { sent, fetcher } = recorder(
			Response.json({
				choices: [
					{ message: { content: '{"name":"Pancakes"}', refusal: null }, finish_reason: 'stop' }
				]
			})
		);

		assert.deepEqual(await openai.generate(call(fetcher, base), request), { name: 'Pancakes' });

		const body = sent[0].body!;
		assert.equal(sent[0].url, `${base}/v1/chat/completions`);
		assert.equal(headersOf(sent[0]).authorization, `Bearer ${KEY}`);
		assert.deepEqual(body.response_format, {
			type: 'json_schema',
			json_schema: { name: 'recipe', strict: true, schema: request.schema }
		});
		assert.equal(body.max_completion_tokens, 16000);
		assert.equal('temperature' in body, false);
		const user = (body.messages as { content: Record<string, unknown>[] }[])[1].content;
		assert.equal(
			(user[0].image_url as { url: string }).url,
			`data:image/webp;base64,${Buffer.from('webp-bytes').toString('base64')}`
		);
	});

	it('calls a refusal or a cut-off bad output', async () => {
		for (const choice of [
			{ message: { content: null, refusal: 'I can’t help with that.' }, finish_reason: 'stop' },
			{ message: { content: '{"name":"Pan', refusal: null }, finish_reason: 'length' }
		]) {
			const { fetcher } = recorder(Response.json({ choices: [choice] }));
			await assert.rejects(
				openai.generate(call(fetcher, base), request),
				(cause: unknown) => cause instanceof AiError && cause.code === 'bad-output'
			);
		}
	});

	it('lists chat aliases newest first, without snapshots or other families', async () => {
		const { fetcher } = recorder(
			Response.json({
				data: [
					{ id: 'gpt-4o', created: 1715000000 },
					{ id: 'gpt-5-mini', created: 1754000000 },
					{ id: 'gpt-5', created: 1754000001 },
					{ id: 'gpt-5-2025-08-07', created: 1754000002 },
					{ id: 'gpt-4o-realtime-preview', created: 1730000000 },
					{ id: 'text-embedding-3-large', created: 1705000000 },
					{ id: 'gpt-image-1', created: 1745000000 },
					{ id: 'gpt-3.5-turbo', created: 1677000000 },
					{ id: 'gpt-4-0613', created: 1686000000 },
					{ id: 'o3-mini', created: 1738000000 },
					{ id: 'gpt-5-pro', created: 1759000000 },
					{ id: 'dall-e-3', created: 1698000000 }
				]
			})
		);

		const models = await openai.listModels({ baseUrl: base, apiKey: KEY, fetch: fetcher });

		assert.deepEqual(
			models.map((model) => model.id),
			['gpt-5', 'gpt-5-mini', 'o3-mini', 'gpt-4o']
		);
		assert.equal(openai.recommend(models), 'gpt-5-mini');
		assert.equal(models.find((model) => model.id === 'o3-mini')?.vision, false);
	});
});

describe('anthropic', () => {
	const base = 'https://anthropic.test';

	it('sends structured outputs (not a forced tool call), the version header, and no temperature', async () => {
		const { sent, fetcher } = recorder(
			Response.json({
				content: [
					{ type: 'thinking', thinking: '' },
					{ type: 'text', text: '{"name":"Pancakes"}' }
				],
				stop_reason: 'end_turn'
			})
		);

		assert.deepEqual(await anthropic.generate(call(fetcher, base), request), { name: 'Pancakes' });

		const body = sent[0].body!;
		assert.equal(sent[0].url, `${base}/v1/messages`);
		assert.equal(headersOf(sent[0])['x-api-key'], KEY);
		assert.equal(headersOf(sent[0])['anthropic-version'], '2023-06-01');
		assert.deepEqual(body.output_config, {
			format: { type: 'json_schema', schema: request.schema }
		});
		assert.equal('tool_choice' in body, false);
		assert.equal('temperature' in body, false);
		assert.equal(body.max_tokens, 16000);
		const content = (body.messages as { content: Record<string, unknown>[] }[])[0].content;
		assert.deepEqual(content[0], {
			type: 'image',
			source: {
				type: 'base64',
				media_type: 'image/webp',
				data: Buffer.from('webp-bytes').toString('base64')
			}
		});
	});

	it('calls a refusal or a cut-off bad output', async () => {
		for (const stop of ['refusal', 'max_tokens']) {
			const { fetcher } = recorder(
				Response.json({ content: [{ type: 'text', text: '{}' }], stop_reason: stop })
			);
			await assert.rejects(
				anthropic.generate(call(fetcher, base), request),
				(cause: unknown) => cause instanceof AiError && cause.code === 'bad-output'
			);
		}
	});

	it('lists models with structured outputs, newest first, across pages', async () => {
		const caps = (structured: boolean) => ({
			structured_outputs: { supported: structured },
			image_input: { supported: true }
		});
		const { sent, fetcher } = recorder(
			Response.json({
				data: [
					{
						id: 'claude-opus-5-5',
						display_name: 'Claude Opus 5.5',
						created_at: '2026-09-01T00:00:00Z',
						capabilities: caps(true)
					},
					{
						id: 'claude-haiku-5-5',
						display_name: 'Claude Haiku 5.5',
						created_at: '2026-08-01T00:00:00Z',
						capabilities: caps(true)
					}
				],
				has_more: true,
				last_id: 'claude-haiku-5-5'
			}),
			Response.json({
				data: [
					{
						id: 'claude-3-haiku-20240307',
						display_name: 'Claude Haiku 3',
						created_at: '2024-03-07T00:00:00Z',
						capabilities: caps(false)
					},
					{
						id: 'claude-haiku-4-5',
						display_name: 'Claude Haiku 4.5',
						created_at: '2025-10-01T00:00:00Z'
					}
				],
				has_more: false
			})
		);

		const models = await anthropic.listModels({ baseUrl: base, apiKey: KEY, fetch: fetcher });

		assert.deepEqual(
			models.map((model) => model.id),
			['claude-opus-5-5', 'claude-haiku-5-5', 'claude-haiku-4-5']
		);
		assert.equal(models[0].label, 'Claude Opus 5.5');
		assert.equal(anthropic.recommend(models), 'claude-haiku-5-5');
		assert.match(sent[1].url, /after_id=claude-haiku-5-5/);
	});
});

describe('openrouter', () => {
	const base = 'https://openrouter.test/api/v1';

	it('asks only for routes that enforce the schema', async () => {
		const { sent, fetcher } = recorder(
			Response.json({
				choices: [{ message: { content: '{"name":"Pancakes"}' }, finish_reason: 'stop' }]
			})
		);

		assert.deepEqual(await openrouter.generate(call(fetcher, base), request), { name: 'Pancakes' });

		const body = sent[0].body!;
		assert.equal(sent[0].url, `${base}/chat/completions`);
		assert.deepEqual(body.provider, { require_parameters: true });
		assert.equal(body.max_tokens, 16000);
		assert.equal((body.response_format as { type: string }).type, 'json_schema');
	});

	it('checks the key before listing, since the listing answers anyone', async () => {
		const { sent, fetcher } = recorder(
			Response.json({ error: { message: 'No auth credentials found' } }, { status: 401 })
		);
		await assert.rejects(
			openrouter.listModels({ baseUrl: base, apiKey: KEY, fetch: fetcher }),
			(cause: unknown) => cause instanceof AiError && cause.code === 'bad-key'
		);
		assert.equal(sent.length, 1);
		assert.equal(sent[0].url, `${base}/key`);
	});

	it('keeps structured-output models, free ones first, and recommends a free one that reads photos', async () => {
		const { fetcher } = recorder(
			Response.json({ data: { label: 'household' } }),
			Response.json({
				data: [
					{
						id: 'openai/gpt-5-mini',
						name: 'OpenAI: GPT-5 Mini',
						created: 1754000000,
						pricing: { prompt: '0.00000025', completion: '0.000002' },
						architecture: { input_modalities: ['text', 'image'] },
						supported_parameters: ['response_format', 'structured_outputs']
					},
					{
						id: 'meta-llama/llama-4-scout:free',
						name: 'Meta: Llama 4 Scout (free)',
						created: 1743000000,
						pricing: { prompt: '0', completion: '0' },
						architecture: { input_modalities: ['text', 'image'] },
						supported_parameters: ['structured_outputs']
					},
					{
						id: 'some/text-only:free',
						name: 'Text only (free)',
						created: 1750000000,
						pricing: { prompt: '0', completion: '0' },
						architecture: { input_modalities: ['text'] },
						supported_parameters: ['structured_outputs']
					},
					{
						id: 'old/no-schema',
						name: 'No schema',
						created: 1760000000,
						pricing: { prompt: '0', completion: '0' },
						supported_parameters: ['response_format']
					}
				]
			})
		);

		const models = await openrouter.listModels({ baseUrl: base, apiKey: KEY, fetch: fetcher });

		assert.deepEqual(
			models.map((model) => model.id),
			['some/text-only:free', 'meta-llama/llama-4-scout:free', 'openai/gpt-5-mini']
		);
		assert.equal(models[0].free, true);
		assert.equal(models[0].vision, false);
		assert.equal(openrouter.recommend(models), 'meta-llama/llama-4-scout:free');
	});
});
