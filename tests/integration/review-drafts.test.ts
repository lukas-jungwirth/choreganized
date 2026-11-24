/**
 * The import drafts the review's journeys and screenshots open (→ plan 45,
 * docs/TESTING.md "Import review drafts"). A link import cannot reach a page
 * served by the test run (the fetch guard refuses local addresses, and stays
 * that way), so these drafts are what the real gate makes of the Chefkoch
 * fixture page and a hand-written answer, saved as JSON in
 * `tests/fixtures/review-drafts/`. The e2e journeys put one into the tab's
 * `sessionStorage`, exactly where the import page puts a fresh one, and open
 * `?draft=<id>`.
 *
 * This test holds the saved files to the gate: change the gate and it fails
 * until they are written again with `UPDATE_REVIEW_DRAFTS=1 npx vitest run
 * tests/integration/review-drafts.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { readFetchedPage } from '$lib/server/recipe-import';
import { validateRecipeDraft, type SourceRecipe } from '$lib/utils/recipe-draft';
import type { ImportDraft } from '$lib/utils/recipe-review';
import { keepSaved, savedCard, type SavedRecipe } from '$lib/utils/tidy-draft';

const DIR = 'tests/fixtures/review-drafts';
const LABELS = { tbsp: 'EL', tsp: 'TL', pcs: 'Stk.', pack: 'Pkg.' };

const page = readFetchedPage({
	html: readFileSync('src/lib/utils/fixtures/chefkoch-lasagne.html', 'utf8'),
	finalUrl: 'https://www.chefkoch.de/rezepte/lasagne'
});
const answer = JSON.parse(readFileSync('tests/fixtures/ai-answers/chefkoch-lasagne.json', 'utf8'));

type Answer = typeof answer;

function draft(card: SourceRecipe, raw: Answer): ImportDraft {
	const result = validateRecipeDraft(raw, {
		source: card,
		text: page.text,
		instructed: false,
		labels: LABELS
	});
	assert.ok(result.ok, JSON.stringify(result));
	return {
		prefill: { ...result.draft, photo: null, suggested: null },
		notice: 'Made with AI. Check it over before saving.',
		site: 'chefkoch.de',
		source: 'page'
	};
}

const card = page.card as SourceRecipe;

/**
 * A saved recipe imported before the rebuild (→ plan 48): a note in a name.
 * The visual tidy shot opens it over the seeded curry, whose id it takes then.
 */
const SAVED_CURRY: SavedRecipe = {
	name: 'Lentil curry',
	timeMinutes: 30,
	servings: 4,
	ingredients: [
		{ id: 'c1', name: 'Red lentils, rinsed', quantity: 300, unit: 'g', note: null, section: null },
		{ id: 'c2', name: 'Coconut milk', quantity: 400, unit: 'ml', note: null, section: null },
		{ id: 'c3', name: 'Curry paste', quantity: 2, unit: 'tbsp', note: null, section: null },
		{ id: 'c4', name: 'Baby spinach', quantity: 100, unit: 'g', note: null, section: null }
	],
	steps: [
		{
			text: 'Fry the curry paste for 2 min until fragrant.',
			section: null,
			uses: null,
			timer: null
		},
		{
			text: 'Add the lentils and coconut milk, simmer 20 minutes until soft.',
			section: null,
			uses: null,
			timer: null
		},
		{
			text: 'Stir the baby spinach through and season to taste.',
			section: null,
			uses: null,
			timer: null
		}
	]
};

/** The tidy of `SAVED_CURRY`: the note out of the name, and a row the answer left out. */
function tidyDraft(): ImportDraft {
	const saved = savedCard(SAVED_CURRY, LABELS);
	const row = (
		source: number,
		quantity: number,
		unit: string,
		name: string,
		note: string | null = null
	) => ({
		source,
		quantity,
		unit,
		countingWord: null,
		newUnit: null,
		name,
		note,
		alternative: null,
		section: null
	});
	const use = (ingredient: number, phrase: string) => ({
		ingredient,
		phrase,
		amountPhrase: null,
		quantity: null
	});
	const raw = {
		name: 'Lentil curry',
		servings: 4,
		timeMinutes: 30,
		ingredients: [
			row(0, 300, 'g', 'Red lentils', 'rinsed'),
			row(1, 400, 'ml', 'Coconut milk'),
			row(2, 2, 'tbsp', 'Curry paste')
		],
		steps: [
			{ text: saved.steps[0], section: null, timer: null, uses: [use(2, 'curry paste')] },
			{
				text: saved.steps[1],
				section: null,
				timer: { seconds: 1200, label: 'Simmer' },
				uses: [use(0, 'lentils'), use(1, 'coconut milk')]
			},
			{ text: saved.steps[2], section: null, timer: null, uses: [] }
		],
		tags: [],
		diet: null
	};
	const result = validateRecipeDraft(raw, {
		source: saved,
		text: null,
		instructed: false,
		labels: LABELS
	});
	assert.ok(result.ok, JSON.stringify(result));
	return {
		prefill: { ...keepSaved(result.draft, result.rows, SAVED_CURRY), photo: null, suggested: null },
		notice: 'Tidied with AI. Nothing changes until you save.',
		site: null,
		source: 'recipe',
		recipeId: 'visual'
	};
}

/** Each saved draft, and how it is made from the page and the answer. */
const DRAFTS: Record<string, () => ImportDraft> = {
	/** [R1]: the either/or the page has, a changed amount, the sentences left out. */
	lasagne: () => {
		const raw = structuredClone(answer);
		raw.ingredients[5].quantity = 50;
		return draft(card, raw);
	},

	/** [R2]: nothing to check. The model wrote the either/or into the note itself. */
	clean: () => {
		const raw = structuredClone(answer);
		raw.ingredients[8].alternative = null;
		raw.ingredients[8].note = 'oder Gemüsebrühe';
		return draft(card, raw);
	},

	/**
	 * Every row of plan 45's table that a page with a method can raise: a choice,
	 * a changed amount, a changed name, a line the model left out, a reworded
	 * step, and a unit word on no list ("2 Kugeln Mozzarella", a line added to
	 * the page for it).
	 */
	kinds: () => {
		const withBall: SourceRecipe = {
			...card,
			ingredientLines: [...card.ingredientLines, '2 Kugeln Mozzarella'],
			ingredientSections: [...(card.ingredientSections ?? []), 'Béchamelsoße']
		};
		const raw = structuredClone(answer);
		raw.ingredients[5].quantity = 50;
		raw.ingredients[1].name = 'Schalotte';
		// No row says it came from "1 Bund Thymian": the gate adds the line itself.
		raw.ingredients[11].source = null;
		raw.steps[2].text = raw.steps[2].text.replace('Das Hackfleisch', 'Das Faschierte');
		raw.ingredients.push({
			source: withBall.ingredientLines.length - 1,
			quantity: 2,
			unit: null,
			countingWord: null,
			newUnit: 'Kugeln',
			name: 'Mozzarella',
			note: null,
			alternative: null,
			section: 'Béchamelsoße'
		});
		return draft(withBall, raw);
	},

	/** [R3]: a page with no method and no servings (cookidoo.at publishes none). */
	'no-method': () => {
		const bare: SourceRecipe = {
			...card,
			steps: [],
			stepSections: [],
			servings: null,
			servingsText: null
		};
		const raw = { ...structuredClone(answer), steps: [], servings: null };
		return draft(bare, raw);
	},

	/** Plan 48: a saved recipe's tidy, one row the answer left out. */
	tidy: tidyDraft
};

const KINDS: Record<string, string[]> = {
	lasagne: ['choice', 'amount-differs'],
	clean: [],
	kinds: ['line-added', 'amount-differs', 'name-differs', 'new-unit', 'choice', 'reworded'],
	'no-method': ['servings', 'no-steps', 'choice'],
	tidy: ['line-added']
};

describe('the review’s saved drafts', () => {
	for (const [name, make] of Object.entries(DRAFTS)) {
		it(`${name} is what the gate makes of the page today`, () => {
			const made = make();
			const path = `${DIR}/${name}.json`;
			if (process.env.UPDATE_REVIEW_DRAFTS)
				writeFileSync(path, `${JSON.stringify(made, null, '\t')}\n`);
			assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), made);
		});

		it(`${name} asks what its journeys settle`, () => {
			const kinds = (make().prefill.checks ?? [])
				.filter((check) => check.level === 'check')
				.map((check) => check.kind);
			assert.deepEqual([...new Set(kinds)].sort(), [...KINDS[name]].sort());
		});
	}

	it('a reworded step offers every sentence of the page’s, not only the first', () => {
		const { prefill } = DRAFTS.kinds();
		const reworded = prefill.checks?.find((check) => check.kind === 'reworded');
		assert.equal(
			reworded?.page,
			'Das Hackfleisch dazugeben und krümelig und braun anbraten. Mit Salz und Pfeffer würzen.'
		);
		// They stay under "Left out" too: a weak match must not hide a tip for good. The
		// review lists them there only while no step holds them (`stillLeftOut`).
		assert.ok(prefill.leftOut?.some((one) => one.text.startsWith('Das Hackfleisch')));
	});
});
