/**
 * In-process scheduler (node-cron), started once from the server `init` hook.
 *
 * **One minute tick, jobs that gate themselves.** A household's timezone is
 * data, so "03:30" can't live in a cron expression — every job runs each minute
 * and asks each household what time it is there. Plans 06 and 08 add their
 * reminder and timer sweeps the same way (→ docs/ARCHITECTURE.md
 * "Notifications", docs/DATA-MODEL.md "Reminder time-sweep").
 */
import { schedule } from 'node-cron';
import { clockIn, todayIn, type CalendarDate } from '$lib/utils/dates';
import { listHouseholdClocks } from './services/household';
import { purgeCheckedItems } from './services/shopping';

/** Checked items survive the shopping trip and the evening (→ DECISIONS #13). */
const CHECKED_ITEM_TTL_MS = 12 * 60 * 60 * 1000;

/** 03:30 household-local — late enough that nobody is mid-trip. */
const CLEANUP_MINUTE_OF_DAY = 3 * 60 + 30;

/**
 * The household-local date each household was last cleaned on — the "has this
 * already run today?" half of the gate.
 *
 * In memory rather than in a column, because losing it is harmless: the job
 * only ever deletes items checked more than 12 h ago, so running it late (a
 * tick was missed) or unusually early (the process restarted at noon and swept
 * on its first tick) removes exactly the rows a 03:30 run would have removed,
 * never more. What the ledger buys is that it doesn't then run *again* every
 * minute for the rest of the day. Gating on "at or after 03:30" rather than
 * "== 03:30" is the same idea: a missed minute, or a timezone that springs its
 * clock straight past 03:30, must not cost a household its cleanup.
 */
const lastCleanup = new Map<string, CalendarDate>();

/**
 * Dev only registers jobs once: Vite reloads `hooks.server.ts` on every change,
 * which would otherwise stack a new set of timers on each edit. A `Symbol.for`
 * key survives module re-evaluation because it lives in the global registry.
 */
const REGISTERED: unique symbol = Symbol.for('choreganized.cron.registered');

type CronGlobal = typeof globalThis & { [REGISTERED]?: true };

export function registerCronJobs(): void {
	const scope = globalThis as CronGlobal;
	if (scope[REGISTERED]) return;
	scope[REGISTERED] = true;

	// Keep every job inside this guard, and every job inside `guard()`.
	schedule('* * * * *', () => guard('shopping-cleanup', cleanUpCheckedShoppingItems), {
		name: 'shopping-cleanup',
		// These jobs are synchronous today, but say it anyway: a slow one must
		// never end up with two copies of itself deleting the same rows.
		noOverlap: true
	});
}

/**
 * A job that throws must not take the scheduler — or the process — with it.
 * Used twice per sweep: once around the whole job, once per household, so one
 * household's bad data can't stop the next household's.
 */
function guard(name: string, job: () => void): void {
	try {
		job();
	} catch (error) {
		console.error(`[cron] ${name} failed:`, error);
	}
}

/**
 * Delete shopping items checked off more than 12 h ago, once a night per
 * household (→ SPEC §3.1). The list keeps its "2 of 9 done" context for the
 * whole trip and the evening after it, and is clean again by morning.
 */
function cleanUpCheckedShoppingItems(now: Date = new Date()): void {
	const households = listHouseholdClocks();

	for (const household of households) {
		const today = todayIn(household.timezone, now);
		if (lastCleanup.get(household.id) === today) continue;

		const { hour, minute } = clockIn(household.timezone, now);
		if (hour * 60 + minute < CLEANUP_MINUTE_OF_DAY) continue;

		// Claimed before the delete, not after: a household whose sweep throws
		// shouldn't be retried every minute for the rest of the day.
		lastCleanup.set(household.id, today);

		// Guarded per household, not once around the loop: the next household's
		// sweep must not be collateral damage of this one's failure.
		guard(`shopping-cleanup ${household.id}`, () => {
			const removed = purgeCheckedItems(
				household.id,
				new Date(now.getTime() - CHECKED_ITEM_TTL_MS)
			);
			if (removed > 0) {
				console.log(
					`[cron] cleared ${removed} checked shopping item(s) in household ${household.id}`
				);
			}
		});
	}

	// A deleted household would otherwise keep its entry until the next deploy.
	const live = new Set(households.map((household) => household.id));
	for (const id of lastCleanup.keys()) if (!live.has(id)) lastCleanup.delete(id);
}
