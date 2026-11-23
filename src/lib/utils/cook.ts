/**
 * Cook mode's arithmetic that has nothing to do with the screen (→ plan 47,
 * SPEC §4.6): how big a step's text is, which rows its ingredient list shows,
 * and which ticks on "Get ready" still belong to tonight's cook.
 *
 * Pure, no `$lib`, so the unit tests read it without Vite.
 */

/**
 * How big a step's text is drawn, by its length. A short step is read from a
 * metre away; a long imported one has to leave room for its ingredient list
 * and the Next button on a 390 × 844 phone without a scroll (→ plan 47, the
 * acceptance's 400-character step). The steps are the type scale's, so the
 * reader's text size still moves each of them (→ DECISIONS #201).
 */
export type StepTextSize = 'large' | 'medium' | 'small' | 'smallest';

/** The longest step each size takes, in characters; anything longer is `smallest`. */
export const STEP_TEXT_SIZES: readonly [StepTextSize, number][] = [
	['large', 100],
	['medium', 220],
	['small', 320]
];

const ORDER: readonly StepTextSize[] = ['large', 'medium', 'small', 'smallest'];

/**
 * `timer`: a running ring takes the lower half of the screen [7h], so the
 * text goes one size down and more of the list under it stays in view.
 */
export function stepTextSize(text: string, timer = false): StepTextSize {
	const length = [...text.trim()].length;
	const size = STEP_TEXT_SIZES.find(([, most]) => length <= most)?.[0] ?? 'smallest';
	return timer ? ORDER[Math.min(ORDER.indexOf(size) + 1, ORDER.length - 1)] : size;
}

/** Long steps get the tighter list, so the two fit one screen together. */
export const compactList = (size: StepTextSize) => size === 'small' || size === 'smallest';

type Row = {
	id: string;
	name: string;
	quantity: number | null;
	unit: string | null;
	note?: string | null;
};

/** One line of the list under a step [C2]. */
export type StepIngredientLine = {
	key: string;
	/** One name, or every amount-less, note-less ingredient of the step together ("Salz · Pfeffer"). */
	names: string[];
	/** The step's amount: the whole row's, or the share the step takes. */
	quantity: number | null;
	unit: string | null;
	note: string | null;
	/** What the row holds in all, when the step takes only part of it ("200 g of 400 g"). */
	total: { quantity: number; unit: string | null } | null;
};

const hasAmount = (quantity: number | null): quantity is number =>
	quantity !== null && quantity > 0;

/**
 * The rows a step's ingredient list shows, from the ingredients the step uses
 * (`used`, each carrying the step's own amount, → `renderStep`) and the whole
 * list (`ingredients`, scaled the same way, for the totals). Both already for
 * the number cooked for.
 *
 * In the order the step uses them, except that the ones with nothing to
 * measure and nothing to say ("Salz", "Pfeffer") share one last line, as in
 * the sketch's C3: a row each would be a column of blanks.
 */
export function stepIngredientLines(
	used: readonly Row[],
	ingredients: readonly Row[]
): StepIngredientLine[] {
	const totals = new Map(ingredients.map((row) => [row.id, row]));
	const lines: StepIngredientLine[] = [];
	const bare: Row[] = [];

	for (const row of used) {
		const note = row.note?.trim() || null;
		if (!hasAmount(row.quantity) && !note) {
			bare.push(row);
			continue;
		}

		const whole = totals.get(row.id);
		const share =
			hasAmount(row.quantity) &&
			whole !== undefined &&
			hasAmount(whole.quantity) &&
			whole.quantity !== row.quantity;

		lines.push({
			key: row.id,
			names: [row.name],
			quantity: hasAmount(row.quantity) ? row.quantity : null,
			unit: hasAmount(row.quantity) ? row.unit : null,
			note,
			total: share ? { quantity: whole.quantity as number, unit: whole.unit } : null
		});
	}

	if (bare.length > 0) {
		lines.push({
			key: bare.map((row) => row.id).join(' '),
			names: [...new Set(bare.map((row) => row.name))],
			quantity: null,
			unit: null,
			note: null,
			total: null
		});
	}

	return lines;
}

/**
 * Whether a recipe's rows are in parts worth naming: two or more. A recipe
 * whose every row is in one part never says the word (→ plan 47), because a
 * heading over everything names nothing.
 */
export function showsParts(rows: readonly { section?: string | null }[]): boolean {
	const names = new Set(rows.map((row) => row.section ?? null));
	return names.size > 1;
}

/**
 * How long the ticks on "Get ready" are kept: one cook. A reload, a phone
 * that slept, Prev and Next all keep them; tomorrow's lasagne starts clean.
 */
export const TICKS_KEEP_MS = 12 * 60 * 60 * 1000;

/** The ticks as the device keeps them, per recipe. */
export type StoredTicks = { at: number; ids: string[] };

/**
 * The ticks still standing, out of whatever the device had kept: nothing for
 * anything unreadable, or for a cook that is over.
 */
export function readTicks(raw: string | null, now: number): string[] {
	if (!raw) return [];
	try {
		const stored = JSON.parse(raw) as Partial<StoredTicks> | null;
		if (!stored || typeof stored.at !== 'number' || !Array.isArray(stored.ids)) return [];
		if (now - stored.at > TICKS_KEEP_MS || stored.at > now + 60_000) return [];
		return stored.ids.filter((id): id is string => typeof id === 'string');
	} catch {
		return [];
	}
}

/**
 * What a tick is kept by: the row's part and name, not its id. Saving a
 * recipe writes its ingredient rows anew, so a housemate fixing a typo
 * mid-cook would otherwise clear every tick on the counter.
 */
export function tickKey(row: { name: string; section?: string | null }): string {
	return `${row.section ?? ''}\u0000${row.name.trim().toLocaleLowerCase()}`;
}

/** The device's key for one recipe's ticks. */
export const ticksKey = (recipeId: string) => `cook-ticks:${recipeId}`;
