/**
 * A step drawn from its stored links (→ plan 43). What is underlined is what
 * was stored, and the only amount that moves is the stored amount run.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { scaleIngredients } from './ingredients';
import type { StepUse } from './step-highlight';
import { hasStoredLinks, renderStep, scaleAmountPhrase } from './step-links';

type Row = { id: string; name: string; quantity: number | null; unit: string | null };

const rows: Row[] = [
	{ id: 'zwiebel', name: 'Zwiebel', quantity: 1, unit: null },
	{ id: 'oel', name: 'Olivenöl', quantity: 2, unit: 'tbsp' },
	{ id: 'hack', name: 'Faschiertes', quantity: 500, unit: 'g' },
	{ id: 'zimt', name: 'Zimt', quantity: 0.5, unit: 'tsp' },
	{ id: 'milch', name: 'Milch', quantity: 0.5, unit: 'L' }
];

const link = (
	ingredientId: string,
	phrase: string | null,
	amountPhrase: string | null = null,
	quantity: number | null = null
): StepUse => ({ ingredientId, quantity, phrase, amountPhrase });

/** The step as cook mode would draw it, cooking for `factor` × the recipe. */
function draw(text: string, uses: StepUse[] | null, factor = 1) {
	return renderStep({ text, uses }, scaleIngredients(rows, factor), factor);
}

/** The runs, with an underline as [word→id] and a scaled amount as {now|was}. */
function show(text: string, uses: StepUse[] | null, factor = 1): string {
	return draw(text, uses, factor)
		.segments.map((segment) =>
			segment.ingredient
				? `[${segment.text}→${segment.ingredient.id}]`
				: segment.scaledFrom
					? `{${segment.text}|${segment.scaledFrom}}`
					: segment.text
		)
		.join('');
}

describe('renderStep from stored links', () => {
	it('underlines a phrase that is not the ingredient’s name', () => {
		assert.equal(
			show('Zwiebelwürfel zum Hackfleisch geben.', [
				link('zwiebel', 'Zwiebelwürfel'),
				link('hack', 'Hackfleisch')
			]),
			'[Zwiebelwürfel→zwiebel] zum [Hackfleisch→hack] geben.'
		);
	});

	it('underlines every occurrence of a phrase in the step', () => {
		assert.equal(
			show('Die Zwiebel schälen, dann die Zwiebel würfeln.', [link('zwiebel', 'Zwiebel')]),
			'Die [Zwiebel→zwiebel] schälen, dann die [Zwiebel→zwiebel] würfeln.'
		);
	});

	it('never underlines a phrase inside a longer word', () => {
		assert.equal(
			show('Die Zwiebelwürfel anschwitzen.', [link('zwiebel', 'Zwiebel')]),
			'Die Zwiebelwürfel anschwitzen.'
		);
	});

	it('renders a phrase the text no longer contains as plain text', () => {
		const drawn = draw('Alles gut verrühren.', [link('zwiebel', 'Zwiebelwürfel')]);
		assert.equal(drawn.segments.length, 1);
		assert.equal(drawn.segments[0].text, 'Alles gut verrühren.');
		// Still used by the step: it is listed, only nothing is underlined.
		assert.deepEqual(
			drawn.used.map((row) => row.id),
			['zwiebel']
		);
	});

	it('lists an ingredient linked without words, and underlines nothing for it', () => {
		const drawn = draw('Die restlichen Zutaten unterheben.', [
			link('zwiebel', 'Zwiebel'),
			link('hack', null)
		]);
		assert.deepEqual(
			drawn.used.map((row) => row.id),
			['zwiebel', 'hack']
		);
		assert.equal(drawn.linked, true);
	});

	it('drops a link to an ingredient that is gone', () => {
		const drawn = draw('Zwiebel und Speck anbraten.', [
			link('zwiebel', 'Zwiebel'),
			link('deleted', 'Speck')
		]);
		assert.deepEqual(
			drawn.used.map((row) => row.id),
			['zwiebel']
		);
		assert.equal(
			show('Zwiebel und Speck anbraten.', [link('zwiebel', 'Zwiebel'), link('deleted', 'Speck')]),
			'[Zwiebel→zwiebel] und Speck anbraten.'
		);
	});

	it('names one ingredient by two phrases in one step', () => {
		assert.equal(
			show('Die Karotte schälen und die Schale zu den Möhren reiben.', [
				link('zwiebel', 'Karotte'),
				link('zwiebel', 'Möhren')
			]),
			'Die [Karotte→zwiebel] schälen und die Schale zu den [Möhren→zwiebel] reiben.'
		);
	});
});

describe('the stored amount run, cooking for a different number', () => {
	const text = '1 - 2 EL Olivenöl erhitzen, bei 180 °C 5 - 7 Min. braten.';
	const uses = [link('oel', 'Olivenöl', '1 - 2 EL')];

	it('scales both numbers of a range and nothing else', () => {
		assert.equal(
			show(text, uses, 2),
			'{2 - 4 EL|1 - 2 EL} [Olivenöl→oel] erhitzen, bei 180 °C 5 - 7 Min. braten.'
		);
	});

	it('leaves the text as written when cooking for the number it was written for', () => {
		assert.equal(
			show(text, uses, 1),
			'1 - 2 EL [Olivenöl→oel] erhitzen, bei 180 °C 5 - 7 Min. braten.'
		);
	});

	it('keeps a fraction a fraction and a decimal comma a comma', () => {
		assert.equal(scaleAmountPhrase('½', 2), '1');
		assert.equal(scaleAmountPhrase('¼ TL', 2), '½ TL');
		assert.equal(scaleAmountPhrase('0,25 l', 2), '0,5 l');
		assert.equal(scaleAmountPhrase('1 1/2 EL', 2), '3 EL');
		assert.equal(scaleAmountPhrase('200 g', 1.5), '300 g');
	});

	it('rewrites the run where it stands before the phrase, not an earlier one', () => {
		assert.equal(
			show('2 EL Wasser und 2 EL Olivenöl verrühren.', [link('oel', 'Olivenöl', '2 EL')], 2),
			'2 EL Wasser und {4 EL|2 EL} [Olivenöl→oel] verrühren.'
		);
	});

	it('finds an amount run that does not stand before its phrase', () => {
		assert.equal(
			show('Die Milch dazu, insgesamt ½ l.', [link('milch', 'Milch', '½ l')], 2),
			'Die [Milch→milch] dazu, insgesamt {1 l|½ l}.'
		);
	});

	it('does not find an amount inside a longer number', () => {
		assert.equal(
			show('12 EL Olivenöl.', [link('oel', 'Olivenöl', '2 EL')], 2),
			'12 EL [Olivenöl→oel].'
		);
	});

	it('carries the step’s share, scaled, on the underlined row', () => {
		const drawn = draw('1 EL Olivenöl erhitzen.', [link('oel', 'Olivenöl', '1 EL', 1)], 2);
		const underlined = drawn.segments.find((segment) => segment.ingredient);
		assert.equal(underlined?.ingredient?.quantity, 2);
	});
});

describe('the fallback for steps without stored words', () => {
	it('reads a step nobody has linked with the matcher, as before', () => {
		const drawn = draw('Die Zwiebel würfeln.', null);
		assert.equal(drawn.linked, false);
		assert.equal(show('Die Zwiebel würfeln.', null), 'Die [Zwiebel→zwiebel] würfeln.');
	});

	it('reads a step pinned by hand before plan 43 as before', () => {
		const pinned: StepUse[] = [{ ingredientId: 'zwiebel', quantity: null }];
		assert.equal(hasStoredLinks(pinned), false);
		assert.equal(show('Die Zwiebel würfeln.', pinned), 'Die [Zwiebel→zwiebel] würfeln.');
	});

	it('scales the number before an underlined word on the fallback, as plan 23 did', () => {
		assert.equal(
			show('2 EL Olivenöl erhitzen.', null, 1.5),
			'{3 EL|2 EL} [Olivenöl→oel] erhitzen.'
		);
	});
});
