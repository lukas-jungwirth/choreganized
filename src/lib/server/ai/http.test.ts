/**
 * The provider layer's error reading (→ plan 20, DECISIONS #146): four APIs,
 * one mapping by HTTP status. Each case below is a real error shape the
 * provider documents, because the message a household reads ("Gemini refused
 * the key" vs "Gemini is at its limit") depends on telling them apart — and the
 * fallback depends on every one of them being an `AiError` at all.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { codeForStatus, parseJsonText, requestJson } from './http';
import { AiError } from './types';

const err = (message: string, extra: Record<string, unknown> = {}) => ({
	error: { message, ...extra }
});

describe('codeForStatus', () => {
	it('reads a refused key, however the provider says it', () => {
		assert.equal(codeForStatus(401, err('Incorrect API key provided')), 'bad-key');
		assert.equal(codeForStatus(403, err('permission_error')), 'bad-key');
		// Google: a 400 with the reason in `details`, not an auth status.
		assert.equal(
			codeForStatus(400, {
				error: {
					code: 400,
					message: 'API key not valid. Please pass a valid API key.',
					status: 'INVALID_ARGUMENT',
					details: [{ reason: 'API_KEY_INVALID' }]
				}
			}),
			'bad-key'
		);
	});

	it('tells a spent quota from a rate limit where the provider does', () => {
		assert.equal(
			codeForStatus(429, err('Rate limit reached', { code: 'rate_limit_exceeded' })),
			'rate-limited'
		);
		assert.equal(
			codeForStatus(429, err('You exceeded your current quota', { code: 'insufficient_quota' })),
			'quota'
		);
		assert.equal(codeForStatus(402, err('Insufficient credits')), 'quota');
		assert.equal(
			codeForStatus(400, err('Your credit balance is too low to access the Anthropic API.')),
			'quota'
		);
		// Google's free tier says "quota" for its per-minute cap too: read as the busier one.
		assert.equal(
			codeForStatus(429, {
				error: {
					code: 429,
					message: 'Resource has been exhausted (e.g. check quota).',
					status: 'RESOURCE_EXHAUSTED'
				}
			}),
			'rate-limited'
		);
	});

	it('separates a missing model from one that can’t do the job', () => {
		assert.equal(codeForStatus(404, err('models/gemini-9 is not found')), 'model-unavailable');
		assert.equal(
			codeForStatus(404, err('No endpoints found that support the requested parameters')),
			'model-unsupported'
		);
		assert.equal(
			codeForStatus(
				400,
				err(
					"Invalid parameter: 'response_format' of type 'json_schema' is not supported with this model."
				)
			),
			'model-unsupported'
		);
		assert.equal(
			codeForStatus(400, err('This model does not support image input')),
			'model-unsupported'
		);
	});

	it('reads overloads and outages as unavailable, and anything else as failed', () => {
		assert.equal(
			codeForStatus(529, err('Overloaded', { type: 'overloaded_error' })),
			'unavailable'
		);
		assert.equal(codeForStatus(503, null), 'unavailable');
		assert.equal(codeForStatus(500, null), 'unavailable');
		assert.equal(codeForStatus(400, err('messages: field required')), 'failed');
		assert.equal(codeForStatus(413, null), 'failed');
	});
});

describe('requestJson', () => {
	const fakeFetch = (respond: () => Promise<Response>) => (async () => respond()) as typeof fetch;

	it('returns the parsed body on success', async () => {
		const body = await requestJson(
			'openai',
			'https://x.test',
			{},
			fakeFetch(async () => Response.json({ ok: true }))
		);
		assert.deepEqual(body, { ok: true });
	});

	it('turns a status into a coded AiError carrying the provider', async () => {
		await assert.rejects(
			requestJson(
				'anthropic',
				'https://x.test',
				{},
				fakeFetch(async () => Response.json(err('nope'), { status: 401 }))
			),
			(cause: unknown) =>
				cause instanceof AiError && cause.code === 'bad-key' && cause.provider === 'anthropic'
		);
	});

	it('reads a network failure as unavailable and an abort as a timeout', async () => {
		await assert.rejects(
			requestJson(
				'gemini',
				'https://x.test',
				{},
				fakeFetch(async () => {
					throw new TypeError('fetch failed');
				})
			),
			(cause: unknown) => cause instanceof AiError && cause.code === 'unavailable'
		);
		await assert.rejects(
			requestJson(
				'gemini',
				'https://x.test',
				{},
				fakeFetch(async () => {
					throw new DOMException('The operation timed out.', 'TimeoutError');
				})
			),
			(cause: unknown) => cause instanceof AiError && cause.code === 'timeout'
		);
	});
});

describe('parseJsonText', () => {
	it('parses bare JSON and forgives a markdown fence', () => {
		assert.deepEqual(parseJsonText('{"a":1}', 'openrouter'), { a: 1 });
		assert.deepEqual(parseJsonText('```json\n{"a":1}\n```', 'openrouter'), { a: 1 });
	});

	it('calls anything else bad output', () => {
		for (const text of ['', '   ', 'Sure! Here is the recipe', undefined, 42]) {
			assert.throws(
				() => parseJsonText(text, 'openai'),
				(cause: unknown) => cause instanceof AiError && cause.code === 'bad-output'
			);
		}
	});
});
