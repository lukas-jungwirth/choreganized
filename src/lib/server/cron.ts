/**
 * In-process scheduler (node-cron), started once from the server `init` hook.
 *
 * Empty until plan 05 — reminders, cook-timer catch-up and the nightly shopping
 * cleanup all register here (→ docs/ARCHITECTURE.md "Notifications",
 * docs/DATA-MODEL.md "Reminder time-sweep").
 */

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

	// plan 05+: cron.schedule('* * * * *', …) — reminder sweep, timer catch-up,
	// nightly cleanup. Keep every job inside this guard.
}
