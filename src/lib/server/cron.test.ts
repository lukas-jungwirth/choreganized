/**
 * `npm test` — Vitest (→ docs/TESTING.md).
 *
 * Only the start and the stop of the schedule, not the jobs: those have their own tests
 * through the services they call. The stop is what lets the built server exit on SIGTERM
 * (→ hooks.server.ts). While any task is registered, its timer keeps Node alive, Docker
 * SIGKILLs it, and under Litestream the last upload goes with it (→ DECISIONS #158).
 */
import assert from 'node:assert/strict';
import { getTasks } from 'node-cron';
import { describe, it } from 'vitest';
import { registerCronJobs, stopCronJobs } from './cron.ts';

describe('the cron schedule', () => {
	it('registers once, stops completely, and can register again after a stop', async () => {
		registerCronJobs();
		registerCronJobs();
		const registered = getTasks().size;
		assert.ok(registered > 0, 'jobs are on the tick');

		await stopCronJobs();
		assert.equal(getTasks().size, 0, 'no task left to hold the process open');

		registerCronJobs();
		assert.equal(getTasks().size, registered, 'a later start registers the same jobs');
		await stopCronJobs();
	});
});
