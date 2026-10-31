/**
 * The expenses vocabulary (→ SPEC §11): the keys the database stores and the
 * limits both sides of a form check. The catalog names every key
 * (`m.expenses.categories[key]`); nothing here is a word a person reads.
 *
 * Imported by `db/schema.ts` too, which is why the money arithmetic lives in
 * its own file (`utils/money.ts`) and this one stays plain constants.
 */

/** Fixed, not editable (v1), in the order the chips show them [9b]. */
export const EXPENSE_CATEGORIES = [
	'groceries',
	'household',
	'bills',
	'eatingOut',
	'transport',
	'leisure',
	'travel',
	'other'
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_KINDS = ['expense', 'payment'] as const;
export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

/** The four ways to split [9c], in the segmented control's order. */
export const SPLIT_MODES = ['equal', 'amounts', 'percent', 'shares'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

/** `amounts` depends on the total, so it can't be the household default (→ SPEC §11.4). */
export const DEFAULT_SPLIT_MODES = ['equal', 'percent', 'shares'] as const;
export type DefaultSplitMode = (typeof DEFAULT_SPLIT_MODES)[number];

/**
 * How often a recurring expense comes back [9b] [9h] (→ SPEC §11.9). The
 * Repeats row's fourth choice, "Never", is the absence of a series, not a unit.
 */
export const REPEAT_UNITS = ['week', 'month', 'year'] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

/** How often a series comes back: every `interval` × `unit` — 3 months is quarterly. */
export type Repeat = { unit: RepeatUnit; interval: number };

/** "Every 99 months" is already absurd; beyond it, it's a typo (as for chores). */
export const REPEAT_INTERVAL_MAX = 99;

/**
 * The Repeats row's quick choices [9b], ahead of "Custom…" — which reveals the
 * count + unit pair the way a chore's repeat does (→ SPEC §5.2, §11.9).
 */
export const REPEAT_PRESETS = [
	{ value: 'week-1', unit: 'week', interval: 1 },
	{ value: 'month-1', unit: 'month', interval: 1 },
	{ value: 'month-3', unit: 'month', interval: 3 },
	{ value: 'year-1', unit: 'year', interval: 1 }
] as const satisfies readonly (Repeat & { value: string })[];

export type RepeatPreset = (typeof REPEAT_PRESETS)[number]['value'];

export const CUSTOM_REPEAT = 'custom';

/** Which Repeats choice a stored repeat sits on — `custom` when no preset fits. */
export function repeatChoice(repeat: Repeat): RepeatPreset | typeof CUSTOM_REPEAT {
	const preset = REPEAT_PRESETS.find(
		(option) => option.unit === repeat.unit && option.interval === repeat.interval
	);
	return preset?.value ?? CUSTOM_REPEAT;
}

export const EXPENSE_DESCRIPTION_MAX = 80;

/** One million in the household currency's major unit (→ SPEC §11.3). */
export const AMOUNT_MAX_MAJOR = 1_000_000;

/** A percentage is stored ×100, so 30% is 3000 and 33.3% is 3330. */
export const PERCENT_SCALE = 100;
export const PERCENT_TOTAL = 100 * PERCENT_SCALE;

export const SHARES_MAX = 99;

/** The household currency until the owner picks another (→ SPEC §11.10). */
export const DEFAULT_CURRENCY = 'EUR';

/**
 * The currencies Settings offers. A short list on purpose: the household picks
 * one, once, and a list of 180 codes is a worse picker than this.
 */
export const CURRENCIES = [
	'EUR',
	'CHF',
	'GBP',
	'USD',
	'CZK',
	'HUF',
	'PLN',
	'SEK',
	'NOK',
	'DKK'
] as const;

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
	return EXPENSE_CATEGORIES.includes(value as ExpenseCategory);
}

export function isSplitMode(value: unknown): value is SplitMode {
	return SPLIT_MODES.includes(value as SplitMode);
}

export function isRepeatUnit(value: unknown): value is RepeatUnit {
	return REPEAT_UNITS.includes(value as RepeatUnit);
}

/**
 * A repeat from the two form fields, or null when it isn't one — "Never", a
 * unit we don't know, an interval that isn't a whole 1–99.
 */
export function readRepeat(unit: unknown, interval: unknown): Repeat | null {
	if (!isRepeatUnit(unit)) return null;
	const count =
		interval === null || interval === undefined || interval === '' ? 1 : Number(interval);
	if (!Number.isInteger(count) || count < 1 || count > REPEAT_INTERVAL_MAX) return null;
	return { unit, interval: count };
}

export function isDefaultSplitMode(value: unknown): value is DefaultSplitMode {
	return DEFAULT_SPLIT_MODES.includes(value as DefaultSplitMode);
}

export function isCurrency(value: unknown): value is (typeof CURRENCIES)[number] {
	return CURRENCIES.includes(value as (typeof CURRENCIES)[number]);
}
