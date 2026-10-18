/**
 * Recipe wording, through the services (→ plan 24, DECISIONS #150): the
 * owner's setting, and what an AI import does with it — the glossary in the
 * prompt, and the fixed list applied to the ingredient names of a German
 * answer either way.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { AiProvider } from '$lib/ai';
import type { Connection } from '$lib/server/ai/run';
import type { GenerateRequest, ProviderAdapter } from '$lib/server/ai/types';
import { buildRecipePrompt, extractRecipe } from '$lib/server/services/ai-import';
import { getRecipeWording, HouseholdError, setRecipeWording } from '$lib/server/services/household';
import { makeHousehold } from '../helpers/db';

describe('the recipe wording setting', () => {
	it('is the owner’s to change, and per household', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Housemate'] });
		const [owner, housemate] = members;

		assert.equal(getRecipeWording(householdId), null);
		setRecipeWording(householdId, owner.id, 'austrian');
		assert.equal(getRecipeWording(householdId), 'austrian');

		assert.throws(
			() => setRecipeWording(householdId, housemate.id, null),
			(cause: unknown) => cause instanceof HouseholdError && cause.code === 'not-owner'
		);
		assert.equal(getRecipeWording(householdId), 'austrian');
		assert.equal(getRecipeWording(makeHousehold().householdId), null);

		setRecipeWording(householdId, owner.id, null);
		assert.equal(getRecipeWording(householdId), null);
	});
});

describe('an AI import in Austrian wording', () => {
	const primary: Connection = {
		slot: 'primary',
		provider: 'gemini',
		apiKey: 'k',
		model: 'g',
		vision: true
	};

	function fake(answer: unknown) {
		const sent: GenerateRequest[] = [];
		const adapter: ProviderAdapter = {
			defaultBaseUrl: 'https://fake.test',
			async generate(_call, request) {
				sent.push(request);
				return answer;
			},
			listModels: async () => [],
			recommend: () => null
		};
		const adapters = Object.fromEntries(
			(['gemini', 'openai', 'anthropic', 'openrouter'] as AiProvider[]).map((p) => [p, adapter])
		) as Record<AiProvider, ProviderAdapter>;
		return { sent, run: { adapters } };
	}

	const germanAnswer = {
		name: 'Topfennockerl',
		servings: 4,
		timeMinutes: 30,
		ingredients: [
			{ quantity: 250, unit: 'g', name: 'Quark' },
			{ quantity: 200, unit: 'ml', name: 'Sahne' }
		],
		steps: [
			{
				text: 'Den Quark mit der Sahne verrühren und 10 Minuten rasten lassen.',
				timer: null,
				uses: null
			}
		]
	};

	it('asks for Austrian German, with the list as the glossary', () => {
		const prompt = buildRecipePrompt('extract', { household: null, now: null }, 'austrian');
		assert.match(prompt, /write it in Austrian German/);
		assert.match(prompt, /Sahne → Obers/);
		assert.match(prompt, /A recipe in another language stays as it is/);
		assert.doesNotMatch(buildRecipePrompt('extract', { household: null, now: null }), /Austrian/);
	});

	it('swaps the ingredient names of a German answer the model left German', async () => {
		const { sent, run } = fake(germanAnswer);
		const result = await extractRecipe(
			[primary],
			{ text: 'Topfennockerl …' },
			{ instructions: { household: null, now: null }, wording: 'austrian', run }
		);

		assert.deepEqual(result.value.ingredientLines, ['250 g Topfen', '200 ml Obers']);
		assert.match(sent[0].system, /Austrian German/);
	});

	it('leaves the answer as it came without the setting', async () => {
		const { run } = fake(germanAnswer);
		const result = await extractRecipe(
			[primary],
			{ text: 'Topfennockerl …' },
			{ instructions: { household: null, now: null }, wording: null, run }
		);
		assert.deepEqual(result.value.ingredientLines, ['250 g Quark', '200 ml Sahne']);
	});
});
