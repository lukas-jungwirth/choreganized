/**
 * The Microdata reader (→ plan 22): the second shape a recipe card comes in,
 * for the sites that write it into their visible HTML rather than a JSON-LD
 * script. The cases are the shapes Microdata actually takes — meta tags for
 * hidden values, nested items whose properties are not the recipe's, steps as
 * `HowToStep` items or as one plain list.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseRecipeMicrodata } from './recipe-microdata';

const page = (body: string) =>
	`<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;

describe('parseRecipeMicrodata', () => {
	it('reads a classic recipe card', () => {
		const recipe = parseRecipeMicrodata(
			page(`
			<article itemscope itemtype="https://schema.org/Recipe">
				<h1 itemprop="name">Kaiserschmarrn</h1>
				<img itemprop="image" src="/img/schmarrn.jpg" alt="">
				<span itemprop="author" itemscope itemtype="https://schema.org/Person">
					von <span itemprop="name">Oma Gerti</span>
				</span>
				<meta itemprop="totalTime" content="PT35M">
				<p>Für <span itemprop="recipeYield">4 Portionen</span></p>
				<ul>
					<li itemprop="recipeIngredient">250 g Mehl</li>
					<li itemprop="recipeIngredient">4 &amp; ein halbes Ei</li>
					<li itemprop="recipeIngredient">500 ml Milch</li>
				</ul>
				<div itemprop="recipeInstructions">
					<ol>
						<li>Teig rühren und 10 Minuten rasten lassen.</li>
						<li>In Butter herausbacken und zerreißen.</li>
					</ol>
				</div>
			</article>`)
		);

		assert.deepEqual(recipe, {
			name: 'Kaiserschmarrn',
			timeMinutes: 35,
			servings: 4,
			ingredientLines: ['250 g Mehl', '4 & ein halbes Ei', '500 ml Milch'],
			steps: ['Teig rühren und 10 Minuten rasten lassen.', 'In Butter herausbacken und zerreißen.'],
			image: '/img/schmarrn.jpg'
		});
	});

	it('does not take a nested item’s name for the recipe’s', () => {
		const recipe = parseRecipeMicrodata(
			page(`
			<div itemscope itemtype="http://schema.org/Recipe">
				<div itemprop="author" itemscope itemtype="http://schema.org/Person">
					<span itemprop="name">Lukas</span>
				</div>
				<h2 itemprop="name">Linsencurry</h2>
				<span itemprop="recipeIngredient">200 g rote Linsen</span>
			</div>`)
		);
		assert.equal(recipe?.name, 'Linsencurry');
	});

	it('reads HowToStep items, and prep + cook time when there is no total', () => {
		const recipe = parseRecipeMicrodata(
			page(`
			<div itemscope itemtype="https://schema.org/Recipe">
				<span itemprop="name">Pasta</span>
				<time itemprop="prepTime" datetime="PT10M">10 min</time>
				<time itemprop="cookTime" datetime="PT15M">15 min</time>
				<div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
					<span itemprop="text">Boil the pasta.</span>
				</div>
				<div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
					<span itemprop="text">Toss with the sauce.</span>
				</div>
			</div>`)
		);

		assert.equal(recipe?.timeMinutes, 25);
		assert.deepEqual(recipe?.steps, ['Boil the pasta.', 'Toss with the sauce.']);
	});

	it('splits one plain method into steps, dropping their numbers', () => {
		const recipe = parseRecipeMicrodata(
			page(`
			<div itemscope itemtype="https://schema.org/Recipe">
				<span itemprop="name">Toast</span>
				<div itemprop="recipeInstructions"><p>1. Toast the bread.</p><p>2. Butter it.</p></div>
			</div>`)
		);
		assert.deepEqual(recipe?.steps, ['Toast the bread.', 'Butter it.']);
	});

	it('keeps a step with an ingredient list as one step (issue #31)', () => {
		const recipe = parseRecipeMicrodata(
			page(`
			<div itemscope itemtype="https://schema.org/Recipe">
				<span itemprop="name">Quiche</span>
				<div itemprop="recipeInstructions" itemscope itemtype="https://schema.org/HowToStep">
					<span itemprop="name">Eier</span>
					<ul><li>4 Eier</li><li>200 ml Sahne</li></ul>
					<p>Eier und Sahne verrühren.</p>
				</div>
			</div>`)
		);
		assert.deepEqual(recipe?.steps, ['Eier 4 Eier 200 ml Sahne Eier und Sahne verrühren.']);
	});

	it('does not split a nested list inside a plain method’s paragraph', () => {
		const recipe = parseRecipeMicrodata(
			page(`
			<div itemscope itemtype="https://schema.org/Recipe">
				<span itemprop="name">Quiche</span>
				<div itemprop="recipeInstructions">
					<li>Zutaten mischen: <ul><li>Eier</li><li>Sahne</li></ul> Dann backen.</li>
					<li>Servieren.</li>
				</div>
			</div>`)
		);
		assert.equal(recipe?.steps.length, 2);
		assert.match(recipe!.steps[0], /Eier.*Sahne.*Dann backen/);
	});

	it('takes a type list and a meta image', () => {
		const recipe = parseRecipeMicrodata(
			page(`
			<div itemscope itemtype="https://schema.org/Thing https://schema.org/Recipe">
				<meta itemprop="name" content="Gulasch">
				<link itemprop="image" href="https://example.test/gulasch.jpg">
				<span itemprop="ingredients">1 kg Rindfleisch</span>
			</div>`)
		);
		assert.equal(recipe?.name, 'Gulasch');
		assert.equal(recipe?.image, 'https://example.test/gulasch.jpg');
		assert.deepEqual(recipe?.ingredientLines, ['1 kg Rindfleisch']);
	});

	it('is null for a page without one, or for an empty template stub', () => {
		assert.equal(parseRecipeMicrodata(page('<p>Just a blog post.</p>')), null);
		assert.equal(
			parseRecipeMicrodata(
				page(
					'<div itemscope itemtype="https://schema.org/Person"><span itemprop="name">X</span></div>'
				)
			),
			null
		);
		assert.equal(
			parseRecipeMicrodata(page('<div itemscope itemtype="https://schema.org/Recipe"></div>')),
			null
		);
	});
});
