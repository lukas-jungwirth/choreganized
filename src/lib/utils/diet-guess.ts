/**
 * A recipe's diet, guessed from its ingredient names (→ plan 41, the sorting
 * pass). Only ever a **suggestion**: it is shown dotted as "our guess" and
 * saved by a person's Next, never on its own.
 *
 * The rule: a meat word → meat; else a fish word → fish; else an egg, dairy or
 * honey word → vegetarian; else vegan. No ingredients, or gelatine with no
 * meat (a panna cotta is neither "meat" nor vegetarian), → no guess.
 *
 * German writes ingredients as compounds ("Rinderhackfleisch", "Lachsfilet",
 * "Hühnerbrühe"), so most stems match at the start or end of a word as well as
 * on their own; short or ambiguous ones ("ei", "ham") only as a whole word.
 * Plant milks and butters are named first and taken out, so "Kokosmilch" and
 * "peanut butter" don't make a curry vegetarian.
 *
 * Pure, no `$lib` — unit-tested beside it.
 */
import type { RecipeDiet } from './recipe-tags';
import { hasPhrase, words } from './recipe-tag-words';

type Stems = {
	/** Only as a whole word. */
	exact: string[];
	/** As a whole word, or the start or end of one (German compounds). */
	part: string[];
};

const MEAT: Stems = {
	exact: ['ham', 'meat', 'mince', 'steak', 'ribs', 'duck', 'goose', 'veal', 'lamb', 'pute', 'ente', 'gans', 'reh', 'hendl', 'leber', 'liver'], // prettier-ignore
	part: ['beef', 'pork', 'chicken', 'turkey', 'bacon', 'sausage', 'salami', 'chorizo', 'prosciutto', 'pancetta', 'guanciale', 'venison', 'rinder', 'rindfleisch', 'rinds', 'schwein', 'hahnchen', 'huhn', 'huhner', 'puten', 'truthahn', 'lamm', 'kalb', 'speck', 'schinken', 'wurst', 'wurstel', 'hackfleisch', 'faschiert', 'fleisch', 'enten', 'ganse', 'hirsch', 'tafelspitz', 'gulasch', 'leberkase'] // prettier-ignore
};

const FISH: Stems = {
	exact: ['fish', 'cod', 'tuna', 'crab', 'clams', 'squid', 'octopus', 'scallops', 'hering', 'zander'], // prettier-ignore
	part: ['salmon', 'trout', 'shrimp', 'prawn', 'anchov', 'sardine', 'mackerel', 'herring', 'lobster', 'mussel', 'fisch', 'lachs', 'kabeljau', 'dorsch', 'forelle', 'garnele', 'sardelle', 'makrele', 'krabbe', 'muschel', 'calamari', 'saibling', 'karpfen', 'thunfisch'] // prettier-ignore
};

const ANIMAL: Stems = {
	exact: ['ei', 'egg', 'eggs', 'ghee', 'feta', 'honey', 'honig', 'cream', 'obers', 'eiweiss', 'eigelb', 'dotter'], // prettier-ignore
	part: ['butter', 'milk', 'milch', 'cheese', 'kase', 'yogurt', 'yoghurt', 'joghurt', 'jogurt', 'sahne', 'rahm', 'topfen', 'quark', 'eier', 'parmesan', 'parmigiano', 'pecorino', 'mozzarella', 'ricotta', 'mascarpone', 'gruyere', 'cheddar', 'schmand', 'buttermilk', 'buttermilch', 'butterschmalz', 'creme fraiche', 'sour cream', 'schlagobers', 'cremefraiche'] // prettier-ignore
};

const GELATINE = ['gelatine', 'gelatin', 'blattgelatine'];

/**
 * Ingredients a stem would misread: plant milks, creams, yogurts and butters
 * (dairy), lamb's lettuce (lamb), beefsteak tomatoes ("Fleischtomate"), fruit
 * pulp ("Fruchtfleisch"), German butternut ("Butterkürbis") and shell pasta.
 */
const NOT_ANIMAL = [
	'coconut milk',
	'oat milk',
	'soy milk',
	'almond milk',
	'rice milk',
	'peanut butter',
	'cocoa butter',
	'nut butter',
	'vegan',
	'kokosmilch',
	'kokosnussmilch',
	'hafermilch',
	'sojamilch',
	'mandelmilch',
	'reismilch',
	'erdnussbutter',
	'kakaobutter',
	'nussbutter',
	'butternut',
	'lambs lettuce',
	'lamb s lettuce',
	'hafersahne',
	'sojasahne',
	'kokossahne',
	'pflanzenmilch',
	'fleischtomate',
	'fleischtomaten',
	'muschelnudeln',
	'fruchtfleisch',
	'coconut cream',
	'coconut yogurt',
	'kokoscreme',
	'sojajoghurt',
	'kokosjoghurt',
	'haferjoghurt',
	'butterkurbis'
].map(words);

function matches(name: string[], stems: Stems): boolean {
	return name.some(
		(word) =>
			stems.exact.includes(word) ||
			stems.part.some((stem) => {
				const stemWords = words(stem);
				if (stemWords.length > 1) return hasPhrase(name, stemWords);
				return word === stem || word.startsWith(stem) || word.endsWith(stem);
			})
	);
}

export function guessDiet(ingredientNames: readonly string[]): RecipeDiet | null {
	const names = ingredientNames
		.map(words)
		.filter((name) => name.length)
		// A plant milk is neither dairy nor anything else worth weighing.
		.filter((name) => !NOT_ANIMAL.some((phrase) => hasPhrase(name, phrase)));

	if (!ingredientNames.length) return null;
	if (names.some((name) => matches(name, MEAT))) return 'meat';
	if (names.some((name) => matches(name, FISH))) return 'fish';
	if (names.some((name) => name.some((word) => GELATINE.includes(word)))) return null;
	if (names.some((name) => matches(name, ANIMAL))) return 'vegetarian';
	return 'vegan';
}
