/**
 * Cook-mode timers (→ SPEC §4.6, design [7h] [7h·2]).
 *
 * The promise this file keeps is the one the design makes in [7h·2]: **the
 * timer goes off even when the phone is locked**. A `setTimeout` in a page that
 * a phone froze the moment the screen went dark cannot do that, so the row in
 * `cook_timers` is the timer — the countdown on screen is just a rendering of
 * it — and the server owns the alarm.
 *
 * Two mechanisms, one row (→ DECISIONS #15):
 *
 * 1. **An in-process `setTimeout` at creation.** Second-precise, which is what a
 *    kitchen timer has to be, and free.
 * 2. **The minute cron sweep** as the restart-safe fallback. A deploy or a crash
 *    between "start" and "ends" loses the `setTimeout` and nothing else; the
 *    next tick finds the row and rings it (→ `cron.ts`).
 *
 * Both go through `ring`, which claims `notifiedAt` *before* it sends — the same
 * shape `services/reminders.ts` uses — so the two mechanisms firing at once, or
 * the open page ringing it first, costs nothing. Whoever loses the conditional
 * update sees `changes === 0` and stops.
 *
 * v1 is **one timer per person at a time** (→ SPEC §4.6): starting a second one
 * cancels the first, in the same transaction, so there is never a moment where
 * two rows are live and the page has to choose. Timers are scoped to the user
 * rather than to the household — the person cooking is the one who wants the
 * buzz — but `householdId` is still the first argument and still in every WHERE
 * clause, because a timer id from another household must find nothing.
 */
import { and, asc, desc, eq, gt, gte, isNull, lte, type SQL } from 'drizzle-orm';
// Explicitly Node's, not the DOM's: this module is server-only and wants the
// `NodeJS.Timeout` handle, whose `unref()` the DOM's `number` doesn't have.
import { clearTimeout, setTimeout } from 'node:timers';
import { STEPS_MAX } from '$lib/utils/recipes';
import { MAX_TIMER_SECONDS, MIN_TIMER_SECONDS } from '$lib/utils/timer-parse';
import { db } from '../db';
import { cookTimers, recipes } from '../db/schema';
import { sendToUser, type PushPayload } from '../push';

export type CookTimerErrorCode =
	/** Outside `MIN_TIMER_SECONDS`…`MAX_TIMER_SECONDS`, or not a number at all. */
	| 'invalid-duration'
	/** The recipe was deleted while cook mode was open (→ DECISIONS #73). */
	| 'unknown-recipe';

export class CookTimerError extends Error {
	constructor(readonly code: CookTimerErrorCode) {
		super(code);
		this.name = 'CookTimerError';
	}
}

/** Long enough for the longest ingredient name the form accepts. */
export const TIMER_LABEL_MAX = 60;

/**
 * What a timer is called when the step names no ingredient to name it after.
 * Reads correctly in both places it appears: the ring's "Timer · 8:00" and the
 * push's "⏲️ Timer is done — back to step 3".
 */
const DEFAULT_LABEL = 'Timer';

/**
 * How late the catch-up sweep may still ring a timer.
 *
 * Unlike a task reminder, which is worth having at 13:45 if the server was down
 * all morning (→ `reminders.ts`), "the pasta is done" is worth nothing an hour
 * late — it is a lie about a pan. Rows older than this are simply left where
 * they are: the sweep's lower bound keeps them out of the index range, so they
 * are never scanned again either.
 */
const CATCH_UP_MS = 10 * 60 * 1000;

/** Same reasoning, one layer out: don't let the push service retry all evening. */
const TIMER_TTL_SECONDS = 15 * 60;

/**
 * A running timer as the page needs it.
 *
 * `remainingMs` rather than an absolute `endsAt`, deliberately: the browser
 * counts down against *its own* clock, and a phone whose clock is a minute off
 * the server's would otherwise render a minute that isn't there. The server
 * says how long is left; the page turns that into an instant it can trust.
 */
export type CookTimerView = {
	id: string;
	label: string;
	recipeId: string | null;
	/** 0-based index into the recipe's steps — the URL and the copy say `+ 1`. */
	stepIndex: number | null;
	/** What the timer was set for — the ring's "{label} · 8:00" line [7h]. */
	totalSeconds: number;
	/** Time left when this was read. Never negative. */
	remainingMs: number;
};

export type StartTimerInput = {
	/** Usually the ingredient the step is about ("Mushrooms"). */
	label: string;
	seconds: number;
	recipeId: string | null;
	stepIndex: number | null;
};

/* ── Reading ──────────────────────────────────────────────────────────────── */

/**
 * The one timer this person has running, if any — what cook mode hydrates from
 * on load, so tapping the notification (or just reloading) finds the ring still
 * turning rather than a fresh screen.
 */
export function getActiveTimer(
	householdId: string,
	userId: string,
	now: Date = new Date()
): CookTimerView | null {
	const row = db
		.select()
		.from(cookTimers)
		.where(
			and(
				eq(cookTimers.householdId, householdId),
				eq(cookTimers.userId, userId),
				isNull(cookTimers.notifiedAt),
				isNull(cookTimers.canceledAt),
				gt(cookTimers.endsAt, now)
			)
		)
		// One at a time is an invariant, not a promise about rows that already
		// exist: if two ever met, the newest is the one the page just started.
		.orderBy(desc(cookTimers.createdAt))
		.get();

	return row ? toView(row, now) : null;
}

type TimerRow = typeof cookTimers.$inferSelect;

function toView(row: TimerRow, now: Date): CookTimerView {
	return {
		id: row.id,
		label: row.label,
		recipeId: row.recipeId,
		stepIndex: row.stepIndex,
		// The row stores when it ends, not how long it ran; the length is the gap
		// it was created across. That stays true through "+1:00" and "resume",
		// which are a cancel and a new row (→ DECISIONS #15).
		totalSeconds: Math.max(1, Math.round((row.endsAt.getTime() - row.createdAt.getTime()) / 1000)),
		remainingMs: Math.max(0, row.endsAt.getTime() - now.getTime())
	};
}

/* ── Writing ──────────────────────────────────────────────────────────────── */

/**
 * Start one. Any timer this person already had running is canceled in the same
 * transaction, so "one at a time" holds even if two taps race.
 *
 * The duration arrives as **seconds, not an end time**: the phone's clock is not
 * the server's, and the server's is the one the push is scheduled against.
 */
export function startTimer(
	householdId: string,
	userId: string,
	input: StartTimerInput,
	now: Date = new Date()
): CookTimerView {
	const seconds = validDuration(input.seconds);
	const endsAt = new Date(now.getTime() + seconds * 1000);

	const { started, replaced } = db.transaction((tx) => {
		// Checked inside the transaction, next to the insert: a recipe a housemate
		// deleted a second ago must not become a timer pointing at a dead deep link
		// (→ DECISIONS #73). Null is allowed — a timer without a recipe is just a
		// timer — but a *wrong* id is not.
		if (input.recipeId) {
			const recipe = tx
				.select({ id: recipes.id })
				.from(recipes)
				.where(and(eq(recipes.id, input.recipeId), eq(recipes.householdId, householdId)))
				.get();

			if (!recipe) throw new CookTimerError('unknown-recipe');
		}

		const superseded = tx
			.update(cookTimers)
			.set({ canceledAt: now })
			.where(
				and(
					eq(cookTimers.householdId, householdId),
					eq(cookTimers.userId, userId),
					isNull(cookTimers.notifiedAt),
					isNull(cookTimers.canceledAt)
				)
			)
			.returning({ id: cookTimers.id })
			.all();

		const row = tx
			.insert(cookTimers)
			.values({
				householdId,
				userId,
				label: validLabel(input.label),
				recipeId: input.recipeId,
				stepIndex: validStepIndex(input.stepIndex),
				endsAt,
				createdAt: now
			})
			.returning()
			.get();

		return { started: row, replaced: superseded.map((r) => r.id) };
	});

	// Outside the transaction: scheduling is not something that can be rolled
	// back, and an alarm for a row that never committed would be a ghost.
	for (const id of replaced) clearAlarm(id);
	scheduleAlarm(started.id, seconds * 1000);

	return toView(started, now);
}

/**
 * Stop one — the Cancel button [7h], and the first half of both "+1:00" and
 * "pause" (each of which starts a fresh one afterwards).
 *
 * @returns whether there was a live timer to stop; `false` for one that already
 *   rang, was already canceled, or belongs to somebody else.
 */
export function cancelTimer(
	householdId: string,
	userId: string,
	timerId: string,
	now: Date = new Date()
): boolean {
	const result = db
		.update(cookTimers)
		.set({ canceledAt: now })
		.where(
			and(
				eq(cookTimers.id, timerId),
				eq(cookTimers.householdId, householdId),
				eq(cookTimers.userId, userId),
				isNull(cookTimers.notifiedAt),
				isNull(cookTimers.canceledAt)
			)
		)
		.run();

	if (result.changes === 0) return false;

	clearAlarm(timerId);
	return true;
}

/**
 * "The page rang this one itself." Cook mode calls this the moment its own
 * countdown hits zero, and it is the whole reason a phone with the app open
 * doesn't get buzzed twice: claiming `notifiedAt` from the client spends the
 * same flag the server alarm would have spent, so no push is ever sent.
 *
 * Claimed *before* the page vibrates, not after — the alternative is a race
 * where both alert. A backgrounded tab whose timers were throttled loses that
 * race, which is exactly right: the push it lost to is the one that woke the
 * phone.
 *
 * @returns whether the page got there first.
 */
export function markTimerRung(
	householdId: string,
	userId: string,
	timerId: string,
	now: Date = new Date()
): boolean {
	const claimed = claim(
		timerId,
		now,
		and(eq(cookTimers.householdId, householdId), eq(cookTimers.userId, userId))
	);

	if (claimed) clearAlarm(timerId);
	return claimed;
}

/* ── Ringing ──────────────────────────────────────────────────────────────── */

export type TimerSweep = {
	/** Timers rung — normally 0, because the `setTimeout` got there first. */
	fired: number;
	/** Devices that took a push. */
	devices: number;
};

/**
 * The restart-safe half (→ DECISIONS #15). Registered on the minute tick in
 * `cron.ts`, and unlike the other sweeps it is **not** per household: `endsAt`
 * is an instant, not a time of day, so there is no local clock to consult.
 *
 * The lower bound is what keeps this cheap forever. Every row that rings or is
 * canceled gets stamped, so the only unstamped rows in the past are ones a
 * restart dropped — and rows older than the window sit below the index range
 * and are never looked at again.
 */
export async function sweepCookTimers(now: Date = new Date()): Promise<TimerSweep> {
	const due = db
		.select()
		.from(cookTimers)
		.where(
			and(
				lte(cookTimers.endsAt, now),
				gte(cookTimers.endsAt, new Date(now.getTime() - CATCH_UP_MS)),
				isNull(cookTimers.notifiedAt),
				isNull(cookTimers.canceledAt)
			)
		)
		.orderBy(asc(cookTimers.endsAt))
		.all();

	if (due.length === 0) return { fired: 0, devices: 0 };

	const rung = await Promise.all(due.map((row) => ring(row, now)));

	return {
		fired: rung.filter((devices) => devices !== null).length,
		devices: rung.reduce<number>((total, devices) => total + (devices ?? 0), 0)
	};
}

/**
 * Ring one row: claim it, then send. Returns the devices reached, or `null` when
 * somebody else had already claimed it (the page, the other mechanism, a cancel
 * that landed in between).
 */
async function ring(row: TimerRow, now: Date): Promise<number | null> {
	if (!claim(row.id, now)) return null;

	clearAlarm(row.id);
	return sendToUser(row.userId, payloadFor(row), { ttlSeconds: TIMER_TTL_SECONDS });
}

/**
 * The notification of [7h·2]. `title` carries the message — the platform prints
 * the app name itself (→ DECISIONS #55) — and `url` is the deep link back into
 * the step that was cooking, which the service worker focuses or opens.
 *
 * The step is 0-based in the column and 1-based everywhere a person reads it.
 */
function payloadFor(row: TimerRow): PushPayload {
	const step = row.stepIndex === null ? null : row.stepIndex + 1;

	return {
		title: `⏲️ ${row.label} is done${step === null ? '' : ` — back to step ${step}`}`,
		// Per timer, so a second timer never silently replaces the first's alert.
		tag: `timer-${row.id}`,
		url: row.recipeId
			? `/cooking/recipes/${row.recipeId}/cook${step === null ? '' : `?step=${step}`}`
			: '/cooking',
		// A kitchen is loud and hands are busy — this one earns a longer buzz.
		vibrate: [200, 100, 200]
	};
}

/**
 * Take ownership of a timer's one alert. Conditional on `notifiedAt` still being
 * NULL *and* the timer not having been canceled, so a cancel that lands a
 * moment before the alarm wins.
 */
function claim(timerId: string, at: Date, scope?: SQL | undefined): boolean {
	const result = db
		.update(cookTimers)
		.set({ notifiedAt: at })
		.where(
			and(
				eq(cookTimers.id, timerId),
				isNull(cookTimers.notifiedAt),
				isNull(cookTimers.canceledAt),
				scope
			)
		)
		.run();

	return result.changes === 1;
}

/* ── The in-process alarm ─────────────────────────────────────────────────── */

/**
 * Pending `setTimeout`s by timer id — the precise half of DECISIONS #15.
 *
 * Losing this map costs nothing: a restart, or Vite re-evaluating the module in
 * dev, orphans the handles, and the cron sweep rings whatever they would have
 * rung. An orphaned handle that fires anyway finds the flag already claimed and
 * sends nothing, which is the same guarantee from the other direction.
 */
const alarms = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleAlarm(timerId: string, delayMs: number): void {
	clearAlarm(timerId);

	const handle = setTimeout(() => {
		alarms.delete(timerId);

		// Read the row again rather than closing over it: a "+1:00" is a new row,
		// and this one may have been canceled since. The synchronous read can throw
		// (a locked or failing database), and an uncaught throw in a timer callback
		// takes the whole process down — so it is caught here, keeping a lost alarm
		// the harmless thing this map's contract promises, with the cron sweep as
		// the catch-up.
		try {
			const row = db.select().from(cookTimers).where(eq(cookTimers.id, timerId)).get();
			if (!row) return;

			void ring(row, new Date()).catch((error: unknown) => {
				console.error('[timers] alarm failed:', error);
			});
		} catch (error) {
			console.error('[timers] alarm lookup failed:', error);
		}
	}, delayMs);

	// A pending alarm must not be the reason the process refuses to shut down —
	// the HTTP server is what keeps the loop alive, and the cron sweep is what
	// makes dropping this one safe.
	handle.unref();

	alarms.set(timerId, handle);
}

function clearAlarm(timerId: string): void {
	const handle = alarms.get(timerId);
	if (handle === undefined) return;

	clearTimeout(handle);
	alarms.delete(timerId);
}

/* ── Validation ───────────────────────────────────────────────────────────── */

/**
 * The client sends whole seconds; anything else is a forged request, not a
 * mis-click, so it is refused rather than clamped. The bounds are the parser's,
 * because the two have to agree on what a timer can be
 * (→ `$lib/utils/timer-parse`).
 */
function validDuration(seconds: unknown): number {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
		throw new CookTimerError('invalid-duration');
	}

	const whole = Math.round(seconds);
	if (whole < MIN_TIMER_SECONDS || whole > MAX_TIMER_SECONDS) {
		throw new CookTimerError('invalid-duration');
	}

	return whole;
}

/** A label is cosmetic, so it is repaired rather than refused. */
function validLabel(label: unknown): string {
	const trimmed = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : '';
	return trimmed ? trimmed.slice(0, TIMER_LABEL_MAX) : DEFAULT_LABEL;
}

/** Same: an unusable step index costs the deep link, not the timer. */
function validStepIndex(stepIndex: unknown): number | null {
	if (typeof stepIndex !== 'number' || !Number.isInteger(stepIndex)) return null;
	return stepIndex >= 0 && stepIndex < STEPS_MAX ? stepIndex : null;
}
