/**
 * What the tasks screen and its server half have to agree on: how a recurrence
 * is shaped, what an effort is worth, and which presets exist.
 *
 * The same rule as `utils/shopping.ts` — anything the browser and the service
 * both need to agree on lives here, so the two can't drift.
 *
 * **Values here, words in the catalog.** Every list below carries a `key` and
 * no label: "Small" and "Klein" are both names for `points: 5`, and they live
 * in `$lib/i18n/messages/*` under `task.*` where a translator can reach them.
 */
import type { IntervalUnit } from '$lib/utils/dates';

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

/**
 * Effort → points [3b]. The canonical four (→ DECISIONS #2), plus a **None · 0**
 * preset for a chore worth tracking that shouldn't score (→ DECISIONS #115).
 */
export const EFFORTS = [
	{ key: 'none', points: 0 },
	{ key: 'small', points: 5 },
	{ key: 'medium', points: 10 },
	{ key: 'large', points: 20 },
	{ key: 'huge', points: 40 }
] as const satisfies readonly { key: EffortKey; points: number }[];

/** Names the catalog's `task.efforts` — adding one there is a compile error here. */
export type EffortKey = 'none' | 'small' | 'medium' | 'large' | 'huge';

export const DEFAULT_POINTS = 10;

/* ── Points board timeframe [8a] ──────────────────────────────────────────── */

/**
 * The windows the History → Points board totals over (→ SPEC §5.8). They live
 * here so the load (which turns one into a `since` instant) and the toggle (which
 * links between them) can't disagree about the set or its order.
 */
export const POINTS_WINDOWS = ['30d', '3m', 'year', 'all'] as const;

/** Names the catalog's `task.pointsBoard.ranges`. */
export type PointsWindow = (typeof POINTS_WINDOWS)[number];

/** The board opens on the last three months — a season of the household's rhythm. */
export const DEFAULT_POINTS_WINDOW: PointsWindow = '3m';

export function isPointsWindow(value: unknown): value is PointsWindow {
	return typeof value === 'string' && (POINTS_WINDOWS as readonly string[]).includes(value);
}

/**
 * How many days back a window reaches, counted inclusive of today — or `null`
 * for "all time", which has no lower bound at all.
 */
export function pointsWindowDays(window: PointsWindow): number | null {
	return window === '30d' ? 30 : window === '3m' ? 90 : window === 'year' ? 365 : null;
}

/* ── Repeat ───────────────────────────────────────────────────────────────── */

/**
 * The Repeat dropdown's fixed choices (→ SPEC §5.2). `custom` isn't a
 * recurrence, it's the row that reveals the count + unit pair — hence the
 * string keys: one `<select>` can't post two numbers.
 */
export const REPEAT_PRESETS = [
	{ value: 'none', unit: 'none', interval: 1 },
	{ value: 'day-1', unit: 'day', interval: 1 },
	{ value: 'week-1', unit: 'week', interval: 1 },
	{ value: 'week-2', unit: 'week', interval: 2 },
	{ value: 'month-1', unit: 'month', interval: 1 }
] as const satisfies readonly { value: RepeatKey; unit: RecurUnit; interval: number }[];

/** Names the catalog's `task.repeats`. */
export type RepeatKey = 'none' | 'day-1' | 'week-1' | 'week-2' | 'month-1';

export const CUSTOM_REPEAT = 'custom';

/** The units the custom row offers; the caption spells the interval out. */
export const CUSTOM_UNITS = ['day', 'week', 'month'] as const satisfies readonly IntervalUnit[];

/** Which dropdown row a stored recurrence sits on — `custom` when none fits. */
export function repeatKey(unit: RecurUnit, interval: number): string {
	const preset = REPEAT_PRESETS.find(
		(option) => option.unit === unit && option.interval === interval
	);
	return preset?.value ?? CUSTOM_REPEAT;
}

/* ── Snooze [4c] ──────────────────────────────────────────────────────────── */

/** Presets are counted from today, not from the due date (→ SPEC §5.5). */
export const SNOOZE_PRESETS = [
	{ key: 'tomorrow', days: 1 },
	{ key: 'days3', days: 3 },
	{ key: 'week1', days: 7 },
	{ key: 'weeks2', days: 14 }
] as const satisfies readonly { key: SnoozeKey; days: number }[];

/** Names the catalog's `task.snoozes`. */
export type SnoozeKey = 'tomorrow' | 'days3' | 'week1' | 'weeks2';

/** Where "Going away?" points its return date before you touch it. */
export const DEFAULT_AWAY_DAYS = 7;

/* ── Empty state [7f] ─────────────────────────────────────────────────────── */

/**
 * Popular starters — one tap each, assignee Anyone, first due today
 * (→ DECISIONS #22). Editable afterwards like any other task.
 *
 * The *name* is copy (`task.starters`), so a tap writes the chore in whatever
 * language the member is reading — and it stays that way afterwards, because a
 * task name is theirs to edit from then on, not ours to re-translate.
 */
export const STARTERS = [
	{ key: 'bins', unit: 'week', interval: 1, points: 5 },
	{ key: 'bedsheets', unit: 'month', interval: 1, points: 10 },
	{ key: 'bathroom', unit: 'week', interval: 2, points: 20 }
] as const satisfies readonly {
	key: StarterKey;
	unit: RecurUnit;
	interval: number;
	points: number;
}[];

/** Names the catalog's `task.starters`. */
export type StarterKey = 'bins' | 'bedsheets' | 'bathroom';
