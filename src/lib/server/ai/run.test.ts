/**
 * The backup (→ plan 20): when the household's main provider can't answer,
 * the same request goes to the second — and only for a provider's failure, not
 * for "there's no recipe in this photo". Fake adapters stand in for the
 * providers, so each failure is exactly the one under test.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { AiProvider } from '$lib/ai';
import { AiFallbackError, generateWithFallback, type Connection } from './run';
import { object, string } from './schema';
import { AiError, type AiErrorCode, type GenerateRequest, type ProviderAdapter } from './types';

const request: GenerateRequest = {
	system: 's',
	parts: [{ type: 'text', text: 't' }],
	schema: object({ name: string() }),
	schemaName: 'probe',
	maxOutputTokens: 100
};

const primary: Connection = {
	slot: 'primary',
	provider: 'gemini',
	apiKey: 'k1',
	model: 'gemini-flash-latest',
	vision: true
};
const backup: Connection = {
	slot: 'backup',
	provider: 'anthropic',
	apiKey: 'k2',
	model: 'claude-haiku-5-5',
	vision: true
};

type Behaviour = AiErrorCode | { answer: unknown } | Error;

/** Adapters that answer or fail as told, and remember who was asked. */
function adapters(behaviour: Partial<Record<AiProvider, Behaviour>>) {
	const asked: AiProvider[] = [];
	const make = (provider: AiProvider): ProviderAdapter => ({
		defaultBaseUrl: `https://${provider}.test`,
		async generate() {
			asked.push(provider);
			const what = behaviour[provider];
			if (!what) throw new Error(`${provider} was not expected to be called`);
			if (what instanceof Error) throw what;
			if (typeof what === 'string') throw new AiError(what, provider);
			return what.answer;
		},
		async listModels() {
			return [];
		},
		recommend() {
			return null;
		}
	});
	return {
		asked,
		adapters: {
			gemini: make('gemini'),
			openai: make('openai'),
			anthropic: make('anthropic'),
			openrouter: make('openrouter')
		}
	};
}

const accept = (data: unknown) => data as { name: string };

describe('generateWithFallback', () => {
	it('uses the primary when it answers, and never asks the backup', async () => {
		const fake = adapters({ gemini: { answer: { name: 'Pancakes' } } });
		const result = await generateWithFallback([backup, primary], request, accept, fake);

		assert.deepEqual(result.value, { name: 'Pancakes' });
		assert.equal(result.used.provider, 'gemini');
		assert.equal(result.fellBackFrom, null);
		assert.deepEqual(fake.asked, ['gemini']);
	});

	it('falls back on a full free tier, and says who failed and why', async () => {
		const fake = adapters({ gemini: 'rate-limited', anthropic: { answer: { name: 'Pancakes' } } });
		const result = await generateWithFallback([primary, backup], request, accept, fake);

		assert.equal(result.used.provider, 'anthropic');
		assert.equal(result.used.slot, 'backup');
		assert.deepEqual(result.fellBackFrom, { provider: 'gemini', code: 'rate-limited' });
	});

	it('falls back when the answer is the wrong shape (accept throws an AiError)', async () => {
		const fake = adapters({
			gemini: { answer: 'not an object' },
			anthropic: { answer: { name: 'Ok' } }
		});
		const strict = (data: unknown, provider: AiProvider) => {
			if (typeof data !== 'object') throw new AiError('bad-output', provider);
			return data as { name: string };
		};

		const result = await generateWithFallback([primary, backup], request, strict, fake);
		assert.deepEqual(result.fellBackFrom, { provider: 'gemini', code: 'bad-output' });
	});

	it('does not ask the backup about an input that simply holds no recipe', async () => {
		const fake = adapters({ gemini: { answer: {} } });
		const noRecipe = new Error('no-recipe');

		await assert.rejects(
			generateWithFallback(
				[primary, backup],
				request,
				() => {
					throw noRecipe;
				},
				fake
			),
			(cause: unknown) => cause === noRecipe
		);
		assert.deepEqual(fake.asked, ['gemini']);
	});

	it('leads with the primary’s reason when both fail, and carries the backup’s', async () => {
		const fake = adapters({ gemini: 'quota', anthropic: 'bad-key' });

		await assert.rejects(
			generateWithFallback([primary, backup], request, accept, fake),
			(cause: unknown) =>
				cause instanceof AiFallbackError &&
				cause.code === 'quota' &&
				cause.provider === 'gemini' &&
				cause.second.code === 'bad-key' &&
				cause.second.provider === 'anthropic'
		);
	});

	it('throws the primary’s own error when there is no backup', async () => {
		const fake = adapters({ gemini: 'unavailable' });
		await assert.rejects(
			generateWithFallback([primary], request, accept, fake),
			(cause: unknown) =>
				cause instanceof AiError &&
				!(cause instanceof AiFallbackError) &&
				cause.code === 'unavailable'
		);
	});

	it('skips a model known not to read photos for a photo import', async () => {
		const fake = adapters({ anthropic: { answer: { name: 'From the photo' } } });
		const textOnly = { ...primary, vision: false };

		const result = await generateWithFallback([textOnly, backup], request, accept, {
			...fake,
			needsVision: true
		});

		assert.equal(result.used.provider, 'anthropic');
		assert.deepEqual(result.fellBackFrom, { provider: 'gemini', code: 'model-unsupported' });
		assert.deepEqual(fake.asked, ['anthropic']);
	});

	it('gives the primary only its share of the budget when a backup is waiting', async () => {
		let primarySignal: AbortSignal | undefined;
		const slow: ProviderAdapter = {
			defaultBaseUrl: 'https://slow.test',
			generate: (callArgs) =>
				new Promise((_, reject) => {
					primarySignal = callArgs.signal;
					callArgs.signal?.addEventListener('abort', () =>
						reject(new AiError('timeout', 'gemini'))
					);
				}),
			listModels: async () => [],
			recommend: () => null
		};
		const fake = adapters({ anthropic: { answer: { name: 'Quick' } } });

		const result = await generateWithFallback([primary, backup], request, accept, {
			adapters: { ...fake.adapters, gemini: slow },
			primaryShareMs: 30,
			budgetMs: 5_000
		});

		assert.equal(primarySignal?.aborted, true);
		assert.equal(result.used.provider, 'anthropic');
		assert.deepEqual(result.fellBackFrom, { provider: 'gemini', code: 'timeout' });
	});
});
