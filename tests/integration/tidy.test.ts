/**
 * Tidying a saved recipe (→ plan 48) below the screen: the recipe through
 * `tidyRecipe` with the fake provider answering in-process (`scripts/fake-ai.ts`,
 * as the journeys have it), the draft opened as the review opens it, and Save
 * posting what the review posts, through `readRecipeForm` into `updateRecipe`.
 *
 * What must stay: the id (so the plan entry still opens it), the photo, the
 * tags, the diet, the heart, a step's hand-made links and its timer. What must
 * never happen: a row lost to the answer, or anything stored before Save.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { describe, it } from 'vitest';
import type { AiProvider } from '$lib/ai';
import { catalog } from '$lib/i18n';
import { db, tables } from '$lib/server/db';
import type { Connection } from '$lib/server/ai/run';
import { AiError, type GenerateRequest, type ProviderAdapter } from '$lib/server/ai/types';
import { SAVED_RECIPE_LEAD, tidyRecipe } from '$lib/server/services/ai-import';
import { planMeal } from '$lib/server/services/meals';
import { createRecipe, getRecipe, setFavourite, updateRecipe } from '$lib/server/services/recipes';
import { postedFields } from '$lib/utils/recipe-editor';
import { startReview } from '$lib/utils/recipe-review';
import { readRecipeForm, type RecipeInput } from '$lib/utils/recipes';
import { keyMaker } from '$lib/utils/recipe-editor';
import { answerFor } from '../../scripts/fake-ai';
import { makeHousehold } from '../helpers/db';

const m = catalog('en');
const primary: Connection = {
	slot: 'primary',
	provider: 'gemini',
	apiKey: 'k',
	model: 'g',
	vision: true
};

/** Adapters that answer with `answer(request)`; every request is kept. */
function fakes(answer: (request: GenerateRequest) => unknown) {
	const sent: GenerateRequest[] = [];
	const make = (provider: AiProvider): ProviderAdapter => ({
		defaultBaseUrl: `https://${provider}.test`,
		async generate(_call, request) {
			sent.push(request);
			return answer(request);
		},
		listModels: async () => [],
		recommend: () => null
	});
	return {
		sent,
		run: {
			adapters: {
				gemini: make('gemini'),
				openai: make('openai'),
				anthropic: make('anthropic'),
				openrouter: make('openrouter')
			}
		}
	};
}

/** The fake provider of the journeys. */
const fakeAi = (request: GenerateRequest) =>
	answerFor('gemini', request.schema as Record<string, unknown>, { parts: request.parts });

const CHILI: RecipeInput = {
	name: 'Chili',
	timeMinutes: 40,
	servings: 4,
	ingredientLines: ['500 g Hackfleisch, gemischtes', '1 Dose Bohnen', '1 Prise Salz'],
	steps: [
		{
			text: 'Das Hackfleisch anbraten.',
			// Linked by hand: the Bohnen too, though the text does not name them.
			uses: [
				{ ingredient: 0, quantity: null, phrase: 'Hackfleisch', amountPhrase: null },
				{ ingredient: 1, quantity: null, phrase: null, amountPhrase: null }
			],
			timer: null
		},
		{
			text: 'Die Bohnen dazugeben und 20 Minuten köcheln. Mit Salz abschmecken.',
			uses: null,
			timer: { seconds: 1200, label: 'Chili' }
		}
	],
	tags: ['meal:dinner', 'kind:main'],
	diet: 'meat'
};

function saved() {
	const { householdId, owner } = makeHousehold();
	const id = createRecipe(householdId, owner.id, CHILI, 'recipes/chili.webp');
	setFavourite(householdId, id, true);
	planMeal(householdId, owner.id, {
		date: '2026-11-23',
		slot: 'dinner',
		mealId: null,
		recipeId: id,
		title: null,
		cookMemberId: null,
		addIngredients: false
	});
	return { householdId, id };
}

/** Save as the review posts it: the editor's fields, the recipe's own tags and diet. */
function saveAsReview(
	householdId: string,
	id: string,
	draft: Awaited<ReturnType<typeof tidyRecipe>>['value']
) {
	const recipe = getRecipe(householdId, id)!;
	const review = startReview(
		{ prefill: { ...draft, photo: null }, source: 'recipe', recipeId: id },
		keyMaker('t')
	);
	const form = new FormData();
	form.set('name', review.name);
	form.set('timeMinutes', String(review.timeMinutes ?? ''));
	form.set('servings', String(review.servings ?? ''));
	for (const [name, value] of postedFields(review.editor)) form.append(name, value);
	for (const tag of recipe.tags) form.append('tag', tag);
	form.set('diet', recipe.diet ?? '');
	const parsed = readRecipeForm(form, m);
	assert.ok('input' in parsed, JSON.stringify(parsed));
	assert.equal(updateRecipe(householdId, id, parsed.input), true);
}

describe('tidyRecipe against the fake provider', () => {
	it('sends the saved recipe as a card, and stores nothing', async () => {
		const { householdId, id } = saved();
		const before = getRecipe(householdId, id)!;
		const fake = fakes(fakeAi);

		const result = await tidyRecipe([primary], before, { labels: m.units.labels, run: fake.run });

		assert.equal(fake.sent.length, 1);
		const [part] = fake.sent[0].parts as { text: string }[];
		assert.ok(part.text.startsWith(SAVED_RECIPE_LEAD));
		assert.match(part.text, /"source":0,"line":"500 g Hackfleisch, gemischtes"/);
		// No household instructions: they would let the answer change rows (DECISIONS #340).
		assert.doesNotMatch(fake.sent[0].system ?? '', /Household instructions/);

		assert.deepEqual(result.value.ingredientLines, [
			'500 g Hackfleisch',
			'1 Dose Bohnen',
			'1 Prise Salz'
		]);
		assert.equal(result.value.ingredientDetails?.[0]?.note, 'gemischtes');
		// Not stored: the recipe reads as it did.
		assert.deepEqual(getRecipe(householdId, id), before);
	});

	it('saved in place keeps the id, photo, tags, diet, heart, plan entry, hand links and timer', async () => {
		const { householdId, id } = saved();
		const result = await tidyRecipe([primary], getRecipe(householdId, id)!, {
			labels: m.units.labels,
			run: fakes(fakeAi).run
		});
		saveAsReview(householdId, id, result.value);

		const after = getRecipe(householdId, id)!;
		assert.equal(after.name, 'Chili');
		assert.equal(after.imagePath, 'recipes/chili.webp');
		assert.deepEqual(after.tags, ['meal:dinner', 'kind:main']);
		assert.equal(after.diet, 'meat');
		assert.equal(after.favourite, true);
		assert.deepEqual(
			after.ingredients.map((row) => [row.name, row.note]),
			[
				['Hackfleisch', 'gemischtes'],
				['Bohnen', null],
				['Salz', null]
			]
		);

		// Step 1's hand-made links, the Bohnen without a phrase included.
		const names = new Map(after.ingredients.map((row) => [row.id, row.name]));
		assert.deepEqual(
			after.steps[0].uses?.map((use) => [names.get(use.ingredientId), use.phrase]),
			[
				['Hackfleisch', 'Hackfleisch'],
				['Bohnen', null]
			]
		);
		// The step that read its text now has the model's links; its timer stays.
		const timed = after.steps.find((step) => step.text.includes('20 Minuten'));
		assert.deepEqual(timed?.timer, { seconds: 1200, label: 'Chili' });
		assert.ok(after.steps.some((step) => step.uses?.length));

		const planned = db.select().from(tables.meals).where(eq(tables.meals.recipeId, id)).all();
		assert.equal(planned.length, 1);
	});

	it('catches a hostile answer that drops a row: the row comes back, with a question', async () => {
		const { householdId, id } = saved();
		const hostile = (request: GenerateRequest) => {
			const answer = fakeAi(request) as { ingredients: unknown[] };
			answer.ingredients.splice(1, 1); // the Bohnen
			return answer;
		};
		const result = await tidyRecipe([primary], getRecipe(householdId, id)!, {
			labels: m.units.labels,
			run: fakes(hostile).run
		});
		assert.deepEqual(result.value.ingredientLines, [
			'500 g Hackfleisch',
			'1 Dose Bohnen',
			'1 Prise Salz'
		]);
		assert.deepEqual(
			result.value.checks?.filter((check) => check.kind === 'line-added').map((check) => check.at),
			[{ ingredient: 1 }]
		);
	});

	it('refuses an answer that rewords the steps: the backup, then a failure, never a guess', async () => {
		const { householdId, id } = saved();
		const reworded = (request: GenerateRequest) => {
			const answer = fakeAi(request) as { steps: { text: string }[] };
			for (const step of answer.steps) step.text = 'Alles kochen.';
			return answer;
		};
		await assert.rejects(
			tidyRecipe([primary], getRecipe(householdId, id)!, {
				labels: m.units.labels,
				run: fakes(reworded).run
			}),
			(cause: unknown) => cause instanceof AiError || (cause as Error).name === 'AiFallbackError'
		);
	});

	it('never reaches another household’s recipe', () => {
		const { id } = saved();
		const other = makeHousehold();
		assert.equal(getRecipe(other.householdId, id), null);
		assert.equal(updateRecipe(other.householdId, id, CHILI), false);
	});
});
