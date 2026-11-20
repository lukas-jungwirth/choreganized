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
/** The stub housemates `--full-house` adds, one per member colour still free. */
export const SEED_EXTRA_MEMBER_NAMES = ['Jakob', 'Mira', 'Theo'] as const;
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
