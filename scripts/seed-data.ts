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
export const SEED_RECIPE_NAMES = { pasta: 'Creamy mushroom pasta', curry: 'Lentil curry' } as const;

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
