/**
 * The words a recipe can be tagged with (→ SPEC §4.3, plan 40) — the values,
 * not their names: the catalog keeps what each one is called (`cooking.tags`),
 * so a tag is a word in two languages and one string in the database, the way
 * a meal slot is (→ `./meals.ts`).
 *
 * A **fixed** list rather than whatever a household types: fixed words can be
 * translated, stay few enough for one row of chips, and give the importer and
 * the AI something to map onto (plan 41). Household content — names, recipes —
 * is never translated; these are the app's own words.
 *
 * Diet is not a tag but a column (`recipes.diet`): a recipe has one diet or
 * none yet, and "vegetarian includes vegan" is a rule on that one value
 * (→ `dietMatches`). Meal, kind and free-from are tags — a recipe can be lunch
 * *and* dinner, dessert *and* baking.
 *
 * Relative and extensioned imports only: the schema reads this file, and
 * drizzle-kit and the seed load the schema outside Vite (→ `db/schema.ts`).
 */
import { MEAL_SLOTS, type MealSlot } from './meals.ts';

export const RECIPE_KINDS = ['main', 'soup', 'salad', 'side', 'dessert', 'baking'] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];

export const RECIPE_FREE_FROM = ['gluten', 'lactose'] as const;
export type RecipeFreeFrom = (typeof RECIPE_FREE_FROM)[number];

/** The ladder runs meat → fish → vegetarian → vegan; only the last step is a subset rule. */
export const RECIPE_DIETS = ['meat', 'fish', 'vegetarian', 'vegan'] as const;
export type RecipeDiet = (typeof RECIPE_DIETS)[number];

export type RecipeTag = `meal:${MealSlot}` | `kind:${RecipeKind}` | `free:${RecipeFreeFrom}`;

/**
 * Every tag, in the order the chips show them — which is also the order a
 * recipe's tags are stored and read back in, so the recipe view lists meals
 * before kinds before free-from however they were ticked.
 *
 * Spelled out rather than built from the three lists above so drizzle's
 * column enum gets a literal tuple; `recipe-tags.test.ts` holds the two
 * together.
 */
export const RECIPE_TAGS = [
	'meal:breakfast',
	'meal:lunch',
	'meal:dinner',
	'meal:snack',
	'kind:main',
	'kind:soup',
	'kind:salad',
	'kind:side',
	'kind:dessert',
	'kind:baking',
	'free:gluten',
	'free:lactose'
] as const satisfies readonly RecipeTag[];

/** The three tag groups, each with its values — what the form and the sheet draw. */
export const TAG_GROUPS = {
	meal: MEAL_SLOTS,
	kind: RECIPE_KINDS,
	free: RECIPE_FREE_FROM
} as const;

export type TagGroup = keyof typeof TAG_GROUPS;

export function isRecipeTag(value: unknown): value is RecipeTag {
	return typeof value === 'string' && (RECIPE_TAGS as readonly string[]).includes(value);
}

export function isRecipeDiet(value: unknown): value is RecipeDiet {
	return typeof value === 'string' && (RECIPE_DIETS as readonly string[]).includes(value);
}

/**
 * Tags off a form or a caller that isn't one (an import): anything that isn't a
 * known key is dropped rather than refused — a stale form or a hand-rolled POST
 * still saves the recipe — and the rest come back once each, in list order.
 */
export function readRecipeTags(values: readonly unknown[]): RecipeTag[] {
	const wanted = new Set(values.filter(isRecipeTag));
	return RECIPE_TAGS.filter((tag) => wanted.has(tag));
}

/** A diet off a form: a known one, or none at all. */
export function readRecipeDiet(value: unknown): RecipeDiet | null {
	return isRecipeDiet(value) ? value : null;
}

/** `meal:dinner` → `['meal', 'dinner']`. */
export function splitTag(tag: RecipeTag): [TagGroup, string] {
	const at = tag.indexOf(':');
	return [tag.slice(0, at) as TagGroup, tag.slice(at + 1)];
}

/**
 * Whether a recipe's diet satisfies one the filter asked for. Vegetarian
 * includes vegan — someone after a meat-free dinner is glad of a vegan one —
 * but not the other way round, and a recipe whose diet nobody set yet matches
 * nothing (it may well be a steak).
 */
export function dietMatches(diet: RecipeDiet | null, wanted: RecipeDiet): boolean {
	if (diet === null) return false;
	return diet === wanted || (wanted === 'vegetarian' && diet === 'vegan');
}

/** Meat-free — the leaf on a card. */
export function isMeatFree(diet: RecipeDiet | null): boolean {
	return diet === 'vegetarian' || diet === 'vegan';
}
