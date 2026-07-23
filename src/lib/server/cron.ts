/**
 * In-process scheduler (node-cron), started once from the server `init` hook.
 *
 * **One minute tick, jobs that gate themselves.** A household's timezone is
 * data, so "03:30" can't live in a cron expression — every job runs each minute
 * and asks each household what time it is there (→ docs/ARCHITECTURE.md
 * "Notifications", docs/DATA-MODEL.md "Reminder time-sweep").
 *
 * The cook-timer sweep is the one job that doesn't ask: `endsAt` is an instant,
 * not a time of day, so it has no local clock to consult and runs household-blind.
 */
import { schedule } from 'node-cron';
import { clockIn, todayIn, type CalendarDate } from '$lib/utils/dates';
import { backUpDatabase, serverDay } from './backup';
import { sweepCookTimers } from './services/cook-timers';
import { listHouseholdClocks } from './services/household';
import { sendTaskReminders } from './services/reminders';
import { purgeCheckedItems } from './services/shopping';

/** Checked items survive the shopping trip and the evening (→ DECISIONS #13). */
const CHECKED_ITEM_TTL_MS = 12 * 60 * 60 * 1000;

/** 03:30 household-local — late enough that nobody is mid-trip. */
const CLEANUP_MINUTE_OF_DAY = 3 * 60 + 30;

/** 08:00 household-local — "the morning it's due" (→ SPEC §5.6). */
const REMINDER_MINUTE_OF_DAY = 8 * 60;

/**
 * 03:00 server-local — the nightly database backup (→ backup.ts, plan 11).
 *
 * Server-local, not household-local: there is one database, not one per
 * household, so it has no household clock to consult (like the cook-timer sweep,
 * for the same reason).
 */
const BACKUP_MINUTE_OF_DAY = 3 * 60;

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
 * The server-local day the database was last backed up on — the "already ran
 * today?" half of the backup gate. One value, not a Map: unlike the per-household
 * cleanup, there is a single database. In memory for the same reason as the
 * cleanup ledger — losing it re-runs a backup that only overwrites the day's file
 * (→ backup.ts), which costs nothing.
 */
let lastBackup: string | null = null;

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

	// The registry. The two sweeps that send push are async, which is what
	// `guard` and `noOverlap` below are shaped for.
	const jobs: Job[] = [
		['shopping-cleanup', cleanUpCheckedShoppingItems],
		['task-reminders', sweepTaskReminders],
		['cook-timers', catchUpCookTimers],
		['db-backup', runNightlyBackup]
	];

	for (const [name, job] of jobs) {
		schedule('* * * * *', () => guard(name, job), {
			name,
			// A slow sweep must never end up with two copies of itself working on
			// the same rows — one setting an idempotency flag while the other is
			// still reading it is the classic double-send.
			noOverlap: true
		});
	}

	console.log(`[cron] registered ${jobs.length} job(s) on a one-minute tick`);
}

type Job = [name: string, run: () => void | Promise<void>];

/**
 * A job that throws must not take the scheduler — or, for an async job in Node,
 * the whole process — with it. Used twice per sweep: once around the job, once
 * per household, so one household's bad data can't stop the next household's.
 *
 * An async job's promise is handed back so node-cron's `noOverlap` waits for
 * the real end of the run rather than for its first `await`.
 */
function guard(name: string, job: () => void | Promise<void>): void | Promise<void> {
	try {
		const running = job();
		if (running instanceof Promise) {
			return running.catch((error: unknown) => report(name, error));
		}
	} catch (error) {
		report(name, error);
	}
}

function report(name: string, error: unknown): void {
	console.error(`[cron] ${name} failed:`, error);
}

/**
 * Delete shopping items checked off more than 12 h ago, once a night per
 * household (→ SPEC §3.1). The list keeps its "2 of 9 done" context for the
 * whole trip and the evening after it, and is clean again by morning.
 */
function cleanUpCheckedShoppingItems(now: Date = new Date()): void {
	const households = listHouseholdClocks();

	for (const household of households) {
		// Guarded per household from the first line, clock read included: the next
		// household's sweep must not be collateral damage of this one's failure,
		// and reading the clock is itself a way to fail (an unusable timezone).
		guard(`shopping-cleanup ${household.id}`, () => {
			const today = todayIn(household.timezone, now);
			if (lastCleanup.get(household.id) === today) return;

			const { hour, minute } = clockIn(household.timezone, now);
			if (hour * 60 + minute < CLEANUP_MINUTE_OF_DAY) return;

			// Claimed before the delete, not after: a household whose sweep throws
			// shouldn't be retried every minute for the rest of the day.
			lastCleanup.set(household.id, today);

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

/**
 * The two task nudges, from 08:00 on the household's own clock (→ SPEC §5.6,
 * `services/reminders.ts`).
 *
 * No ledger here, unlike the cleanup above: what has already gone out is written
 * on the task rows themselves, so this can run every minute from 08:00 to
 * midnight and still send each nudge exactly once — and a server that was down
 * all morning catches up on its first tick instead of skipping the day.
 */
async function sweepTaskReminders(now: Date = new Date()): Promise<void> {
	for (const household of listHouseholdClocks()) {
		// Guarded from the first line, clock read included: a household with an
		// unusable timezone must not cost the next household its morning.
		await guard(`task-reminders ${household.id}`, async () => {
			const { hour, minute } = clockIn(household.timezone, now);
			if (hour * 60 + minute < REMINDER_MINUTE_OF_DAY) return;

			const sent = await sendTaskReminders(household.id, todayIn(household.timezone, now), now);
			if (sent.nudges > 0) {
				console.log(
					`[cron] ${sent.nudges} task reminder(s) in household ${household.id} → ${sent.devices} device(s)`
				);
			}
		});
	}
}

/**
 * Cook timers that a restart dropped (→ SPEC §4.6, DECISIONS #15).
 *
 * The precise alarm is the `setTimeout` scheduled when the timer starts; this is
 * only here for the minute in which the process wasn't running to keep it. On
 * every other tick it finds nothing — and no household loop, because "8 minutes
 * from now" is the same instant in every timezone.
 */
async function catchUpCookTimers(now: Date = new Date()): Promise<void> {
	const rung = await sweepCookTimers(now);
	if (rung.fired > 0) {
		console.log(`[cron] caught up ${rung.fired} cook timer(s) → ${rung.devices} device(s)`);
	}
}

/**
 * A once-a-night SQLite snapshot to the `/data` volume (→ backup.ts, plan 11).
 *
 * Gated "at or after 03:00 server-local, once per day" — the same resilient shape
 * as the shopping cleanup (→ DECISIONS #45): a missed minute (a restart, a slow
 * tick) still gets the day its backup, and the in-memory ledger stops it running
 * again for the rest of the day. Day claimed before the write, so a failing
 * backup isn't retried every minute.
 */
async function runNightlyBackup(now: Date = new Date()): Promise<void> {
	const today = serverDay(now);
	if (lastBackup === today) return;
	if (now.getHours() * 60 + now.getMinutes() < BACKUP_MINUTE_OF_DAY) return;

	lastBackup = today;

	const { file, pruned } = await backUpDatabase(now);
	console.log(`[cron] database backup → ${file}${pruned > 0 ? ` (pruned ${pruned} old)` : ''}`);
}
