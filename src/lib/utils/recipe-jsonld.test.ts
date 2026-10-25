/**
 * `npm test` — Vitest (→ docs/TESTING.md; born as `node --test` in plan 08).
 *
 * The import parser (→ SPEC §4.7, plan 12) is the app's one reader of a format it
 * doesn't control: whatever a recipe site chose to embed. So the shapes real
 * sites use — `@graph` wrappers, `@type` arrays, `HowToSection`s, a broken block
 * before a good one, German yields and ISO durations — are pinned here, where a
 * regression is a failed test rather than a recipe that imports blank.
 *
 * `$lib` didn't resolve under the original `node --test` runner, which is why this module is
 * pure and imported by its relative path with the extension.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { parseRecipeJsonLd } from './recipe-jsonld.ts';

/**
 * One ingredient: a Recipe with no rows at all is no recipe (a teaser card), so
 * a test about a single field gives its card this much to stand on.
 */
const ROWS = { recipeIngredient: ['1 Ei'] };

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
			page({ '@type': ['Recipe', 'NewsArticle'], name: 'Array-typed', ...ROWS })
		);
		assert.equal(recipe?.name, 'Array-typed');
	});

	it('matches @type case-insensitively', () => {
		const recipe = parseRecipeJsonLd(page({ '@type': 'recipe', name: 'lowercase type', ...ROWS }));
		assert.equal(recipe?.name, 'lowercase type');
	});

	it('takes the first Recipe when a page has several JSON-LD blocks', () => {
		const html =
			`<script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', name: 'Site' })}</script>` +
			`<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Real recipe', ...ROWS })}</script>`;
		assert.equal(parseRecipeJsonLd(html)?.name, 'Real recipe');
	});

	it('skips a malformed block and parses the next', () => {
		const html =
			`<script type="application/ld+json">{ this is not json, }</script>` +
			`<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Survivor', ...ROWS })}</script>`;
		assert.equal(parseRecipeJsonLd(html)?.name, 'Survivor');
	});

	it('handles a top-level array of nodes', () => {
		const html = `<script type="application/ld+json">${JSON.stringify([
			{ '@type': 'BreadcrumbList' },
			{ '@type': 'Recipe', name: 'Array root', ...ROWS }
		])}</script>`;
		assert.equal(parseRecipeJsonLd(html)?.name, 'Array root');
	});
});

describe('parseRecipeJsonLd — time', () => {
	it('sums prepTime + cookTime when there is no totalTime', () => {
		const recipe = parseRecipeJsonLd(
			page({ '@type': 'Recipe', name: 'x', ...ROWS, prepTime: 'PT15M', cookTime: 'PT1H' })
		);
		assert.equal(recipe?.timeMinutes, 75);
	});

	it('reads hours and minutes together', () => {
		const recipe = parseRecipeJsonLd(
			page({ '@type': 'Recipe', name: 'x', ...ROWS, totalTime: 'PT1H30M' })
		);
		assert.equal(recipe?.timeMinutes, 90);
	});

	it('is null for a missing or unparseable duration', () => {
		const recipe = parseRecipeJsonLd(
			page({ '@type': 'Recipe', name: 'x', ...ROWS, totalTime: 'a while' })
		);
		assert.equal(recipe?.timeMinutes, null);
	});
});

describe('parseRecipeJsonLd — servings', () => {
	it('reads a number', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', ...ROWS, recipeYield: 6 }))?.servings,
			6
		);
	});

	it('reads the count out of "4 Portionen"', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', ...ROWS, recipeYield: '4 Portionen' }))
				?.servings,
			4
		);
	});

	it('takes the first of an array yield', () => {
		assert.equal(
			parseRecipeJsonLd(
				page({ '@type': 'Recipe', name: 'x', ...ROWS, recipeYield: ['8', '8 servings'] })
			)?.servings,
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
			page({
				'@type': 'Recipe',
				name: 'x',
				...ROWS,
				recipeInstructions: ['Do this.', 'Then that.']
			})
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

	it('keeps a step’s ingredient lines with its instruction (issue #31)', () => {
		const recipe = parseRecipeJsonLd(
			page({
				'@type': 'Recipe',
				name: 'Quiche',
				recipeInstructions:
					'4Eier (Größe M),\n200 mlSahne (30 % Fett),\netwas Mehl zum Bearbeiten\nEier und Sahne verrühren.\nLachs in Würfel schneiden.'
			})
		);
		assert.deepEqual(recipe?.steps, [
			'4Eier (Größe M), 200 mlSahne (30 % Fett), etwas Mehl zum Bearbeiten Eier und Sahne verrühren.',
			'Lachs in Würfel schneiden.'
		]);
	});

	it('does not make a step of a lone-word name without text (issue #31)', () => {
		const recipe = parseRecipeJsonLd(
			page({
				'@type': 'Recipe',
				name: 'x',
				recipeInstructions: [
					{ '@type': 'HowToStep', name: 'Eier' },
					{ '@type': 'HowToStep', name: 'Eier', text: 'Eier verrühren.' }
				]
			})
		);
		assert.deepEqual(recipe?.steps, ['Eier verrühren.']);
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

	it('joins a HowToStep text sent as an array of fragments into one step', () => {
		const recipe = parseRecipeJsonLd(
			page({
				'@type': 'Recipe',
				name: 'x',
				recipeInstructions: [
					{ '@type': 'HowToStep', text: ['Mit Butter', 'Salz', 'Ei verkneten.'] },
					{ '@type': 'HowToStep', text: ['Ofen vorheizen.', 'Form fetten.'] }
				]
			})
		);
		assert.deepEqual(recipe?.steps, [
			'Mit Butter, Salz, Ei verkneten.',
			// A fragment that already ends a sentence needs no comma after it.
			'Ofen vorheizen. Form fetten.'
		]);
	});
});

/**
 * Issue #31, from the real page: einfachkochen.de sends each `HowToStep.text` as an
 * array, split on every comma. Reading only the first fragment left Schritt 4 as "Eier".
 */
describe('parseRecipeJsonLd — einfachkochen.de (issue #31)', () => {
	const html = readFileSync(
		new URL('./fixtures/einfachkochen-quiche.html', import.meta.url),
		'utf8'
	);
	const steps = parseRecipeJsonLd(html)?.steps ?? [];

	it('keeps Schritt 4 whole, not just "Eier"', () => {
		assert.match(steps[3], /glattrühren/);
		assert.match(steps[3], /Quicheform/);
	});

	it('keeps step 1 to its end', () => {
		assert.match(steps[0], /kaltstellen/);
	});

	it('reads every step the way the page prints it', () => {
		assert.deepEqual(steps, [
			'Für den Teig Mehl und Backpulver mischen. Mit Butter, Salz, Ei und Wasser zu einem glatten Teig verkneten und kaltstellen.',
			'Für die Füllung Spinat auftauen, abtropfen lassen und gut ausdrücken. Knoblauch abziehen und fein würfeln. Porree waschen, abtropfen lassen, putzen und in feine Scheiben schneiden.',
			'Backofen auf 200 Grad Ober- und Unterhitze (Umluft: 180°C) vorheizen. Eine Quicheform (Ø 26 cm) einfetten. Knoblauchwürfel und Porree in einer Pfanne in Öl 1-2 Minuten glasig dünsten, Spinat untermengen und mit Salz, Pfeffer und Muskatnuss abschmecken.',
			'Eier, Sahne, Crème fraîche und Senf glattrühren und mit Salz und Pfeffer würzen. Lachsfilet in 2-3 cm große Würfel schneiden. Teig auf einer bemehlten Arbeitsfläche rund ausrollen (ca. Ø 28 cm), mit bemehlten Händen in die Quicheform drücken und einen Rand formen.',
			'5 EL der Sahnemischung auf dem Teig verteilen, mit Spinat belegen, Lachswürfel gleichmäßig darauf verteilen, leicht eindrücken, mit der restlichen Sahnemischung begießen und im vorgeheizten Ofen auf der untersten Schiene ca. 35 Minuten backen.',
			'Quiche etwas abkühlen lassen, aus der Form lösen, in Stücke schneiden und nach Wunsch mit buntem Blattsalat servieren. Die Quiche ergibt ca. 8 große Stücke. Guten Appetit!'
		]);
	});
});

describe('parseRecipeJsonLd — image', () => {
	it('takes the first of an image array', () => {
		assert.equal(
			parseRecipeJsonLd(
				page({
					'@type': 'Recipe',
					name: 'x',
					...ROWS,
					image: ['https://a/1.jpg', 'https://a/2.jpg']
				})
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
					...ROWS,
					image: { '@type': 'ImageObject', url: 'https://a/hero.jpg' }
				})
			)?.image,
			'https://a/hero.jpg'
		);
	});
});

describe('parseRecipeJsonLd — which Recipe, when a page has several', () => {
	it('takes the one with the most rows over a teaser that comes first', () => {
		const html = page({
			'@graph': [
				{ '@type': 'Recipe', name: 'Teaser', image: 'https://a/t.jpg' },
				{
					'@type': 'Recipe',
					name: 'Real',
					recipeIngredient: ['1 Ei'],
					recipeInstructions: ['Kochen.']
				}
			]
		});
		assert.equal(parseRecipeJsonLd(html)?.name, 'Real');
	});

	it('is null when every Recipe on the page is only a name and a picture', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'Was koche ich heute?' })),
			null
		);
	});

	it('finds a Recipe nested in a WebPage’s mainEntity or an ItemList', () => {
		const nested = page({
			'@type': 'WebPage',
			mainEntity: { '@type': 'Recipe', name: 'Nested', ...ROWS }
		});
		assert.equal(parseRecipeJsonLd(nested)?.name, 'Nested');

		const listed = page({
			'@type': 'ItemList',
			itemListElement: [
				{ '@type': 'ListItem', item: { '@type': 'Recipe', name: 'Listed', ...ROWS } }
			]
		});
		assert.equal(parseRecipeJsonLd(listed)?.name, 'Listed');
	});

	it('reads a type spelled out with its vocabulary, and a script tag without quotes', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'schema:Recipe', name: 'P', ...ROWS }))?.name,
			'P'
		);
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'https://schema.org/Recipe', name: 'U', ...ROWS }))?.name,
			'U'
		);
		const unquoted = `<script type=application/ld+json>${JSON.stringify({ '@type': 'Recipe', name: 'Q', ...ROWS })}</script>`;
		assert.equal(parseRecipeJsonLd(unquoted)?.name, 'Q');
	});
});

describe('parseRecipeJsonLd — tidying what sites send', () => {
	const steps = (recipeInstructions: unknown) =>
		parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', recipeInstructions }))?.steps;
	const lines = (recipeIngredient: string[]) =>
		parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', recipeIngredient }))?.ingredientLines;

	it('splits a method written as one HTML string at its list items, paragraphs and breaks', () => {
		assert.deepEqual(steps('<ol><li>Zwiebeln schneiden.</li><li>Anbraten.</li></ol>'), [
			'Zwiebeln schneiden.',
			'Anbraten.'
		]);
		assert.deepEqual(steps('<p>Zwiebeln schneiden.</p><p>Anbraten.</p>'), [
			'Zwiebeln schneiden.',
			'Anbraten.'
		]);
		assert.deepEqual(steps('Zwiebeln schneiden.<br>Anbraten.<br/>Servieren.'), [
			'Zwiebeln schneiden.',
			'Anbraten.',
			'Servieren.'
		]);
	});

	it('takes leftover numbering off a step', () => {
		assert.deepEqual(
			steps([
				{ '@type': 'HowToStep', text: '1. Kochen.' },
				{ '@type': 'HowToStep', text: 'Schritt 2: Abseihen.' },
				{ '@type': 'HowToStep', text: 'Step 3 – Serve.' }
			]),
			['Kochen.', 'Abseihen.', 'Serve.']
		);
	});

	it('joins a heading step to the step it heads', () => {
		assert.deepEqual(
			steps(['Für die Soße:', 'Butter schmelzen.', 'Mehl einrühren.', 'Zum Servieren:']),
			['Für die Soße: Butter schmelzen.', 'Mehl einrühren.', 'Zum Servieren:']
		);
	});

	it('drops a section title from the ingredients', () => {
		assert.deepEqual(lines(['Für den Teig:', '250 g Mehl', 'Für die Fülle:', '500 g Topfen']), [
			'250 g Mehl',
			'500 g Topfen'
		]);
	});

	it('puts back an ingredient the site split on its own comma', () => {
		assert.deepEqual(lines(['200 ml Milch (1', '8 % Fett)', '1 Zwiebel (rot', 'fein gehackt)']), [
			'200 ml Milch (1,8 % Fett)',
			'1 Zwiebel (rot, fein gehackt)'
		]);
	});

	it('leaves a bracket the site never closed to its own line', () => {
		assert.deepEqual(lines(['1 Dose Tomaten (400 g', 'Salz', 'Pfeffer']), [
			'1 Dose Tomaten (400 g',
			'Salz',
			'Pfeffer'
		]);
	});

	it('decodes text a CMS escaped twice', () => {
		const recipe = parseRecipeJsonLd(
			page({ '@type': 'Recipe', name: 'Mac &amp;amp; Cheese', ...ROWS })
		);
		assert.equal(recipe?.name, 'Mac & Cheese');
	});

	it('reads decimal hours', () => {
		assert.equal(
			parseRecipeJsonLd(page({ '@type': 'Recipe', name: 'x', ...ROWS, totalTime: 'PT1.5H' }))
				?.timeMinutes,
			90
		);
	});
});

describe('parseRecipeJsonLd — zuckerjagdwurst.com (section titles, numbered steps)', () => {
	const recipe = parseRecipeJsonLd(
		readFileSync('src/lib/utils/fixtures/zuckerjagdwurst-curry.html', 'utf8')
	);

	it('keeps no section title as an ingredient', () => {
		assert.ok(recipe?.ingredientLines.length);
		assert.ok(recipe!.ingredientLines.every((line) => !line.endsWith(':')));
		assert.equal(recipe!.ingredientLines[0], '3 Orangen (z. B. von gebana)');
	});

	it('numbers no step, and heads the first with its section', () => {
		assert.ok(recipe!.steps.every((step) => !/^\d+\.\s/.test(step)));
		assert.match(recipe!.steps[0], /^Orangensalat \(.*\): Orangen schälen/);
		assert.equal(recipe!.steps.length, 13);
	});
});

describe('parseRecipeJsonLd — einfachkochen.de (an ingredient split on its comma)', () => {
	it('reads the milk as one line', () => {
		const recipe = parseRecipeJsonLd(
			readFileSync('src/lib/utils/fixtures/einfachkochen-kaiserschmarrn.html', 'utf8')
		);
		assert.ok(recipe?.ingredientLines.includes('200 ml Milch (1,8 % Fett)'));
		assert.ok(!recipe?.ingredientLines.includes('8 % Fett)'));
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
