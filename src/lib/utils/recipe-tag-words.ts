/**
 * What a recipe page says it is → our tags (→ plan 41, SPEC §4.7).
 *
 * Recipe sites tell Google what a dish is in the card our importer already
 * reads: `recipeCategory` ("Hauptspeise", "Dessert"), `keywords` ("vegan,
 * schnell, Suppe") and `suitableForDiet` (`https://schema.org/VeganDiet`). This
 * maps those words, English and German, onto the fixed list in
 * `recipe-tags.ts`. No match, no tag: a suggestion the page didn't make is a
 * guess, and guessing is the diet guess's job (`diet-guess.ts`), not this one's.
 *
 * Meat and fish are never read from a page — sites rarely say so, and "fish"
 * in a keyword list is as often "fish sauce" as the dish.
 *
 * Pure, no `$lib` — unit-tested beside it.
 */
import type { MealSlot } from './meals';
import type { RecipeDiet, RecipeFreeFrom, RecipeKind, RecipeTag } from './recipe-tags';

/**
 * Lower case, umlauts and accents folded (ä → a, ß → ss), and split into words
 * — so "Süßspeise", "SUESSSPEISE" and "sussspeise" meet, and a list entry only
 * matches whole words: "Salat" is the salad, "Salatgurke" is not.
 */
export function words(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

/** Whether `phrase`'s words appear, in order and next to each other, in `within`. */
export function hasPhrase(within: string[], phrase: string[]): boolean {
	if (!phrase.length || phrase.length > within.length) return false;
	for (let at = 0; at + phrase.length <= within.length; at++) {
		if (phrase.every((word, i) => within[at + i] === word)) return true;
	}
	return false;
}

const KIND_WORDS: Record<RecipeKind, string[]> = {
	main: ['main course', 'main courses', 'main dish', 'main dishes', 'mains', 'hauptgericht', 'hauptgerichte', 'hauptspeise', 'hauptspeisen', 'hauptgang'], // prettier-ignore
	soup: ['soup', 'soups', 'suppe', 'suppen', 'eintopf', 'eintopfe'],
	salad: ['salad', 'salads', 'salat', 'salate'],
	side: ['side dish', 'side dishes', 'sides', 'beilage', 'beilagen'],
	dessert: ['dessert', 'desserts', 'nachspeise', 'nachspeisen', 'nachtisch', 'sussspeise', 'sussspeisen', 'mehlspeise', 'mehlspeisen'], // prettier-ignore
	baking: ['baking', 'backen', 'gebackenes', 'geback', 'kuchen', 'torte', 'torten', 'cake', 'cakes', 'bread', 'brot', 'kekse', 'cookies', 'platzchen'] // prettier-ignore
};

const MEAL_WORDS: Record<MealSlot, string[]> = {
	breakfast: ['breakfast', 'brunch', 'fruhstuck'],
	lunch: ['lunch', 'mittagessen'],
	dinner: ['dinner', 'supper', 'abendessen'],
	// Not "starter" or "Vorspeise": a starter is a course, not a snack.
	snack: ['snack', 'snacks', 'fingerfood']
};

const FREE_WORDS: Record<RecipeFreeFrom, string[]> = {
	gluten: ['gluten free', 'glutenfrei', 'glutenfreie', 'glutenfreies'],
	lactose: ['lactose free', 'low lactose', 'laktosefrei', 'laktosefreie', 'laktosefreies']
};

const VEGAN_WORDS = ['vegan', 'vegane', 'veganes', 'veganer'];
const VEGETARIAN_WORDS = ['vegetarian', 'vegetarisch', 'vegetarische', 'vegetarisches', 'veggie'];

/**
 * A page's labels → the tags and diet they name. Each label may itself be a
 * list ("vegan, schnell, Suppe") and a diet may be a schema.org URL; both are
 * handled. Vegan beats vegetarian when a page says both.
 */
export function tagsFromLabels(labels: readonly string[]): {
	tags: RecipeTag[];
	diet: RecipeDiet | null;
} {
	const phrases = labels
		.flatMap((label) => label.split(/[,;|/]+/))
		// `GlutenFreeDiet` (the tail of a schema.org URL) reads as "gluten free diet".
		.map((part) => words(part.replace(/schema\.org/i, '').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')))
		.filter((list) => list.length);

	const said = (entry: string) => phrases.some((phrase) => hasPhrase(phrase, words(entry)));
	const tags: RecipeTag[] = [];

	for (const [meal, list] of Object.entries(MEAL_WORDS)) {
		if (list.some(said)) tags.push(`meal:${meal as MealSlot}`);
	}
	for (const [kind, list] of Object.entries(KIND_WORDS)) {
		if (list.some(said)) tags.push(`kind:${kind as RecipeKind}`);
	}
	for (const [free, list] of Object.entries(FREE_WORDS)) {
		if (list.some(said)) tags.push(`free:${free as RecipeFreeFrom}`);
	}

	const diet = VEGAN_WORDS.some(said) ? 'vegan' : VEGETARIAN_WORDS.some(said) ? 'vegetarian' : null;

	return { tags, diet };
}
