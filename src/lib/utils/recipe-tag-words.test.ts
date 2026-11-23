/**
 * Page labels → tags, and ingredient names → a diet guess (→ plan 41).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { guessDiet } from './diet-guess';
import { tagsFromLabels, words } from './recipe-tag-words';

describe('words', () => {
	it('folds case, umlauts and ß, and splits on anything not a letter', () => {
		assert.deepEqual(words('Süßspeise, GLUTEN-free'), ['sussspeise', 'gluten', 'free']);
		assert.deepEqual(words('Crème fraîche'), ['creme', 'fraiche']);
	});
});

describe('tagsFromLabels', () => {
	it('reads a German category and keyword list', () => {
		assert.deepEqual(tagsFromLabels(['Hauptspeise', 'vegan, schnell, Abendessen']), {
			tags: ['meal:dinner', 'kind:main'],
			diet: 'vegan'
		});
	});

	it('reads English labels, arrays of them and comma strings alike', () => {
		assert.deepEqual(tagsFromLabels(['Main Course', 'Soup', 'easy; weeknight; lunch']), {
			tags: ['meal:lunch', 'kind:main', 'kind:soup'],
			diet: null
		});
	});

	it('reads schema.org diets, URL or bare', () => {
		assert.deepEqual(
			tagsFromLabels([
				'https://schema.org/VegetarianDiet',
				'GlutenFreeDiet',
				'http://schema.org/LowLactoseDiet'
			]),
			{ tags: ['free:gluten', 'free:lactose'], diet: 'vegetarian' }
		);
	});

	it('lets vegan beat vegetarian', () => {
		assert.equal(tagsFromLabels(['vegetarisch', 'vegan']).diet, 'vegan');
	});

	it('matches whole words only', () => {
		// "Salatgurke" is not a salad, "Brotzeit" is not bread, "Suppengrün" is not a soup.
		assert.deepEqual(tagsFromLabels(['Salatgurke, Brotzeit, Suppengrün, Germknödel']), {
			tags: [],
			diet: null
		});
	});

	it('folds umlauts and ß on both sides', () => {
		assert.deepEqual(tagsFromLabels(['Süßspeisen', 'Frühstück', 'Plätzchen']).tags, [
			'meal:breakfast',
			'kind:dessert',
			'kind:baking'
		]);
	});

	it('reads no snack into a starter, and no soup into a stew', () => {
		assert.deepEqual(tagsFromLabels(['Vorspeise', 'appetizer', 'Beef stew']), {
			tags: [],
			diet: null
		});
	});

	it('never reads meat or fish off a page', () => {
		assert.deepEqual(tagsFromLabels(['Fleisch', 'Fisch', 'meat', 'fish']), {
			tags: [],
			diet: null
		});
	});

	it('finds nothing in nothing', () => {
		assert.deepEqual(tagsFromLabels([]), { tags: [], diet: null });
		assert.deepEqual(tagsFromLabels(['', '  ,  ']), { tags: [], diet: null });
	});
});

describe('guessDiet', () => {
	it('meat wins, in English and in German compounds', () => {
		assert.equal(guessDiet(['Spaghetti', 'Guanciale', 'Eggs']), 'meat');
		assert.equal(guessDiet(['500 g Rinderhackfleisch', 'Zwiebel']), 'meat');
		assert.equal(guessDiet(['Hühnerbrühe', 'Reis']), 'meat');
		assert.equal(guessDiet(['Faschiertes', 'Semmelbrösel']), 'meat');
	});

	it('then fish', () => {
		assert.equal(guessDiet(['Lachsfilet', 'Dill', 'Butter']), 'fish');
		assert.equal(guessDiet(['Salmon', 'Potatoes', 'Lemon']), 'fish');
		assert.equal(guessDiet(['Fischsauce', 'Reisnudeln']), 'fish');
	});

	it('then vegetarian for eggs, dairy or honey', () => {
		assert.equal(guessDiet(['Mehl', 'Eier', 'Milch']), 'vegetarian');
		assert.equal(guessDiet(['Pasta', 'Mushrooms', 'Cream', 'Parmesan']), 'vegetarian');
		assert.equal(guessDiet(['Haferflocken', 'Honig']), 'vegetarian');
		assert.equal(guessDiet(['Sauerrahm', 'Kartoffeln']), 'vegetarian');
	});

	it('else vegan, plant milks and butters included', () => {
		assert.equal(guessDiet(['Rote Linsen', 'Kokosmilch', 'Spinat']), 'vegan');
		assert.equal(guessDiet(['Oats', 'Oat milk', 'Banana', 'Peanut butter']), 'vegan');
		assert.equal(guessDiet(['Butternut squash', 'Onion']), 'vegan');
	});

	it('is not fooled by words that only look like meat', () => {
		assert.equal(guessDiet(['Fleischtomaten', 'Basilikum', 'Olivenöl']), 'vegan');
		assert.equal(guessDiet(["Lamb's lettuce", 'Walnuts']), 'vegan');
		assert.equal(guessDiet(['Eggplant', 'Tahini']), 'vegan');
		assert.equal(guessDiet(['Honigmelone', 'Minze']), 'vegan');
		assert.equal(guessDiet(['Fruchtfleisch von 2 Avocados', 'Limette']), 'vegan');
		assert.equal(guessDiet(['Butterkürbis', 'Coconut cream', 'Sojajoghurt']), 'vegan');
		assert.equal(guessDiet(['Leberkäse', 'Semmel']), 'meat');
	});

	it('makes no guess for gelatine without meat, or for no ingredients', () => {
		assert.equal(guessDiet(['Sahne', 'Zucker', 'Blattgelatine']), null);
		assert.equal(guessDiet([]), null);
	});
});
