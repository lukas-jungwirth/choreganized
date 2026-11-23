/**
 * The names the demo seed writes (→ scripts/seed.ts) — and the names the
 * browser tests look for (→ tests/e2e/accounts.ts, tests/visual). One module,
 * so renaming a seeded recipe cannot silently strand a test on the old name.
 * Content only: quantities, dates and steps stay in seed.ts beside the rows.
 */
export const SEED_HOUSEHOLD_NAME = 'Sonnengasse 12';
/** Where the demo household keeps time; the visual setup reads the date in it. */
export const SEED_TIMEZONE = 'Europe/Vienna';
export const SEED_HOUSEMATE_NAME = 'Elisabeth';

/**
 * Jonas's link in the `--guests` household (→ plan 38): fixed, so the visual
 * tests can open his page [G6]. 43 characters, the shape of a real token.
 * Demo data only: a real token is 32 random bytes.
 */
export const SEED_GUEST_TOKEN = 'seed-guest-jonas-weekend-in-suedtirol-0000a';
/** The stub housemates `--full-house` adds, one per member colour still free. */
export const SEED_EXTRA_MEMBER_NAMES = [
	'Jakob',
	'Mira',
	'Theo',
	'Annika',
	'Maximilian',
	'Sophie'
] as const;
export const SEED_STORE_NAMES = ['Grocery', 'Drugstore', 'Hardware store'] as const;
/** The demo checklist (plan 36 step 2), after the shopping lists, and its rows in order. */
export const SEED_CHECKLIST_NAME = 'Vacation packing';
export const SEED_CHECKLIST_ITEMS = [
	'Passports',
	'Phone chargers',
	'Sunscreen',
	'Swimwear',
	'Toothbrushes',
	'First-aid kit'
] as const;
export const SEED_ITEM_NAMES = [
	'Tomatoes',
	'Baby spinach',
	'Oat milk',
	'Olive oil',
	'Avocado'
] as const;
export const SEED_RECIPE_NAMES = {
	pasta: 'Creamy mushroom pasta',
	curry: 'Lentil curry',
	lasagne: 'Lasagne'
} as const;

/**
 * The two-part recipe (→ plan 43): ingredients and steps under their parts,
 * notes under names, and steps whose links are stored with the words that name
 * them, so every recipe screen has one to show. "Zwiebelwürfel" names the
 * Zwiebel and "Hackfleisch" the Faschiertes; "1 - 2 EL" is the amount run a
 * different count rewrites, and "180 °C" and "5 - 7 Min." are not.
 *
 * `links` name ingredients by their `key`; a link without a phrase is used
 * without being named. Written as the AI import (plan 44) will write one.
 */
export type SeedLasagneIngredient = {
	key: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	note: string | null;
	section: string;
};

export const SEED_LASAGNE: {
	time: number;
	servings: number;
	ingredients: SeedLasagneIngredient[];
	steps: {
		section: string;
		text: string;
		links: { ingredient: string; phrase: string | null; amountPhrase?: string }[];
	}[];
} = {
	time: 100,
	servings: 4,
	ingredients: [
		{ key: 'zwiebel', name: 'Zwiebel', quantity: 1, unit: null, note: null, section: 'Bolognese' },
		{ key: 'knoblauch', name: 'Knoblauch', quantity: 2, unit: 'Zehen', note: null, section: 'Bolognese' },
		{ key: 'oel', name: 'Olivenöl', quantity: 2, unit: 'tbsp', note: null, section: 'Bolognese' },
		{ key: 'hack', name: 'Faschiertes', quantity: 500, unit: 'g', note: 'gemischt', section: 'Bolognese' },
		{ key: 'mark', name: 'Tomatenmark', quantity: 2, unit: 'tbsp', note: null, section: 'Bolognese' },
		{ key: 'tomaten', name: 'Tomaten', quantity: 1, unit: 'Dose', note: 'geschält, 800 g', section: 'Bolognese' },
		{ key: 'salz', name: 'Salz', quantity: null, unit: null, note: 'zum Würzen', section: 'Bolognese' },
		{ key: 'pfeffer', name: 'Pfeffer', quantity: null, unit: null, note: 'zum Würzen', section: 'Bolognese' },
		{ key: 'butter', name: 'Butter', quantity: 30, unit: 'g', note: null, section: 'Béchamel' },
		{ key: 'mehl', name: 'Mehl', quantity: 40, unit: 'g', note: null, section: 'Béchamel' },
		{ key: 'milch', name: 'Milch', quantity: 0.5, unit: 'L', note: null, section: 'Béchamel' },
		{ key: 'muskat', name: 'Muskatnuss', quantity: 1, unit: 'Msp.', note: 'frisch gerieben', section: 'Béchamel' },
		{ key: 'salz-b', name: 'Salz', quantity: null, unit: null, note: null, section: 'Béchamel' },
		{ key: 'platten', name: 'Nudelplatten', quantity: 250, unit: 'g', note: null, section: 'Schichten' },
		{ key: 'parmesan', name: 'Parmesan', quantity: 50, unit: 'g', note: 'gerieben', section: 'Schichten' },
		{ key: 'butter-form', name: 'Butter', quantity: 10, unit: 'g', note: 'für die Form', section: 'Schichten' }
	], // prettier-ignore
	steps: [
		{
			section: 'Bolognese',
			text: 'Zwiebel schälen und fein würfeln. Knoblauch schälen und fein hacken.',
			links: [
				{ ingredient: 'zwiebel', phrase: 'Zwiebel' },
				{ ingredient: 'knoblauch', phrase: 'Knoblauch' }
			]
		},
		{
			section: 'Bolognese',
			text: '1 - 2 EL Olivenöl in einem breiten Topf stark erhitzen. Hackfleisch hineingeben und 5 - 7 Min. krümelig anbraten.',
			links: [
				{ ingredient: 'oel', phrase: 'Olivenöl', amountPhrase: '1 - 2 EL' },
				{ ingredient: 'hack', phrase: 'Hackfleisch' }
			]
		},
		{
			section: 'Bolognese',
			text: 'Zwiebelwürfel und Knoblauch zum Hackfleisch geben und 2 - 3 Min. mitbraten. Tomatenmark einrühren, Tomaten dazugeben, mit Salz und Pfeffer würzen und 30 Min. köcheln lassen.',
			links: [
				{ ingredient: 'zwiebel', phrase: 'Zwiebelwürfel' },
				{ ingredient: 'knoblauch', phrase: 'Knoblauch' },
				{ ingredient: 'hack', phrase: 'Hackfleisch' },
				{ ingredient: 'mark', phrase: 'Tomatenmark' },
				{ ingredient: 'tomaten', phrase: 'Tomaten' },
				{ ingredient: 'salz', phrase: 'Salz' },
				{ ingredient: 'pfeffer', phrase: 'Pfeffer' }
			]
		},
		{
			section: 'Béchamel',
			text: 'Butter in einem Topf bei mittlerer Hitze schmelzen. Mehl schnell einrühren.',
			links: [
				{ ingredient: 'butter', phrase: 'Butter' },
				{ ingredient: 'mehl', phrase: 'Mehl' }
			]
		},
		{
			section: 'Béchamel',
			text: 'Milch in 3 - 4 Portionen zugeben und glatt rühren. Mit Salz und Muskat abschmecken.',
			links: [
				{ ingredient: 'milch', phrase: 'Milch' },
				{ ingredient: 'salz-b', phrase: 'Salz' },
				{ ingredient: 'muskat', phrase: 'Muskat' }
			]
		},
		{
			section: 'Schichten',
			text: 'Eine Form mit Butter ausstreichen. Nudelplatten, Bolognese und Béchamel abwechselnd einschichten, mit Parmesan bestreuen.',
			links: [
				{ ingredient: 'butter-form', phrase: 'Butter' },
				{ ingredient: 'platten', phrase: 'Nudelplatten' },
				{ ingredient: 'parmesan', phrase: 'Parmesan' }
			]
		},
		{ section: 'Schichten', text: 'Im Ofen bei 180 °C etwa 40 Min. backen.', links: [] }
	]
};

/**
 * `--cookbook` (→ plan 40): the recipe-filters sketch's library, tagged, some
 * hearted, some planned in the past — enough for every filter group, the
 * sheet's counts, the "nothing fits" ways out and "Not cooked lately" to have
 * something to show. `added` and `cooked` are days ago (`cooked` null: never on
 * the plan); `cooked` days are all different, since a day holds one meal per slot.
 */
export type SeedCookbookRecipe = {
	key: string;
	name: string;
	time: number;
	tags: string[];
	diet: 'meat' | 'fish' | 'vegetarian' | 'vegan';
	favourite: boolean;
	added: number;
	cooked: number | null;
	ingredients: string[];
	step: string;
};

export const SEED_COOKBOOK: SeedCookbookRecipe[] = [
	{ key: 'shakshuka', name: 'Shakshuka', time: 30, tags: ['meal:breakfast', 'meal:lunch', 'kind:main', 'free:gluten'], diet: 'vegetarian', favourite: true, added: 3, cooked: 12, ingredients: ['Eggs', 'Tomatoes', 'Peppers', 'Feta'], step: 'Simmer the peppers and tomatoes 10 min, crack in the eggs.' }, // prettier-ignore
	{ key: 'oats', name: 'Overnight oats', time: 10, tags: ['meal:breakfast', 'free:lactose'], diet: 'vegan', favourite: false, added: 5, cooked: 2, ingredients: ['Oats', 'Oat milk', 'Banana', 'Berries'], step: 'Stir everything together and leave it in the fridge overnight.' }, // prettier-ignore
	{ key: 'pumpkin', name: 'Pumpkin soup', time: 40, tags: ['meal:lunch', 'meal:dinner', 'kind:soup', 'free:gluten', 'free:lactose'], diet: 'vegan', favourite: true, added: 8, cooked: 30, ingredients: ['Hokkaido pumpkin', 'Onion', 'Coconut milk', 'Ginger'], step: 'Roast the pumpkin 25 min, then blend with the coconut milk.' }, // prettier-ignore
	{ key: 'carbonara', name: 'Spaghetti carbonara', time: 25, tags: ['meal:dinner', 'kind:main'], diet: 'meat', favourite: true, added: 13, cooked: 6, ingredients: ['Spaghetti', 'Guanciale', 'Eggs', 'Pecorino'], step: 'Boil the spaghetti 9 min and toss with the guanciale, eggs and pecorino.' }, // prettier-ignore
	{ key: 'greek-salad', name: 'Greek salad', time: 15, tags: ['meal:lunch', 'kind:salad', 'free:gluten'], diet: 'vegetarian', favourite: false, added: 15, cooked: null, ingredients: ['Cucumber', 'Tomatoes', 'Feta', 'Olives', 'Lemon'], step: 'Chop, dress with lemon and olive oil.' }, // prettier-ignore
	{ key: 'salmon', name: 'Salmon with lemon potatoes', time: 35, tags: ['meal:dinner', 'kind:main', 'free:gluten'], diet: 'fish', favourite: false, added: 18, cooked: 45, ingredients: ['Salmon', 'Potatoes', 'Lemon', 'Dill'], step: 'Roast the potatoes 20 min, add the salmon for the last 12.' }, // prettier-ignore
	{ key: 'chili', name: 'Chili sin carne', time: 50, tags: ['meal:dinner', 'kind:main', 'free:gluten', 'free:lactose'], diet: 'vegan', favourite: false, added: 22, cooked: 20, ingredients: ['Kidney beans', 'Tomatoes', 'Peppers', 'Corn'], step: 'Simmer everything 40 minutes.' }, // prettier-ignore
	{ key: 'banana-bread', name: 'Banana bread', time: 70, tags: ['meal:snack', 'kind:baking'], diet: 'vegetarian', favourite: false, added: 25, cooked: null, ingredients: ['Bananas', 'Flour', 'Butter', 'Eggs'], step: 'Bake 60 minutes at 175 °C.' }, // prettier-ignore
	{ key: 'schnitzel', name: 'Schnitzel with potato salad', time: 45, tags: ['meal:lunch', 'meal:dinner', 'kind:main'], diet: 'meat', favourite: true, added: 30, cooked: 9, ingredients: ['Veal', 'Breadcrumbs', 'Potatoes', 'Vinegar'], step: 'Fry the schnitzel 3 min a side.' }, // prettier-ignore
	{ key: 'strudel', name: 'Apple strudel', time: 90, tags: ['meal:snack', 'kind:dessert', 'kind:baking'], diet: 'vegetarian', favourite: false, added: 34, cooked: 60, ingredients: ['Apples', 'Strudel dough', 'Raisins', 'Cinnamon'], step: 'Roll up and bake 40 minutes.' }, // prettier-ignore
	{ key: 'pad-thai', name: 'Chicken pad thai', time: 30, tags: ['meal:dinner', 'kind:main', 'free:lactose'], diet: 'meat', favourite: false, added: 40, cooked: 15, ingredients: ['Rice noodles', 'Chicken', 'Peanuts', 'Lime'], step: 'Stir-fry the chicken 5 min, add the noodles.' }, // prettier-ignore
	{ key: 'bruschetta', name: 'Tomato bruschetta', time: 15, tags: ['meal:snack', 'kind:side', 'free:lactose'], diet: 'vegan', favourite: false, added: 44, cooked: null, ingredients: ['Baguette', 'Tomatoes', 'Garlic', 'Basil'], step: 'Toast the bread 3 min and top with the tomatoes.' }, // prettier-ignore
	{ key: 'kaiserschmarrn', name: 'Kaiserschmarrn', time: 30, tags: ['meal:lunch', 'meal:snack', 'kind:dessert'], diet: 'vegetarian', favourite: true, added: 50, cooked: 25, ingredients: ['Eggs', 'Flour', 'Milk', 'Raisins'], step: 'Fry the batter, tear it up, caramelise 2 min.' } // prettier-ignore
];

/**
 * Three more `--cookbook` recipes nobody has tagged yet (→ plan 41): what the
 * library's "Sort your recipes" row counts and the sorting pass shows, one
 * meat, one vegetarian and one the guess reads as vegetarian (the eggs).
 * Older than the tagged ones, so they sit at the end of the grid.
 */
export const SEED_UNTAGGED: Pick<
	SeedCookbookRecipe,
	'key' | 'name' | 'time' | 'added' | 'ingredients' | 'step'
>[] = [
	{ key: 'risotto', name: 'Mushroom risotto', time: 40, added: 60, ingredients: ['Risotto rice', 'Mushrooms', 'Parmesan', 'Butter', 'White wine'], step: 'Stir in the stock a ladle at a time, 18 minutes.' }, // prettier-ignore
	{ key: 'goulash', name: 'Beef goulash', time: 120, added: 62, ingredients: ['Beef shoulder', 'Onions', 'Paprika', 'Tomato paste'], step: 'Braise the beef with the onions for 2 hours.' }, // prettier-ignore
	{ key: 'fried-rice', name: 'Fried rice', time: 20, added: 64, ingredients: ['Rice', 'Eggs', 'Peas', 'Soy sauce'], step: 'Fry the cold rice 5 min, push aside, scramble the eggs.' } // prettier-ignore
];
