/**
 * The review names what the draft was read from (→ plans 45, 48, DECISIONS
 * #342): "the page" only for a page. A paste, photos and a saved recipe's
 * tidy have no page, and a banner saying "Everything else matches the page"
 * over pasted text reads as if the app mixed two recipes up.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { catalog } from '../index';
import { sourceOf } from '$lib/utils/recipe-review';
import type { ImportSource } from '$lib/utils/recipes';

const SOURCES: ImportSource[] = ['page', 'text', 'photo', 'recipe'];

describe('the review’s banner line, per source', () => {
	const en = catalog('en').cooking.import.review;
	const de = catalog('de').cooking.import.review;

	it('says what the draft matches, in English', () => {
		assert.equal(en.restMatches('page'), 'Everything else matches the page.');
		assert.equal(en.restMatches('text'), 'Everything else matches your text.');
		assert.equal(en.restMatches('photo'), 'Everything else matches the photos.');
		assert.equal(en.restMatches('recipe'), 'Everything else matches the saved recipe.');
		assert.equal(en.allMatch('text', 5, 3), 'All 5 ingredients and 3 steps match your text.');
		assert.equal(
			en.allMatch('recipe', 5, 3),
			'All 5 ingredients and 3 steps match the saved recipe.'
		);
	});

	it('says what the draft matches, in German', () => {
		assert.equal(de.restMatches('page'), 'Alles andere stimmt mit der Seite überein.');
		assert.equal(de.restMatches('text'), 'Alles andere stimmt mit deinem Text überein.');
		assert.equal(de.restMatches('photo'), 'Alles andere stimmt mit den Fotos überein.');
		assert.equal(
			de.restMatches('recipe'),
			'Alles andere stimmt mit dem gespeicherten Rezept überein.'
		);
		assert.equal(
			de.allMatch('recipe', 5, 3),
			'Alle 5 Zutaten und 3 Schritte stimmen mit dem gespeicherten Rezept überein.'
		);
	});

	it('names a page only for a page, in every line that names the source', () => {
		for (const from of SOURCES.filter((one) => one !== 'page')) {
			const lines = (t: typeof en) => [
				t.restMatches(from),
				t.allMatch(from, 2, 2),
				t.choice(from, 'A', 'B'),
				t.amountDiffers(from, '500 g', '50 g'),
				t.nameDiffers(from, 'x'),
				t.lineAdded(from, 'x'),
				t.reworded(from, 'x'),
				t.rewordedUnknown(from),
				t.usePageText(from),
				t.servingsPage(from, 'x'),
				t.noSteps(from)
			];
			for (const line of lines(en)) assert.doesNotMatch(line, /\bpage\b/i, `${from}: ${line}`);
			for (const line of lines(de)) assert.doesNotMatch(line, /\bSeite\b/, `${from}: ${line}`);
		}
	});

	it('writes no em dash in any of them', () => {
		for (const from of SOURCES) {
			for (const t of [en, de]) {
				assert.doesNotMatch(
					[t.restMatches(from), t.allMatch(from, 1, 1), t.noSteps(from), t.usePageText(from)].join(
						' '
					),
					/\u2014/
				);
			}
		}
	});
});

describe('sourceOf', () => {
	const prefill = {
		name: 'X',
		timeMinutes: null,
		servings: null,
		ingredientLines: [],
		steps: [],
		photo: null
	};

	it('takes the draft’s own word first', () => {
		assert.equal(sourceOf({ prefill, source: 'text', site: 'chefkoch.de' }), 'text');
	});

	it('reads a draft kept before drafts said: a tidy, a page, photos, a paste', () => {
		assert.equal(sourceOf({ prefill, recipeId: 'r1' }), 'recipe');
		assert.equal(sourceOf({ prefill, site: 'chefkoch.de' }), 'page');
		assert.equal(
			sourceOf({
				prefill: { ...prefill, checks: [{ kind: 'from-photo', level: 'info', at: 'recipe' }] }
			}),
			'photo'
		);
		assert.equal(sourceOf({ prefill }), 'text');
	});
});
