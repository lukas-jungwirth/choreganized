/**
 * Tidying a saved recipe (→ plan 48): the recipe as a card, and what the
 * household made by hand kept on the gate's draft: a step's own links, its
 * timer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { validateRecipeDraft } from './recipe-draft';
import { keepSaved, savedCard, stepOrigins, type SavedRecipe } from './tidy-draft';

const LABELS = { tbsp: 'EL', tsp: 'TL', pcs: 'Stk.', pack: 'Pkg.' };

/** A recipe imported before the rebuild: notes in the names, no parts. */
const saved: SavedRecipe = {
	name: 'Chili',
	timeMinutes: 40,
	servings: 4,
	ingredients: [
		{
			id: 'i0',
			name: 'Hackfleisch, gemischtes',
			quantity: 500,
			unit: 'g',
			note: null,
			section: null
		},
		{ id: 'i1', name: 'Salz und Pfeffer', quantity: null, unit: null, note: null, section: null },
		{ id: 'i2', name: 'Bohnen', quantity: 1, unit: 'Dose', note: 'abgetropft', section: null }
	],
	steps: [
		{
			// Linked by hand: the Hackfleisch under the word "Fleisch", with an amount.
			text: 'Das Fleisch anbraten. Mit Salz würzen.',
			section: null,
			uses: [
				{ ingredientId: 'i0', quantity: 250, phrase: 'Fleisch', amountPhrase: null },
				{ ingredientId: 'i1', quantity: null, phrase: 'Salz', amountPhrase: null }
			],
			timer: null
		},
		{
			// Reads its own text; a timer set by hand.
			text: 'Die Bohnen dazugeben und 20 Minuten köcheln.',
			section: null,
			uses: null,
			timer: { seconds: 1200, label: 'Chili' }
		}
	]
};

/** The model's answer: clean names, notes, "Salz und Pfeffer" split, the first step split. */
function answer() {
	const row = (source: number, quantity: number | null, unit: string | null, name: string) => ({
		source,
		quantity,
		unit,
		countingWord: null,
		newUnit: null,
		name,
		note: null as string | null,
		alternative: null,
		section: null
	});
	const hack = { ...row(0, 500, 'g', 'Hackfleisch'), note: 'gemischtes' };
	return {
		name: 'Chili',
		servings: 4,
		timeMinutes: 40,
		ingredients: [
			hack,
			row(1, null, null, 'Salz'),
			row(1, null, null, 'Pfeffer'),
			{ ...row(2, 1, null, 'Bohnen'), countingWord: 'Dose', note: 'abgetropft' }
		],
		steps: [
			{
				text: 'Das Fleisch anbraten.',
				section: null,
				timer: null,
				uses: [{ ingredient: 0, phrase: 'Fleisch', amountPhrase: null, quantity: null }]
			},
			{ text: 'Mit Salz würzen.', section: null, timer: null, uses: [] },
			{
				text: 'Die Bohnen dazugeben und 20 Minuten köcheln.',
				section: null,
				timer: { seconds: 1200, label: 'Köcheln' },
				uses: [{ ingredient: 3, phrase: 'Bohnen', amountPhrase: null, quantity: null }]
			}
		],
		tags: [],
		diet: null
	};
}

function tidied(raw = answer()) {
	const card = savedCard(saved, LABELS);
	const check = validateRecipeDraft(raw, {
		source: card,
		text: null,
		instructed: false,
		labels: LABELS
	});
	assert.ok(check.ok, JSON.stringify(check));
	return keepSaved(check.draft, check.rows, saved);
}

describe('a saved recipe as a card', () => {
	it('writes each row as the line it reads as, its note after a comma', () => {
		const card = savedCard(saved, LABELS);
		assert.deepEqual(card.ingredientLines, [
			'500 g Hackfleisch, gemischtes',
			'Salz und Pfeffer',
			'1 Dose Bohnen, abgetropft'
		]);
		assert.deepEqual(
			card.steps,
			saved.steps.map((step) => step.text)
		);
		// No parts saved, none sent: the model may not invent one.
		assert.equal(card.ingredientSections, undefined);
	});
});

describe('stepOrigins', () => {
	it('finds each draft step in the saved step it came from, in order', () => {
		const steps = answer().steps.map((step) => ({ ...step, uses: null }));
		assert.deepEqual(
			stepOrigins(
				steps,
				saved.steps.map((step) => step.text)
			),
			[0, 0, 1]
		);
	});

	it('says -1 for a step that is not the saved text', () => {
		assert.deepEqual(
			stepOrigins([{ text: 'Alles gut verrühren.', uses: null, timer: null }], ['Rühren.']),
			[-1]
		);
	});
});

describe('keepSaved', () => {
	it('keeps a step’s hand-made links, on the piece that names them, in the new rows', () => {
		const draft = tidied();
		// "Fleisch" with its share, to the Hackfleisch row, on the first piece.
		assert.deepEqual(draft.steps[0].uses, [
			{ ingredient: 0, quantity: 250, phrase: 'Fleisch', amountPhrase: null }
		]);
		// "Salz" was linked to "Salz und Pfeffer": both rows it became, by the same word.
		assert.deepEqual(draft.steps[1].uses, [
			{ ingredient: 1, quantity: null, phrase: 'Salz', amountPhrase: null },
			{ ingredient: 2, quantity: null, phrase: 'Salz', amountPhrase: null }
		]);
	});

	it('gives a step with no links of its own the model’s', () => {
		const draft = tidied();
		assert.deepEqual(draft.steps[2].uses, [
			{ ingredient: 3, quantity: null, phrase: 'Bohnen', amountPhrase: null }
		]);
	});

	it('keeps a saved timer, label and all, over the model’s', () => {
		const draft = tidied();
		assert.deepEqual(draft.steps[2].timer, { seconds: 1200, label: 'Chili' });
	});

	it('cleans the names and keeps the notes', () => {
		const draft = tidied();
		assert.deepEqual(draft.ingredientLines, [
			'500 g Hackfleisch',
			'Salz',
			'Pfeffer',
			'1 Dose Bohnen'
		]);
		assert.deepEqual(
			draft.ingredientDetails?.map((one) => one?.note ?? null),
			['gemischtes', null, null, 'abgetropft']
		);
	});

	it('counts the link items again on the kept links', () => {
		const draft = tidied();
		// The model linked no step to Salz and Pfeffer; the kept hand links do.
		const unused = (draft.checks ?? []).filter((check) => check.kind === 'unused');
		assert.deepEqual(unused, []);
	});

	it('still catches a row the answer dropped: the gate adds it back and asks', () => {
		const raw = answer();
		raw.ingredients.splice(3, 1);
		raw.steps[2].uses = [];
		const draft = tidied(raw);
		assert.equal(draft.ingredientLines.length, 4);
		assert.equal(draft.ingredientLines[3], '1 Dose Bohnen');
		assert.ok(draft.checks?.some((check) => check.kind === 'line-added'));
	});
});

describe('code-review fixes', () => {
	it('gives a split step’s saved timer to one piece only, never a model timer beside it', () => {
		const cake: SavedRecipe = {
			name: 'Kuchen',
			timeMinutes: null,
			servings: 8,
			ingredients: [
				{ id: 'k0', name: 'Teig', quantity: null, unit: null, note: null, section: null }
			],
			steps: [
				{
					text: 'Den Teig 40 Minuten backen. Dann 10 Minuten ruhen lassen.',
					section: null,
					uses: null,
					timer: { seconds: 2400, label: 'Backen' }
				}
			]
		};
		const raw = {
			name: 'Kuchen',
			servings: 8,
			timeMinutes: null,
			ingredients: [
				{
					source: 0,
					quantity: null,
					unit: null,
					countingWord: null,
					newUnit: null,
					name: 'Teig',
					note: null,
					alternative: null,
					section: null
				}
			],
			steps: [
				{ text: 'Den Teig 40 Minuten backen.', section: null, timer: null, uses: [] },
				{
					text: 'Dann 10 Minuten ruhen lassen.',
					section: null,
					timer: { seconds: 600, label: 'Ruhen' },
					uses: []
				}
			],
			tags: [],
			diet: null
		};
		const card = savedCard(cake, LABELS);
		const check = validateRecipeDraft(raw, {
			source: card,
			text: null,
			instructed: false,
			labels: LABELS
		});
		assert.ok(check.ok);
		// The gate let the model's 10 minutes through; the tidy keeps the household's one timer.
		assert.deepEqual(check.draft.steps[1].timer, { seconds: 600, label: 'Ruhen' });
		const draft = keepSaved(check.draft, check.rows, cake);
		assert.deepEqual(
			draft.steps.map((step) => step.timer),
			[{ seconds: 2400, label: 'Backen' }, null]
		);
	});

	it('keeps the hand-made links of a step the gate kept as reworded', () => {
		const raw = answer();
		// Lightly reworded: one step of three, under the gate's third.
		raw.steps[0].text = 'Das Fleisch gut anbraten.';
		const draft = tidied(raw);
		assert.ok(draft.checks?.some((check) => check.kind === 'reworded'));
		assert.deepEqual(draft.steps[0].uses, [
			{ ingredient: 0, quantity: 250, phrase: 'Fleisch', amountPhrase: null }
		]);
	});
});
