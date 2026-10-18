/**
 * The two shape checks an AI connection gets before it is saved (→ plan 20).
 * Deliberately loose — the provider's own model listing is the real check — but
 * loose in the right places: no prefix gate on keys (Google alone issues two
 * formats), and model ids as every provider writes them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { looksLikeApiKey, looksLikeModelId } from './ai';

describe('looksLikeApiKey', () => {
	it('takes every provider’s key format without knowing any of them', () => {
		for (const key of [
			'AIzaSyD-0123456789abcdefghijklmnopq',
			'AQ.Ab8RN6Lw-0123456789abcdefghij',
			'sk-proj-0123456789abcdefghijklmnop',
			'sk-ant-api03-0123456789abcdefghij',
			'sk-or-v1-0123456789abcdef0123456789'
		]) {
			assert.equal(looksLikeApiKey(key), true, key);
		}
	});

	it('refuses what is plainly not a key', () => {
		assert.equal(looksLikeApiKey('short'), false);
		assert.equal(looksLikeApiKey('two words that are long enough'), false);
		assert.equal(looksLikeApiKey('x'.repeat(401)), false);
	});
});

describe('looksLikeModelId', () => {
	it('takes ids as the providers write them', () => {
		for (const id of [
			'gemini-flash-latest',
			'gpt-5-mini',
			'claude-haiku-5-5',
			'meta-llama/llama-4-scout:free',
			'models/gemini-2.5-flash',
			'mistralai/mistral-small-3.2-24b-instruct'
		]) {
			assert.equal(looksLikeModelId(id), true, id);
		}
	});

	it('refuses blanks, spaces and runaway input', () => {
		assert.equal(looksLikeModelId(''), false);
		assert.equal(looksLikeModelId('gpt 5'), false);
		assert.equal(looksLikeModelId('-leading-dash'), false);
		assert.equal(looksLikeModelId('a'.repeat(121)), false);
	});
});
