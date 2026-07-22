/**
 * What the tasks screen and its server half have to agree on: how a recurrence
 * is spelled, what an effort is worth, and how the row's meta line reads.
 *
 * The same rule as `utils/shopping.ts` — anything the browser and the service
 * both need to say the same way lives here, so the two can't drift.
 */
import { addDays, formatShortDate, type CalendarDate, type IntervalUnit } from '$lib/utils/dates';

/** `tasks.recurUnit`; mirrors the enum in `server/db/schema.ts`. */
export const RECUR_UNITS = ['none', 'day', 'week', 'month'] as const;

export type RecurUnit = (typeof RECUR_UNITS)[number];

export function isRecurUnit(value: unknown): value is RecurUnit {
	return typeof value === 'string' && (RECUR_UNITS as readonly string[]).includes(value);
}

/** Field limits, shared by the `maxlength` attribute and the action's guard. */
export const TASK_NAME_MAX = 80;
export const POINTS_MAX = 999;
/** "Every 99 months" is already absurd; beyond it, it's a typo. */
export const RECUR_INTERVAL_MAX = 99;

/** Effort → points [3b]. The canonical four (→ DECISIONS #2). */
export const EFFORTS = [
	{ label: 'Small', points: 5 },
	{ label: 'Medium', points: 10 },
	{ label: 'Large', points: 20 },
	{ label: 'Very large', points: 40 }
] as const;

export const DEFAULT_POINTS = 10;

/* ── Repeat ───────────────────────────────────────────────────────────────── */

/**
 * The Repeat dropdown's fixed choices (→ SPEC §5.2). `custom` isn't a
 * recurrence, it's the row that reveals the count + unit pair — hence the
 * string keys: one `<select>` can't post two numbers.
 */
export const REPEAT_PRESETS = [
	{ value: 'none', label: 'One-off', unit: 'none', interval: 1 },
	{ value: 'day-1', label: 'Every day', unit: 'day', interval: 1 },
	{ value: 'week-1', label: 'Every week', unit: 'week', interval: 1 },
	{ value: 'week-2', label: 'Every 2 weeks', unit: 'week', interval: 2 },
	{ value: 'month-1', label: 'Every month', unit: 'month', interval: 1 }
] as const satisfies readonly { value: string; label: string; unit: RecurUnit; interval: number }[];

export const CUSTOM_REPEAT = 'custom';

/** The units the custom row offers, singular/plural handled by the caption. */
export const CUSTOM_UNITS = [
	{ value: 'day', label: 'days' },
	{ value: 'week', label: 'weeks' },
	{ value: 'month', label: 'months' }
] as const satisfies readonly { value: IntervalUnit; label: string }[];

/** Which dropdown row a stored recurrence sits on — `custom` when none fits. */
export function repeatKey(unit: RecurUnit, interval: number): string {
	const preset = REPEAT_PRESETS.find(
		(option) => option.unit === unit && option.interval === interval
	);
	return preset?.value ?? CUSTOM_REPEAT;
}

/**
 * The repeat half of a task's meta line: "One-off", "Weekly", "Every 2 weeks",
 * "Monthly" [05] [4a]. The three every-one cadences get their own word because
 * that's what the design writes; everything else counts.
 */
export function formatRepeat(unit: RecurUnit, interval: number): string {
	if (unit === 'none') return 'One-off';
	if (interval === 1) return unit === 'day' ? 'Daily' : unit === 'week' ? 'Weekly' : 'Monthly';
	return `Every ${interval} ${unit}s`;
}

/* ── Snooze [4c] ──────────────────────────────────────────────────────────── */

/** Presets are counted from today, not from the due date (→ SPEC §5.5). */
export const SNOOZE_PRESETS = [
	{ label: 'Tomorrow', days: 1 },
	{ label: 'In 3 days', days: 3 },
	{ label: 'In 1 week', days: 7 },
	{ label: 'In 2 weeks', days: 14 }
] as const;

/** Where "Going away?" points its return date before you touch it. */
export const DEFAULT_AWAY_DAYS = 7;

/* ── Empty state [7f] ─────────────────────────────────────────────────────── */

/**
 * Popular starters — one tap each, assignee Anyone, first due today
 * (→ DECISIONS #22). Editable afterwards like any other task.
 */
export const STARTERS = [
	{ name: 'Take out the bins', unit: 'week', interval: 1, points: 5 },
	{ name: 'Change the bedsheets', unit: 'month', interval: 1, points: 10 },
	{ name: 'Clean the bathroom', unit: 'week', interval: 2, points: 20 }
] as const satisfies readonly {
	name: string;
	unit: RecurUnit;
	interval: number;
	points: number;
}[];

/* ── Copy ─────────────────────────────────────────────────────────────────── */

/** "Lukas's turn" — always `'s`, which is what the design writes [4b] [4d]. */
export function possessive(name: string): string {
	return `${name}'s`;
}

/**
 * The overdue card's footer, left half: "It's Elisabeth's turn" [4a]. An
 * unassigned task belongs to whoever gets there first, which is worth saying
 * out loud on the one card that's shouting.
 */
export function formatTurn(assigneeName: string | null, isMine: boolean): string {
	if (!assigneeName) return 'Anyone can pick this up';
	return isMine ? "It's your turn" : `It's ${possessive(assigneeName)} turn`;
}

/**
 * The right half: "reminded yesterday & this morning" [4a], built from the two
 * flag columns — whatever is set, in the order the nudges go out, and nothing
 * at all when neither has fired (→ SPEC §5.6).
 */
export function formatReminderNote(
	sentOn: (CalendarDate | null)[],
	today: CalendarDate
): string | null {
	const phrases: string[] = [];

	for (const date of sentOn) {
		if (!date) continue;
		// The nudges go out at 08:00 household-local, so today's is this morning's.
		const phrase =
			date === today
				? 'this morning'
				: date === addDays(today, -1)
					? 'yesterday'
					: formatShortDate(date);
		// Both nudges can land on the same morning after downtime; say it once.
		if (!phrases.includes(phrase)) phrases.push(phrase);
	}

	return phrases.length ? `reminded ${phrases.join(' & ')}` : null;
}
