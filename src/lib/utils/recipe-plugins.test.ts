/**
 * Parts read off a page's markup (→ plan 44, `recipe-plugins.ts`): only where
 * the markup agrees with the card's lines, row for row. The real pages are in
 * `recipe-corpus.test.ts`; these are the shapes, small.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { pageIngredientSections } from './recipe-plugins.ts';

const LINES = ['250 g Mehl', '2 Eier', '500 g Topfen', '100 g Zucker'];

describe('pageIngredientSections', () => {
	it('reads WP Recipe Maker groups, skipping one with no rows', () => {
		const html = `<div class="wprm-recipe-ingredients-container">
			<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name">Du benötigst eine Form</h4></div>
			<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name">FÜR DEN TEIG</h4><ul>
				<li class="wprm-recipe-ingredient"><span>250</span> <span>g</span> <span>Mehl</span></li>
				<li class="wprm-recipe-ingredient">2 Eier</li></ul></div>
			<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name">Für die Fülle:</h4><ul>
				<li class="wprm-recipe-ingredient">500 g Topfen</li>
				<li class="wprm-recipe-ingredient">100 g Zucker</li></ul></div></div>`;
		assert.deepEqual(pageIngredientSections(html, LINES), ['Teig', 'Teig', 'Fülle', 'Fülle']);
	});

	it('reads Tasty Recipes headings; the rows before the first have no part', () => {
		const html = `<div class="tasty-recipes-ingredients-body"><ul><li>250 g Mehl</li><li>2 Eier</li></ul>
			<h4>Cream Cheese Frosting</h4><ul><li>500 g Topfen</li><li>100 g Zucker</li></ul></div>`;
		assert.deepEqual(pageIngredientSections(html, LINES), [
			null,
			null,
			'Cream Cheese Frosting',
			'Cream Cheese Frosting'
		]);
	});

	it('reads a table per part, its heading inside it or just before it', () => {
		const html = `<table><tr><td>Kalorien</td><td>300</td></tr></table>
			<table><thead><tr><th><h3>Für den Teig:</h3></th></tr></thead>
				<tr><td>250 g</td><td>Mehl</td></tr><tr><td>2</td><td>Eier</td></tr></table>
			<div class="recipe__title">Für die Fülle</div><div class="rule"></div>
			<table><tr><td>500 g</td><td>Topfen</td></tr><tr><td>100 g</td><td>Zucker</td></tr></table>`;
		assert.deepEqual(pageIngredientSections(html, LINES), ['Teig', 'Teig', 'Fülle', 'Fülle']);
	});

	it('matches rows within a part in any order (gutekueche.at sorts its card)', () => {
		const html = `<h3>Teig</h3><table><tr><td>2 Eier</td></tr><tr><td>250 g Mehl</td></tr></table>
			<h3>Fülle</h3><table><tr><td>100 g Zucker</td></tr><tr><td>500 g Topfen</td></tr></table>`;
		assert.deepEqual(pageIngredientSections(html, LINES), ['Teig', 'Teig', 'Fülle', 'Fülle']);
	});

	it('is null when the markup has another number of rows than the card', () => {
		const html = `<div class="tasty-recipes-ingredients-body"><ul><li>250 g Mehl</li></ul>
			<h4>Frosting</h4><ul><li>500 g Topfen</li></ul></div>`;
		assert.equal(pageIngredientSections(html, LINES), null);
	});

	it('is null when a row shares no word with its part’s lines', () => {
		const html = `<h3>Teig</h3><table><tr><td>2 Eier</td></tr><tr><td>500 g Topfen</td></tr></table>
			<h3>Fülle</h3><table><tr><td>100 g Zucker</td></tr><tr><td>250 g Mehl</td></tr></table>`;
		assert.equal(pageIngredientSections(html, LINES), null);
	});

	it('is null when no group has a name', () => {
		const html = `<table><tr><td>250 g Mehl</td></tr><tr><td>2 Eier</td></tr></table>
			<table><tr><td>500 g Topfen</td></tr><tr><td>100 g Zucker</td></tr></table>`;
		assert.equal(pageIngredientSections(html, LINES), null);
	});
});
