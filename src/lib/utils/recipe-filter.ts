/**
 * The recipe library's filters and sort (→ SPEC §4.3, plan 40) — one pure
 * module for both halves: the server load filters the grid with it, and the
 * filter sheet counts its draft with it in the browser. One function deciding
 * both is what keeps "Show 6 recipes" and the grid it opens agreeing.
 *
 * The URL is the state, the way `?q=` already is: a filtered library survives a
 * reload, the back button and a link sent to a housemate. Anything in the URL
 * the app didn't put there is ignored rather than refused.
 */
import type { CalendarDate } from './dates';
import { MEAL_SLOTS, type MealSlot } from './meals';
import {
	RECIPE_DIETS,
	RECIPE_FREE_FROM,
	RECIPE_KINDS,
	dietMatches,
	type RecipeDiet,
	type RecipeFreeFrom,
	type RecipeKind,
	type RecipeTag
} from './recipe-tags';

/** "Ready in" — at most this many minutes. */
export const TIME_CAPS = [20, 30, 45, 60] as const;
export type TimeCap = (typeof TIME_CAPS)[number];

/** Newest is today's order and the default, so it never appears in a URL. */
export const RECIPE_SORTS = ['new', 'az', 'quick', 'stale'] as const;
export type RecipeSort = (typeof RECIPE_SORTS)[number];

export type RecipeFilter = {
	meals: MealSlot[];
	kinds: RecipeKind[];
	diets: RecipeDiet[];
	free: RecipeFreeFrom[];
	max: TimeCap | null;
	favourites: boolean;
	sort: RecipeSort;
};

/** What a recipe needs to carry to be filtered and sorted. */
export type FilterableRecipe = {
	id: string;
	name: string;
	timeMinutes: number | null;
	createdAt: number;
	tags: RecipeTag[];
	diet: RecipeDiet | null;
	favourite: boolean;
	/** The last day up to today it was on the plan; null = never. */
	lastPlanned: CalendarDate | null;
};

export function emptyFilter(): RecipeFilter {
	return { meals: [], kinds: [], diets: [], free: [], max: null, favourites: false, sort: 'new' };
}

/* ── The URL ──────────────────────────────────────────────────────────────── */

function pick<T extends string>(values: string[], allowed: readonly T[]): T[] {
	const wanted = new Set(values);
	// In list order and once each, however the URL spelled it.
	return allowed.filter((value) => wanted.has(value));
}

export function parseRecipeFilter(params: URLSearchParams): RecipeFilter {
	const max = Number(params.get('max'));
	const sort = params.get('sort');

	return {
		meals: pick(params.getAll('meal'), MEAL_SLOTS),
		kinds: pick(params.getAll('kind'), RECIPE_KINDS),
		diets: pick(params.getAll('diet'), RECIPE_DIETS),
		free: pick(params.getAll('free'), RECIPE_FREE_FROM),
		max: (TIME_CAPS as readonly number[]).includes(max) ? (max as TimeCap) : null,
		favourites: params.get('fav') === '1',
		sort: (RECIPE_SORTS as readonly (string | null)[]).includes(sort) ? (sort as RecipeSort) : 'new'
	};
}

/**
 * The query a filter (and the search beside it) is written as. Defaults are
 * left out, so the unfiltered library is plain `/cooking/recipes`.
 */
export function recipeFilterParams(filter: RecipeFilter, search = ''): URLSearchParams {
	const params = new URLSearchParams();
	if (search.trim()) params.set('q', search.trim());
	for (const meal of filter.meals) params.append('meal', meal);
	for (const kind of filter.kinds) params.append('kind', kind);
	for (const diet of filter.diets) params.append('diet', diet);
	for (const free of filter.free) params.append('free', free);
	if (filter.max) params.set('max', String(filter.max));
	if (filter.favourites) params.set('fav', '1');
	if (filter.sort !== 'new') params.set('sort', filter.sort);
	return params;
}

/** The library address for a filter: `/cooking/recipes?meal=dinner&diet=vegetarian`. */
export function recipeFilterHref(filter: RecipeFilter, search = ''): string {
	const query = recipeFilterParams(filter, search).toString();
	return query ? `/cooking/recipes?${query}` : '/cooking/recipes';
}

/* ── Active filters, one at a time ────────────────────────────────────────── */

/**
 * One switched-on filter: a chip in the row with a × on it, and a "Without …"
 * way out when nothing fits. The sort isn't one — it narrows nothing.
 */
export type FilterAtom =
	| { group: 'favourites' }
	| { group: 'max'; value: TimeCap }
	| { group: 'meals'; value: MealSlot }
	| { group: 'kinds'; value: RecipeKind }
	| { group: 'diets'; value: RecipeDiet }
	| { group: 'free'; value: RecipeFreeFrom };

/** In the order the row shows them: the quick ones first, then the sheet's groups. */
export function filterAtoms(filter: RecipeFilter): FilterAtom[] {
	return [
		...(filter.favourites ? [{ group: 'favourites' } as const] : []),
		...(filter.max ? [{ group: 'max', value: filter.max } as const] : []),
		...filter.meals.map((value) => ({ group: 'meals', value }) as const),
		...filter.kinds.map((value) => ({ group: 'kinds', value }) as const),
		...filter.diets.map((value) => ({ group: 'diets', value }) as const),
		...filter.free.map((value) => ({ group: 'free', value }) as const)
	];
}

export function atomKey(atom: FilterAtom): string {
	return 'value' in atom ? `${atom.group}:${atom.value}` : atom.group;
}

/** The same filter with one atom taken off. */
export function withoutAtom(filter: RecipeFilter, atom: FilterAtom): RecipeFilter {
	switch (atom.group) {
		case 'favourites':
			return { ...filter, favourites: false };
		case 'max':
			return { ...filter, max: null };
		case 'meals':
			return { ...filter, meals: filter.meals.filter((value) => value !== atom.value) };
		case 'kinds':
			return { ...filter, kinds: filter.kinds.filter((value) => value !== atom.value) };
		case 'diets':
			return { ...filter, diets: filter.diets.filter((value) => value !== atom.value) };
		case 'free':
			return { ...filter, free: filter.free.filter((value) => value !== atom.value) };
	}
}

/** The same filter with one atom put on (a quick chip). */
export function withAtom(filter: RecipeFilter, atom: FilterAtom): RecipeFilter {
	const add = <T extends string>(list: T[], value: T): T[] =>
		list.includes(value) ? list : [...list, value];

	switch (atom.group) {
		case 'favourites':
			return { ...filter, favourites: true };
		case 'max':
			return { ...filter, max: atom.value };
		case 'meals':
			return { ...filter, meals: add(filter.meals, atom.value) };
		case 'kinds':
			return { ...filter, kinds: add(filter.kinds, atom.value) };
		case 'diets':
			return { ...filter, diets: add(filter.diets, atom.value) };
		case 'free':
			return { ...filter, free: add(filter.free, atom.value) };
	}
}

export function hasAtom(filter: RecipeFilter, atom: FilterAtom): boolean {
	return filterAtoms(filter).some((active) => atomKey(active) === atomKey(atom));
}

/* ── Matching ─────────────────────────────────────────────────────────────── */

/**
 * Within a group the chips are "any of" (lunch *or* dinner), across groups
 * they narrow (dinner *and* vegetarian). Free-from is the exception inside its
 * group: gluten-free and lactose-free means both, because a guest who can have
 * neither is the reason to tick two.
 */
export function matchesRecipeFilter(recipe: FilterableRecipe, filter: RecipeFilter): boolean {
	const has = (tag: RecipeTag) => recipe.tags.includes(tag);

	if (filter.favourites && !recipe.favourite) return false;
	if (filter.max && !(recipe.timeMinutes && recipe.timeMinutes <= filter.max)) return false;
	if (filter.meals.length && !filter.meals.some((meal) => has(`meal:${meal}`))) return false;
	if (filter.kinds.length && !filter.kinds.some((kind) => has(`kind:${kind}`))) return false;
	if (filter.diets.length && !filter.diets.some((diet) => dietMatches(recipe.diet, diet))) {
		return false;
	}
	if (!filter.free.every((free) => has(`free:${free}`))) return false;
	return true;
}

/**
 * Each order breaks its ties the same way every time, so the grid never
 * reshuffles between two loads of the same URL. `collator` is the reader's
 * language's, so A–Z puts "Äpfel" where a German reader looks for it.
 */
export function sortRecipes<T extends FilterableRecipe>(
	list: readonly T[],
	sort: RecipeSort,
	collator: Intl.Collator
): T[] {
	const byName = (a: T, b: T) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1);
	const newest = (a: T, b: T) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1);

	const order: Record<RecipeSort, (a: T, b: T) => number> = {
		new: newest,
		az: byName,
		// No time last: "quickest" can't promise anything about a recipe that never said.
		quick: (a, b) => (a.timeMinutes ?? Infinity) - (b.timeMinutes ?? Infinity) || byName(a, b),
		// Never planned first, then the longest ago.
		stale: (a, b) => {
			if (a.lastPlanned === b.lastPlanned) return byName(a, b);
			if (a.lastPlanned === null) return -1;
			if (b.lastPlanned === null) return 1;
			return a.lastPlanned < b.lastPlanned ? -1 : 1;
		}
	};

	return [...list].sort(order[sort]);
}

/** Filter, then sort — the grid. */
export function applyRecipeFilter<T extends FilterableRecipe>(
	list: readonly T[],
	filter: RecipeFilter,
	collator: Intl.Collator
): T[] {
	return sortRecipes(
		list.filter((recipe) => matchesRecipeFilter(recipe, filter)),
		filter.sort,
		collator
	);
}

/* ── What the library has to filter by ────────────────────────────────────── */

/**
 * Which filters this library can use at all. A group no recipe uses isn't
 * offered (→ plan 40): a household that never tags sees a sheet with time and
 * sort, not four empty questions. Values inside a shown group all show — an
 * unused chip just counts zero.
 */
export type RecipeFacets = {
	meals: boolean;
	kinds: boolean;
	diets: boolean;
	free: boolean;
	/** Some recipe says how long it takes. */
	time: boolean;
	/** Some recipe has a heart. */
	favourites: boolean;
	/** How many have one — the sheet's "6 recipes have a heart", whatever the search. */
	hearted: number;
	/** Some recipe is meat-free — the Vegetarian quick chip could find something. */
	meatFree: boolean;
	/** Some recipe takes 30 minutes or less — the "Under 30 min" quick chip. */
	quick: boolean;
};

export function recipeFacets(list: readonly FilterableRecipe[]): RecipeFacets {
	const tagged = (prefix: string) => list.some((r) => r.tags.some((tag) => tag.startsWith(prefix)));

	return {
		meals: tagged('meal:'),
		kinds: tagged('kind:'),
		diets: list.some((r) => r.diet !== null),
		free: tagged('free:'),
		time: list.some((r) => r.timeMinutes !== null),
		favourites: list.some((r) => r.favourite),
		hearted: list.filter((r) => r.favourite).length,
		meatFree: list.some((r) => dietMatches(r.diet, 'vegetarian')),
		quick: list.some((r) => r.timeMinutes !== null && r.timeMinutes <= 30)
	};
}

/**
 * The quick chips under the search, in order, with whether each could find
 * anything in this library — the row shows the ones that could (→ plan 40).
 */
export const QUICK_ATOMS: FilterAtom[] = [
	{ group: 'favourites' },
	{ group: 'max', value: 30 },
	{ group: 'diets', value: 'vegetarian' }
];

export function quickAtomUseful(atom: FilterAtom, facets: RecipeFacets): boolean {
	if (atom.group === 'favourites') return facets.favourites;
	if (atom.group === 'max') return facets.quick;
	return facets.meatFree;
}
