/**
 * The meals of a day — the values, not their names (→ CLAUDE.md: `utils/` keeps
 * values with a key, the catalog keeps what they're called, so a slot is a word
 * in two languages and one string in the database).
 *
 * A day holds **one meal per slot** rather than an unbounded list: it keeps the
 * write an upsert on `(household, date, slot)` the way one-dinner-per-day
 * already was, it gives Home something to mean by "tonight's dinner", and it
 * makes a second meal on a day self-labelling instead of an anonymous second
 * line (→ SPEC §4.1, DECISIONS #126).
 */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * The one a household plans nine times out of ten, and what every meal planned
 * before slots existed is (→ the schema's column default).
 */
export const DEFAULT_MEAL_SLOT: MealSlot = 'dinner';

/**
 * Which slot a *new* meal on a day should open on: dinner while it's free,
 * then the rest of the day in the order you'd actually add them. All four
 * taken means the sheet opens on dinner and says what it would replace — the
 * picker is never empty.
 */
const ADD_ORDER: MealSlot[] = ['dinner', 'lunch', 'breakfast', 'snack'];

export function isMealSlot(value: unknown): value is MealSlot {
	return typeof value === 'string' && (MEAL_SLOTS as readonly string[]).includes(value);
}

/**
 * A slot off a form or a URL. Anything the app didn't put there — a hand-typed
 * "brunch", a stale bookmark — is dinner rather than an error, the same shape
 * `readServings` and `getPlan`'s `?week=` use for a value that arrived wrong.
 */
export function readMealSlot(value: unknown): MealSlot {
	return isMealSlot(value) ? value : DEFAULT_MEAL_SLOT;
}

/** Day order — how a day's meals are listed, and how the picker offers them. */
export function mealSlotOrder(slot: MealSlot): number {
	return MEAL_SLOTS.indexOf(slot);
}

/** The slot "Add a meal" on a day should land on, given what that day holds. */
export function nextFreeSlot(taken: readonly MealSlot[]): MealSlot {
	return ADD_ORDER.find((slot) => !taken.includes(slot)) ?? DEFAULT_MEAL_SLOT;
}
