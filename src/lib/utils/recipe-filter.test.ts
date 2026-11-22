/**
 * The library's filters and sort (→ plan 40): one pure module behind both the
 * grid and the sheet's live count, so these are the rules both halves keep.
 * The sample is the sketch's library (`design/sketches/recipe-filters.html`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	applyRecipeFilter,
	emptyFilter,
	filterAtoms,
	matchesRecipeFilter,
	parseRecipeFilter,
	quickAtomUseful,
	QUICK_ATOMS,
	recipeFacets,
	recipeFilterHref,
	recipeFilterParams,
	sortRecipes,
	withAtom,
	withoutAtom,
	type FilterableRecipe,
	type RecipeFilter
} from './recipe-filter';
import type { RecipeTag } from './recipe-tags';
import { RECIPE_TAGS, TAG_GROUPS, readRecipeTags, readRecipeDiet } from './recipe-tags';

const collator = new Intl.Collator('en');

let added = 100;
function recipe(
	name: string,
	timeMinutes: number | null,
	tags: RecipeTag[],
	diet: FilterableRecipe['diet'],
	extra: Partial<FilterableRecipe> = {}
): FilterableRecipe {
	added -= 1;
	return {
		id: name.toLowerCase().replace(/\W+/g, '-'),
		name,
		timeMinutes,
		createdAt: added,
		tags,
		diet,
		favourite: false,
		lastPlanned: null,
		...extra
	};
}

// Newest first, the order they're declared in.
const LIBRARY = [
	recipe(
		'Shakshuka',
		30,
		['meal:breakfast', 'meal:lunch', 'kind:main', 'free:gluten'],
		'vegetarian',
		{
			favourite: true,
			lastPlanned: '2026-11-10'
		}
	),
	recipe('Overnight oats', 10, ['meal:breakfast', 'free:lactose'], 'vegan', {
		lastPlanned: '2026-11-20'
	}),
	recipe(
		'Pumpkin soup',
		40,
		['meal:lunch', 'meal:dinner', 'kind:soup', 'free:gluten', 'free:lactose'],
		'vegan',
		{
			favourite: true,
			lastPlanned: '2026-10-23'
		}
	),
	recipe('Spaghetti carbonara', 25, ['meal:dinner', 'kind:main'], 'meat', {
		favourite: true,
		lastPlanned: '2026-11-16'
	}),
	recipe('Greek salad', 15, ['meal:lunch', 'kind:salad', 'free:gluten'], 'vegetarian'),
	recipe('Salmon with lemon potatoes', 35, ['meal:dinner', 'kind:main', 'free:gluten'], 'fish', {
		lastPlanned: '2026-10-08'
	}),
	recipe(
		'Chili sin carne',
		50,
		['meal:dinner', 'kind:main', 'free:gluten', 'free:lactose'],
		'vegan'
	),
	recipe('Lentil dal', 35, ['meal:dinner', 'kind:main', 'free:gluten', 'free:lactose'], 'vegan'),
	recipe('Untagged stew', null, [], null)
];

const names = (list: FilterableRecipe[]) => list.map((r) => r.name);
const run = (filter: Partial<RecipeFilter>) =>
	names(applyRecipeFilter(LIBRARY, { ...emptyFilter(), ...filter }, collator));

describe('the tag vocabulary', () => {
	it('lists every group value once, as a tag', () => {
		const fromGroups = Object.entries(TAG_GROUPS).flatMap(([group, values]) =>
			values.map((value) => `${group}:${value}`)
		);
		assert.deepEqual([...RECIPE_TAGS], fromGroups);
	});

	it('reads tags off a form: known ones once each, in list order, junk dropped', () => {
		assert.deepEqual(readRecipeTags(['kind:soup', 'meal:dinner', 'meal:brunch', 'kind:soup', 7]), [
			'meal:dinner',
			'kind:soup'
		]);
		assert.equal(readRecipeDiet('vegan'), 'vegan');
		assert.equal(readRecipeDiet('pescatarian'), null);
	});
});

describe('the URL', () => {
	it('parses what the app writes and ignores the rest', () => {
		const filter = parseRecipeFilter(
			new URLSearchParams(
				'meal=dinner&meal=brunch&kind=soup&diet=vegetarian&diet=carnivore&free=gluten&max=30&fav=1&sort=quick'
			)
		);
		assert.deepEqual(filter, {
			meals: ['dinner'],
			kinds: ['soup'],
			diets: ['vegetarian'],
			free: ['gluten'],
			max: 30,
			favourites: true,
			sort: 'quick'
		});
	});

	it('reads nonsense as no filter at all', () => {
		assert.deepEqual(
			parseRecipeFilter(new URLSearchParams('max=25&fav=yes&sort=random&meal=')),
			emptyFilter()
		);
	});

	it('repeats a value once, in list order', () => {
		assert.deepEqual(
			parseRecipeFilter(new URLSearchParams('meal=dinner&meal=breakfast&meal=dinner')).meals,
			['breakfast', 'dinner']
		);
	});

	it('round-trips, leaving defaults out', () => {
		const filter: RecipeFilter = {
			...emptyFilter(),
			meals: ['lunch', 'dinner'],
			diets: ['vegan'],
			max: 45,
			sort: 'stale'
		};
		assert.deepEqual(parseRecipeFilter(recipeFilterParams(filter, 'soup')), filter);
		assert.equal(recipeFilterParams(filter, 'soup').get('q'), 'soup');
		assert.equal(recipeFilterHref(emptyFilter()), '/cooking/recipes');
		assert.equal(
			recipeFilterHref({ ...emptyFilter(), diets: ['vegetarian'] }),
			'/cooking/recipes?diet=vegetarian'
		);
	});
});

describe('matching', () => {
	it('is "any of" inside a group', () => {
		assert.deepEqual(run({ meals: ['breakfast', 'lunch'] }), [
			'Shakshuka',
			'Overnight oats',
			'Pumpkin soup',
			'Greek salad'
		]);
	});

	it('narrows across groups', () => {
		assert.deepEqual(run({ meals: ['dinner'], diets: ['vegetarian'] }), [
			'Pumpkin soup',
			'Chili sin carne',
			'Lentil dal'
		]);
	});

	it('counts vegan as vegetarian, not the other way round', () => {
		assert.deepEqual(run({ diets: ['vegetarian'] }).length, 6);
		assert.deepEqual(run({ diets: ['vegan'] }), [
			'Overnight oats',
			'Pumpkin soup',
			'Chili sin carne',
			'Lentil dal'
		]);
	});

	it('matches no diet filter when nobody set the diet', () => {
		const stew = LIBRARY.at(-1)!;
		for (const diet of ['meat', 'fish', 'vegetarian', 'vegan'] as const) {
			assert.equal(matchesRecipeFilter(stew, { ...emptyFilter(), diets: [diet] }), false);
		}
	});

	it('needs every free-from ticked', () => {
		assert.deepEqual(run({ free: ['gluten', 'lactose'] }), [
			'Pumpkin soup',
			'Chili sin carne',
			'Lentil dal'
		]);
	});

	it('drops a recipe with no time once a cap is set', () => {
		assert.deepEqual(run({ max: 20 }), ['Overnight oats', 'Greek salad']);
		assert.equal(run({ max: 60 }).includes('Untagged stew'), false);
		assert.equal(run({}).includes('Untagged stew'), true);
	});

	it('keeps favourites', () => {
		assert.deepEqual(run({ favourites: true }), [
			'Shakshuka',
			'Pumpkin soup',
			'Spaghetti carbonara'
		]);
	});
});

describe('sorting', () => {
	it('newest first by default', () => {
		assert.equal(run({})[0], 'Shakshuka');
		assert.equal(run({}).at(-1), 'Untagged stew');
	});

	it('A–Z in the reader’s language', () => {
		const de = new Intl.Collator('de');
		const list = [
			recipe('Zwiebelkuchen', 60, [], null),
			recipe('Äpfel im Schlafrock', 40, [], null)
		];
		assert.deepEqual(names(sortRecipes(list, 'az', de)), ['Äpfel im Schlafrock', 'Zwiebelkuchen']);
	});

	it('quickest first, no time last, ties by name', () => {
		const sorted = run({ sort: 'quick' });
		assert.deepEqual(sorted.slice(0, 3), ['Overnight oats', 'Greek salad', 'Spaghetti carbonara']);
		assert.deepEqual(sorted.slice(4, 6), ['Lentil dal', 'Salmon with lemon potatoes']);
		assert.equal(sorted.at(-1), 'Untagged stew');
	});

	it('not cooked lately: never planned first, then the longest ago', () => {
		assert.deepEqual(run({ sort: 'stale' }), [
			'Chili sin carne',
			'Greek salad',
			'Lentil dal',
			'Untagged stew',
			'Salmon with lemon potatoes',
			'Pumpkin soup',
			'Shakshuka',
			'Spaghetti carbonara',
			'Overnight oats'
		]);
	});
});

describe('atoms', () => {
	const filter: RecipeFilter = {
		...emptyFilter(),
		meals: ['dinner'],
		diets: ['vegan'],
		max: 30,
		favourites: true,
		sort: 'az'
	};

	it('lists each switched-on filter, quick ones first, never the sort', () => {
		assert.deepEqual(filterAtoms(filter), [
			{ group: 'favourites' },
			{ group: 'max', value: 30 },
			{ group: 'meals', value: 'dinner' },
			{ group: 'diets', value: 'vegan' }
		]);
	});

	it('takes one off and puts it back', () => {
		const without = withoutAtom(filter, { group: 'meals', value: 'dinner' });
		assert.deepEqual(without.meals, []);
		assert.deepEqual(withAtom(without, { group: 'meals', value: 'dinner' }), filter);
		assert.equal(withoutAtom(filter, { group: 'max', value: 30 }).max, null);
		assert.equal(withoutAtom(filter, { group: 'favourites' }).favourites, false);
	});
});

describe('facets', () => {
	it('offers a group only once a recipe uses it', () => {
		const untagged = [recipe('Plain', 25, [], null), recipe('Plainer', null, [], null)];
		const facets = recipeFacets(untagged);
		assert.deepEqual(facets, {
			meals: false,
			kinds: false,
			diets: false,
			free: false,
			time: true,
			favourites: false,
			hearted: 0,
			meatFree: false,
			quick: true
		});
		assert.deepEqual(
			QUICK_ATOMS.filter((atom) => quickAtomUseful(atom, facets)),
			[{ group: 'max', value: 30 }]
		);
	});

	it('offers everything for the sample library', () => {
		const facets = recipeFacets(LIBRARY);
		assert.equal(Object.values(facets).every(Boolean), true);
		assert.equal(facets.hearted, 3);
	});
});
