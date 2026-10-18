/**
 * Austrian wording (→ plan 24, DECISIONS #150): the fixed list, the swap that
 * only touches whole words in ingredient names of German recipes, and the
 * synonyms that keep a step's "Sahne" underlined once its row says "Obers".
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { highlightStep } from './step-highlight';
import { applyWording, austrianWords, looksGerman, AUSTRIAN_TERMS } from './wording';

describe('austrianWords', () => {
	it('swaps whole words, the longest phrase first', () => {
		assert.equal(austrianWords('200 ml Sahne'), '200 ml Obers');
		assert.equal(austrianWords('1 Becher saure Sahne'), '1 Becher Sauerrahm');
		assert.equal(austrianWords('250 g Schlagsahne'), '250 g Schlagobers');
		assert.equal(austrianWords('500 g Kartoffeln (festkochend)'), '500 g Erdäpfel (festkochend)');
		assert.equal(austrianWords('1 Kartoffel'), '1 Erdapfel');
		assert.equal(austrianWords('300 g gemischtes Hackfleisch'), '300 g gemischtes Faschiertes');
		assert.equal(austrianWords('2 Eiweiß'), '2 Eiklar');
		assert.equal(austrianWords('1 kleine Rote Bete'), '1 kleine Rote Rüben');
	});

	it('leaves compounds and everything else alone', () => {
		assert.equal(austrianWords('150 g Sahnejoghurt'), '150 g Sahnejoghurt');
		assert.equal(austrianWords('1 Bund Petersilie'), '1 Bund Petersilie');
		assert.equal(austrianWords('Tomatenmark'), 'Tomatenmark');
	});

	it('every pair maps to a different word, and no Austrian word is swapped again', () => {
		for (const [from, to] of AUSTRIAN_TERMS) {
			assert.notEqual(from, to);
			assert.equal(austrianWords(to), to, `${to} must stay ${to}`);
		}
	});
});

describe('applyWording', () => {
	const german = ['Die Kartoffeln schälen und mit Salz kochen.', 'Mit der Sahne verrühren.'];

	it('swaps the ingredient names of a German recipe when the household chose Austrian', () => {
		assert.deepEqual(applyWording(['500 g Kartoffeln', '200 ml Sahne'], german, 'austrian'), [
			'500 g Erdäpfel',
			'200 ml Obers'
		]);
	});

	it('leaves the recipe as written when the household didn’t, or it isn’t German', () => {
		assert.deepEqual(applyWording(['200 ml Sahne'], german, null), ['200 ml Sahne']);
		assert.deepEqual(
			applyWording(['200 g quark', '2 eggs'], ['Whisk the quark with the eggs.'], 'austrian'),
			['200 g quark', '2 eggs']
		);
	});
});

describe('looksGerman', () => {
	it('tells a German recipe from an English one', () => {
		assert.equal(looksGerman(['Mehl und Zucker mischen, eine Prise Salz dazu.']), true);
		assert.equal(looksGerman(['Mix the flour and sugar, add a pinch of salt.']), false);
	});
});

describe('the pairs as synonyms in a step', () => {
	it('an "Obers" row underlines the "Sahne" a step still says, and the other way round', () => {
		const obers = [{ name: 'Obers' }];
		assert.deepEqual(
			highlightStep('Die Sahne steif schlagen.', obers).used.map((row) => row.name),
			['Obers']
		);

		const sahne = [{ name: 'Sahne' }];
		assert.deepEqual(
			highlightStep('Das Obers einrühren.', sahne).used.map((row) => row.name),
			['Sahne']
		);
	});

	it('never takes a word an ingredient is actually called', () => {
		// Both on the list: each keeps its own word.
		const both = [{ name: 'Tomaten' }, { name: 'Paradeiser' }];
		const read = highlightStep('Tomaten und Paradeiser würfeln.', both);
		assert.deepEqual(
			read.segments
				.filter((segment) => segment.ingredient)
				.map((s) => [s.text, s.ingredient?.name]),
			[
				['Tomaten', 'Tomaten'],
				['Paradeiser', 'Paradeiser']
			]
		);
	});
});
