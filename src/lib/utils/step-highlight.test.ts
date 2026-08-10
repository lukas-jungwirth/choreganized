/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { highlightStep, readStep, scaleStepUses } from './step-highlight.ts';

/** Shorthand: the step text rebuilt with the underlined runs marked with `«»`. */
function marked(text: string, names: string[]): string {
	const { segments } = highlightStep(
		text,
		names.map((name) => ({ name }))
	);
	return segments.map((s) => (s.ingredient ? `«${s.text}»` : s.text)).join('');
}

function usedNames(text: string, names: string[]): string[] {
	return highlightStep(
		text,
		names.map((name) => ({ name }))
	).used.map((i) => i.name);
}

describe('highlightStep', () => {
	it('underlines the ingredients a step names', () => {
		assert.equal(
			marked('Sauté the mushrooms in butter until golden.', ['Mushrooms', 'Butter', 'Cream']),
			'Sauté the «mushrooms» in «butter» until golden.'
		);
	});

	it('rebuilds the step exactly', () => {
		const text = '  Fold the CREAM through, off the heat.  ';
		const { segments } = highlightStep(text, [{ name: 'cream' }]);
		assert.equal(segments.map((s) => s.text).join(''), text);
	});

	it('lists what it used once, in reading order', () => {
		assert.deepEqual(
			usedNames('Melt butter, add mushrooms, then more butter.', ['Mushrooms', 'Butter']),
			['Butter', 'Mushrooms']
		);
	});

	it('matches whole words only', () => {
		assert.equal(marked('Bring to a boiling point', ['Oil']), 'Bring to a boiling point');
		assert.equal(marked('Dice the eggplant', ['Egg']), 'Dice the eggplant');
		assert.equal(marked('Add the egg-white', ['Egg']), 'Add the «egg»-white');
	});

	it('prefers the longest name at the same spot', () => {
		assert.equal(
			marked('Warm the olive oil gently', ['Oil', 'Olive oil']),
			'Warm the «olive oil» gently'
		);
	});

	it('forgives the plural either way', () => {
		assert.equal(marked('Slice one mushroom', ['Mushrooms']), 'Slice one «mushroom»');
		assert.equal(marked('Whisk the eggs', ['Egg']), 'Whisk the «eggs»');
		// A word that would stop being a word without its "s" keeps it.
		assert.equal(marked('Pour into a glass', ['Glass']), 'Pour into a «glass»');
		assert.equal(marked('Light the gas', ['Gas']), 'Light the «gas»');
	});

	it('does not end a match inside an accented word', () => {
		// ASCII `\b` sees a boundary between "Cre" and "è" and would underline it.
		assert.equal(marked('Torch the crème brûlée', ['Cre']), 'Torch the crème brûlée');
		assert.equal(
			marked('Spoon over the crème fraîche', ['Crème fraîche']),
			'Spoon over the «crème fraîche»'
		);
	});

	it('ignores names too short to mean anything', () => {
		assert.equal(
			marked('Add a pinch of salt to 1 pan', ['1', 'ml']),
			'Add a pinch of salt to 1 pan'
		);
	});

	it('treats a name with regex characters as text', () => {
		assert.equal(marked('Use the (good) butter', ['(good) butter']), 'Use the «(good) butter»');
	});

	it('matches across any whitespace', () => {
		assert.equal(marked('Warm the olive  oil', ['Olive oil']), 'Warm the «olive  oil»');
	});

	it('leaves a step with no matches whole', () => {
		const { segments, used } = highlightStep('Season well and serve.', [{ name: 'Mushrooms' }]);
		assert.deepEqual(
			segments.map((s) => s.text),
			['Season well and serve.']
		);
		assert.deepEqual(used, []);
	});

	it('survives a recipe with no ingredients', () => {
		const { segments, used } = highlightStep('Boil the water.', []);
		assert.deepEqual(segments, [{ text: 'Boil the water.', ingredient: null }]);
		assert.deepEqual(used, []);
	});

	it('lets a written-out ingredient go by its head word', () => {
		assert.equal(marked('Dice the onion', ['small red onion']), 'Dice the «onion»');
		assert.equal(marked('Stir in the paste', ['Curry paste']), 'Stir in the «paste»');
		// The whole name still wins where the step writes it out.
		assert.equal(marked('Fry the curry paste', ['Curry paste']), 'Fry the «curry paste»');
		// The head word is the last one: dropping *trailing* words would make
		// "chicken stock" answer to "chicken", which is usually another thing.
		assert.equal(marked('Brown the chicken', ['Chicken stock']), 'Brown the chicken');
	});

	it('drops the note a name carries', () => {
		assert.equal(
			marked('Warm the olive oil', ['Olive oil (extra virgin)']),
			'Warm the «olive oil»'
		);
		assert.equal(
			marked('Add the chicken breast', ['Chicken breast, diced']),
			'Add the «chicken breast»'
		);
	});

	it('says nothing rather than guessing between two of a kind', () => {
		// Both shorten to "oil", so neither gets the word — but each still
		// answers to itself.
		assert.equal(
			marked('Warm the oil, then the olive oil', ['Olive oil', 'Sunflower oil']),
			'Warm the oil, then the «olive oil»'
		);
	});

	it('does not let two rows of the same thing cancel each other out', () => {
		// Imported recipes list "Prise Salz" once per section; that is still salt.
		assert.equal(
			marked('Mit Salz abschmecken', ['Prise Salz', 'Prise Salz']),
			'Mit «Salz» abschmecken'
		);
	});

	it('gives a word to the ingredient actually called that', () => {
		assert.equal(marked('Season with pepper', ['Red pepper', 'Pepper']), 'Season with «pepper»');
	});

	it('forgives German plurals too', () => {
		assert.equal(marked('Die Zwiebel anbraten', ['2 Zwiebeln']), 'Die «Zwiebel» anbraten');
		assert.equal(marked('Tomaten dazugeben', ['Tomate']), '«Tomaten» dazugeben');
		assert.equal(marked('Mit Berries servieren', ['Berry']), 'Mit «Berries» servieren');
	});
});

/* ── Pinned steps ─────────────────────────────────────────────────────────── */

const PASTA = [
	{ id: 'a', name: 'Olive oil', quantity: 3, unit: 'tbsp' },
	{ id: 'b', name: 'Mushrooms', quantity: 250, unit: 'g' },
	{ id: 'c', name: 'Salt', quantity: null, unit: null }
];

describe('readStep', () => {
	it('reads the text when nothing is pinned', () => {
		const { used } = readStep({ text: 'Sauté the mushrooms', uses: null }, PASTA);
		assert.deepEqual(
			used.map((row) => row.name),
			['Mushrooms']
		);
	});

	it('says what was pinned, whether or not the step names it', () => {
		const { used } = readStep(
			{ text: 'Sauté until golden', uses: [{ ingredientId: 'a', quantity: null }] },
			PASTA
		);
		assert.deepEqual(used, [PASTA[0]]);
	});

	it('carries the step’s own share of an ingredient', () => {
		const { used } = readStep(
			{ text: 'Warm the olive oil', uses: [{ ingredientId: 'a', quantity: 1 }] },
			PASTA
		);
		assert.deepEqual(used, [{ id: 'a', name: 'Olive oil', quantity: 1, unit: 'tbsp' }]);
	});

	it('underlines only what is pinned', () => {
		const { segments } = readStep(
			{ text: 'Salt the mushrooms', uses: [{ ingredientId: 'c', quantity: null }] },
			PASTA
		);
		assert.equal(
			segments.map((s) => (s.ingredient ? `«${s.text}»` : s.text)).join(''),
			'«Salt» the mushrooms'
		);
	});

	it('takes an empty list at its word', () => {
		const { used, segments } = readStep({ text: 'Season the mushrooms', uses: [] }, PASTA);
		assert.deepEqual(used, []);
		assert.deepEqual(
			segments.map((s) => s.ingredient),
			[null]
		);
	});

	it('drops a pin whose ingredient is gone, and a repeat of one', () => {
		const { used } = readStep(
			{
				text: '',
				uses: [
					{ ingredientId: 'gone', quantity: 1 },
					{ ingredientId: 'b', quantity: null },
					{ ingredientId: 'b', quantity: 50 }
				]
			},
			PASTA
		);
		assert.deepEqual(
			used.map((row) => row.id),
			['b']
		);
	});
});

describe('scaleStepUses', () => {
	it('moves a share the way the ingredient moves', () => {
		assert.deepEqual(scaleStepUses([{ ingredientId: 'a', quantity: 1 }], 2), [
			{ ingredientId: 'a', quantity: 2 }
		]);
	});

	it('leaves “all of it” alone', () => {
		assert.deepEqual(scaleStepUses([{ ingredientId: 'a', quantity: null }], 2), [
			{ ingredientId: 'a', quantity: null }
		]);
	});

	it('keeps a step that reads its text reading its text', () => {
		assert.equal(scaleStepUses(null, 2), null);
	});
});
