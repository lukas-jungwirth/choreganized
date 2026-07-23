/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { highlightStep } from './step-highlight.ts';

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
		assert.equal(marked('Spoon over the crème fraîche', ['Crème fraîche']), 'Spoon over the «crème fraîche»');
	});

	it('ignores names too short to mean anything', () => {
		assert.equal(marked('Add a pinch of salt to 1 pan', ['1', 'ml']), 'Add a pinch of salt to 1 pan');
	});

	it('treats a name with regex characters as text', () => {
		assert.equal(
			marked('Use the (good) butter', ['(good) butter']),
			'Use the «(good) butter»'
		);
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
});
