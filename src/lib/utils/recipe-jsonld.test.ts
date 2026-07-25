/**
 * `npm test` — plain `node --test`, no framework (→ docs/plans/08-cook-mode.md).
 *
 * The import parser (→ SPEC §4.7, plan 12) is the app's one reader of a format it
 * doesn't control: whatever a recipe site chose to embed. So the shapes real
 * sites use — `@graph` wrappers, `@type` arrays, `HowToSection`s, a broken block
 * before a good one, German yields and ISO durations — are pinned here, where a
 * regression is a failed test rather than a recipe that imports blank.
 *
 * `$lib` doesn't resolve under `node --test`, which is exactly why this module is
 * pure and imported by its relative path with the extension.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRecipeJsonLd } from './recipe-jsonld.ts';

/** Wrap a JSON-LD object the way a page carries it. */
function page(jsonLd: unknown): string {
	return `<!doctype html><html><head><title>x</title>
		<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
		</head><body>…</body></html>`;
}

describe('parseRecipeJsonLd — the common case', () => {
	const recipe = parseRecipeJsonLd(
		page({
			'@context': 'https://schema.org',
			'@type': 'Recipe',
			name: 'Creamy mushroom pasta',
			totalTime: 'PT35M',
			recipeYield: '4',
			image: 'https://example.com/pasta.jpg',
			recipeIngredient: ['500 g Mehl', '2 EL Olivenöl', 'Salz'],
			recipeInstructions: [
				{ '@type': 'HowToStep', text: 'Boil the pasta.' },
				{ '@type': 'HowToStep', text: 'Fry the mushrooms.' }
			]
		})
	);

	it('reads name, time, servings and image', () => {
		assert.ok(recipe);
		assert.equal(recipe.name, 'Creamy mushroom pasta');
		assert.equal(recipe.timeMinutes, 35);
		assert.equal(recipe.servings, 4);
		assert.equal(recipe.image, 'https://example.com/pasta.jpg');
	});

	it('keeps ingredient lines raw for the editor to parse', () => {
		assert.deepEqual(recipe?.ingredientLines, ['500 g Mehl', '2 EL Olivenöl', 'Salz']);
	});

	it('flattens HowToStep objects to step texts in order', () => {
		assert.deepEqual(recipe?.steps, ['Boil the pasta.', 'Fry the mushrooms.']);
	});
});

describe('parseRecipeJsonLd — the shapes real sites use', () => {
	it('finds a Recipe inside a @graph wrapper (Yoast et al.)', () => {
		const recipe = parseRecipeJsonLd(
			page({
				'@context': 'https://schema.org',
				'@graph': [
					{ '@type': 'WebSite', name: 'A food blog' },
					{ '@type': 'Recipe', name: 'Graph pasta', recipeIngredient: ['pasta'] }
				]
			})
		);
		assert.equal(recipe?.name, 'Graph pasta');
		assert.deepEqual(recipe?.ingredientLines, ['pasta']);
	});

	it('matches @type given as an array', () => {
		const recipe = parseRecipeJsonLd(
			page({ '@type': ['Recipe', 'NewsArticle'], name: 'Array-typed' })
		);
		assert.equal(recipe?.name, 'Array-typed');
	});

	it('matches @type case-insensitively', () => {
		const recipe = parseRecipeJsonLd(page({ '@type': 'recipe', name: 'lowercase type' }));
		assert.equal(recipe?.name, 'lowercase type');
	});

	it('takes the first Recipe when a page has several JSON-LD blocks', () => {
		const html =
			`<script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', name: 'Site' })}</script>` +
			`<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Real recipe' })}</script>`;
		assert.equal(parseRecipeJsonLd(html)?.name, 'Real recipe');
	});

	it('skips a malformed block and parses the next', () => {
		const html =
			`<script type="application/ld+json">{ this is not json, }</script>` +
			`<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Survivor' })}</script>`;
		assert.equal(parseRecipeJsonLd(html)?.name, 'Survivor');
	});

	it('handles a top-level array of nodes', () => {
		const html = `<script type="application/ld+json">${JSON.stringify([
			{ '@type': 'BreadcrumbList' },
			{ '@type': 'Recipe', name: 'Array root' }
		])}</script>`;
		assert.equal(parseRecipeJsonLd(html)?.name, 'Array root');
	});
});

describe('parseRecipeJsonLd — time', () => {
	it('sums prepTime + cookTime when there is no totalTime', () => {
		const recipe = parseRecipeJsonLd(
			page({ '@type': 'Recipe', name: 'x', prepTime: 'PT15M', cookTime: 'PT1H' })
		);
		assert.equal(recipe?.timeMinutes, 75);
	});

	it('reads hours and minutes together', () => {
		const recipe = parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', totalTime: 'PT1H30M' }));
		assert.equal(recipe?.timeMinutes, 90);
	});

	it('is null for a missing or unparseable duration', () => {
		const recipe = parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', totalTime: 'a while' }));
		assert.equal(recipe?.timeMinutes, null);
	});
});

describe('parseRecipeJsonLd — servings', () => {
	it('reads a number', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', recipeYield: 6 }))?.servings,
			6
		);
	});

	it('reads the count out of "4 Portionen"', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', recipeYield: '4 Portionen' }))
				?.servings,
			4
		);
	});

	it('takes the first of an array yield', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', recipeYield: ['8', '8 servings'] }))
				?.servings,
			8
		);
	});
});

describe('parseRecipeJsonLd — instructions', () => {
	it('flattens HowToSection into its steps', () => {
		const recipe = parseRecipeJsonLd(
			page({
				'@type': 'Recipe',
				name: 'x',
				recipeInstructions: [
					{
						'@type': 'HowToSection',
						name: 'Sauce',
						itemListElement: [
							{ '@type': 'HowToStep', text: 'Chop the onion.' },
							{ '@type': 'HowToStep', text: 'Simmer.' }
						]
					},
					{ '@type': 'HowToStep', text: 'Serve.' }
				]
			})
		);
		assert.deepEqual(recipe?.steps, ['Chop the onion.', 'Simmer.', 'Serve.']);
	});

	it('accepts an array of plain strings', () => {
		const recipe = parseRecipeJsonLd(
			page({ '@type': 'Recipe', name: 'x', recipeInstructions: ['Do this.', 'Then that.'] })
		);
		assert.deepEqual(recipe?.steps, ['Do this.', 'Then that.']);
	});

	it('splits a single newline-separated string into steps', () => {
		const recipe = parseRecipeJsonLd(
			page({
				'@type': 'Recipe',
				name: 'x',
				recipeInstructions: 'Step one.\nStep two.\nStep three.'
			})
		);
		assert.deepEqual(recipe?.steps, ['Step one.', 'Step two.', 'Step three.']);
	});

	it('strips tags and decodes entities in step text', () => {
		const recipe = parseRecipeJsonLd(
			page({
				'@type': 'Recipe',
				name: 'x',
				recipeInstructions: [{ '@type': 'HowToStep', text: 'Salz &amp; Pfeffer<br>dazugeben.' }]
			})
		);
		assert.deepEqual(recipe?.steps, ['Salz & Pfeffer dazugeben.']);
	});
});

describe('parseRecipeJsonLd — image', () => {
	it('takes the first of an image array', () => {
		assert.equal(
			parseRecipeJsonLd(
				page({ '@type': 'Recipe', name: 'x', image: ['https://a/1.jpg', 'https://a/2.jpg'] })
			)?.image,
			'https://a/1.jpg'
		);
	});

	it('reads an ImageObject url', () => {
		assert.equal(
			parseRecipeJsonLd(
				page({
					'@type': 'Recipe',
					name: 'x',
					image: { '@type': 'ImageObject', url: 'https://a/hero.jpg' }
				})
			)?.image,
			'https://a/hero.jpg'
		);
	});
});

describe('parseRecipeJsonLd — nothing to import', () => {
	it('is null on a page with no JSON-LD at all', () => {
		assert.equal(parseRecipeJsonLd('<html><body>no recipe here</body></html>'), null);
	});

	it('is null when the JSON-LD has no Recipe', () => {
		assert.equal(parseRecipeJsonLd(page({ '@type': 'Article', name: 'Not a recipe' })), null);
	});

	it('is null (not a throw) when every block is malformed', () => {
		assert.equal(parseRecipeJsonLd('<script type="application/ld+json">{oops</script>'), null);
	});
});
