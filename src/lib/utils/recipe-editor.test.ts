/**
 * The editor's parts and what it posts (→ plan 46): parts move rows, a step
 * that came without links is saved with the matcher's reading as stored
 * links, and `readRecipeForm` reads back exactly what was posted.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { catalog } from '$lib/i18n';
import {
	addPart,
	flatten,
	fromPrefill,
	fromRecipe,
	hasParts,
	keyMaker,
	moveToPart,
	postedFields,
	recheckLinks,
	savedLinks,
	renamePart,
	shiftRow,
	suggestionsFor,
	linkTargets,
	type EditorPart,
	type SavedRecipe
} from './recipe-editor';
import { readRecipeForm } from './recipes';

const lasagne: SavedRecipe = {
	ingredients: [
		{ id: 'i1', name: 'Zwiebel', quantity: 1, unit: null, note: null, section: 'Bolognese' },
		{
			id: 'i2',
			name: 'Karotten',
			quantity: 400,
			unit: 'g',
			note: 'geschält',
			section: 'Bolognese'
		},
		{ id: 'i3', name: 'Butter', quantity: 30, unit: 'g', note: null, section: 'Béchamel' }
	],
	steps: [
		{
			text: 'Zwiebelwürfel und 200 g Karotten anbraten.',
			section: 'Bolognese',
			uses: [{ ingredientId: 'i1', quantity: null, phrase: 'Zwiebelwürfel', amountPhrase: null }],
			timer: null
		},
		{ text: 'Die Butter schmelzen.', section: 'Béchamel', uses: null, timer: null }
	]
};

const names = <T>(parts: EditorPart<T>[]) => parts.map((part) => part.name);

describe('parts', () => {
	it('opens a saved recipe in its parts', () => {
		const state = fromRecipe(lasagne, keyMaker());
		assert.deepEqual(names(state.ingredients), ['Bolognese', 'Béchamel']);
		assert.deepEqual(names(state.steps), ['Bolognese', 'Béchamel']);
		assert.equal(hasParts(state), true);
	});

	it('adds a part below what is there, leaving the rows above without one', () => {
		const key = keyMaker();
		const state = fromPrefill({ ingredientLines: ['1 Zwiebel', '2 Eier'], steps: [] }, key);
		assert.equal(hasParts(state), false);
		const parts = addPart(state.ingredients, 'Béchamel', key);
		assert.deepEqual(names(parts), [null, 'Béchamel']);
		assert.deepEqual(
			flatten(parts).map(({ row, section }) => [row.name, section]),
			[
				['Zwiebel', null],
				['Eier', null]
			]
		);
	});

	it('dissolves a part emptied of its name into the one above', () => {
		const state = fromRecipe(lasagne, keyMaker());
		const parts = renamePart(state.ingredients, 'Béchamel', '  ');
		assert.deepEqual(names(parts), ['Bolognese']);
		assert.deepEqual(
			parts[0].rows.map((row) => row.name),
			['Zwiebel', 'Karotten', 'Butter']
		);
	});

	it('moves a row to the end of any part, and "no part" above every heading', () => {
		const key = keyMaker();
		const state = fromRecipe(lasagne, key);
		const butter = state.ingredients[1].rows[0].id;
		const zwiebel = state.ingredients[0].rows[0].id;
		const moved = moveToPart(state.ingredients, butter, 'Bolognese', key);
		assert.deepEqual(
			moved[0].rows.map((row) => row.name),
			['Zwiebel', 'Karotten', 'Butter']
		);
		const loose = moveToPart(state.ingredients, zwiebel, null, key);
		assert.deepEqual(names(loose), [null, 'Bolognese', 'Béchamel']);
		const third = moveToPart(state.ingredients, zwiebel, 'Schichten', key);
		assert.deepEqual(names(third), ['Bolognese', 'Béchamel', 'Schichten']);
	});

	it('moves a row across a part’s edge one step at a time', () => {
		const state = fromRecipe(lasagne, keyMaker());
		const first = state.steps[1].rows[0].id;
		const up = shiftRow(state.steps, first, -1);
		assert.equal(up[0].rows.length, 2);
		assert.equal(up[1].rows.length, 0);
	});
});

describe('what the editor posts', () => {
	const m = catalog('en');
	const read = (fields: [string, string][]) => {
		const form = new FormData();
		form.set('name', 'Lasagne');
		for (const [name, value] of fields) form.append(name, value);
		const parsed = readRecipeForm(form, m);
		assert.ok('input' in parsed);
		return parsed.input;
	};

	it('posts each ingredient as its fields, with its note and part', () => {
		const input = read(postedFields(fromRecipe(lasagne, keyMaker())));
		assert.deepEqual(input.ingredients?.[1], {
			name: 'Karotten',
			quantity: 400,
			unit: 'g',
			note: 'geschält',
			section: 'Bolognese'
		});
		assert.deepEqual(input.ingredientLines, []);
	});

	it('saves a step that came without links with the matcher’s reading as stored links', () => {
		const input = read(postedFields(fromRecipe(lasagne, keyMaker())));
		assert.deepEqual(input.steps[1].uses, [
			{ ingredient: 2, quantity: null, phrase: 'Butter', amountPhrase: null }
		]);
		// A step that had its links keeps them, and nothing is guessed on top.
		assert.deepEqual(input.steps[0].uses, [
			{ ingredient: 0, quantity: null, phrase: 'Zwiebelwürfel', amountPhrase: null }
		]);
	});

	it('suggests again once a linked step’s text is edited, with the amount beside the word', () => {
		const key = keyMaker();
		const state = fromRecipe(lasagne, key);
		const step = state.steps[0].rows[0];
		assert.deepEqual(suggestionsFor(step, linkTargets(state.ingredients)), []);
		const edited = { ...step, text: `${step.text} Dann 200 g Karotten dazu.` };
		const [offer] = suggestionsFor(edited, linkTargets(state.ingredients));
		assert.equal(offer.phrase, 'Karotten');
		assert.equal(offer.amountPhrase, '200 g');
		assert.equal(offer.quantity, 200);
	});

	it('never posts a link to a row that is gone', () => {
		const state = fromRecipe(lasagne, keyMaker());
		state.ingredients[0].rows.splice(0, 1);
		const input = read(postedFields(state));
		assert.deepEqual(input.steps[0].uses, []);
	});
});

describe('after the review (plan 46)', () => {
	it('saves nothing unasked for a linked step whose text was edited', () => {
		const state = fromRecipe(lasagne, keyMaker());
		const step = state.steps[0].rows[0];
		const edited = { ...step, text: `${step.text} Dann die Karotten dazu.` };
		assert.deepEqual(savedLinks(edited, linkTargets(state.ingredients)), step.links);
	});

	it('checks a row’s links again when its amount changes', () => {
		const state = fromRecipe(lasagne, keyMaker());
		const karotten = state.ingredients[0].rows[1];
		const step = state.steps[0].rows[0];
		step.links.push({
			ingredient: karotten.id,
			phrase: 'Karotten',
			amountPhrase: '200 g',
			quantity: 200
		});
		const halved = recheckLinks(state.steps, { key: karotten.id, quantity: 100, unit: 'g' });
		assert.equal(halved[0].rows[0].links.at(-1)?.quantity, null);
		const kilo = recheckLinks(state.steps, { key: karotten.id, quantity: 1, unit: 'kg' });
		assert.equal(kilo[0].rows[0].links.at(-1)?.quantity, null);
		const more = recheckLinks(state.steps, { key: karotten.id, quantity: 800, unit: 'g' });
		assert.equal(more[0].rows[0].links.at(-1)?.quantity, 200);
	});
});
