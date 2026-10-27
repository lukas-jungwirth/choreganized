/**
 * The per-address code limit (→ send-limit.ts): one a minute, five an hour.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createSendLimiter, SEND_LIMITS } from './send-limit';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 27, 12, 0, 0);

describe('createSendLimiter', () => {
	it('lets the first code through and holds the next one for 60 seconds', () => {
		const limiter = createSendLimiter(SEND_LIMITS);
		assert.deepEqual(limiter.check('a@example.test', T0), { ok: true });
		limiter.record('a@example.test', T0);

		assert.deepEqual(limiter.check('a@example.test', T0 + 18_000), {
			ok: false,
			reason: 'cooldown',
			retryAfterSeconds: 42
		});
		assert.deepEqual(limiter.check('a@example.test', T0 + MIN), { ok: true });
	});

	it('counts the address, not its spelling', () => {
		const limiter = createSendLimiter(SEND_LIMITS);
		limiter.record('Lukas@Example.test ', T0);
		assert.equal(limiter.check('lukas@example.test', T0 + 1000).ok, false);
	});

	it('keeps addresses apart', () => {
		const limiter = createSendLimiter(SEND_LIMITS);
		limiter.record('a@example.test', T0);
		assert.deepEqual(limiter.check('b@example.test', T0), { ok: true });
	});

	it('allows five an hour, then waits for the oldest to leave the hour', () => {
		const limiter = createSendLimiter(SEND_LIMITS);
		for (let i = 0; i < 5; i++) limiter.record('a@example.test', T0 + i * 2 * MIN);

		// Ten minutes in: past the cooldown, but the hour is full until T0 + 60 min.
		assert.deepEqual(limiter.check('a@example.test', T0 + 10 * MIN), {
			ok: false,
			reason: 'hourly',
			retryAfterSeconds: 50 * 60
		});
		assert.deepEqual(limiter.check('a@example.test', T0 + 60 * MIN), { ok: true });
	});

	it('forgets a send whose mail never left', () => {
		const limiter = createSendLimiter(SEND_LIMITS);
		limiter.record('a@example.test', T0);
		limiter.forget('a@example.test');
		assert.deepEqual(limiter.check('a@example.test', T0 + 1000), { ok: true });
	});

	it('never answers "wait 0 seconds"', () => {
		const limiter = createSendLimiter(SEND_LIMITS);
		limiter.record('a@example.test', T0);
		const check = limiter.check('a@example.test', T0 + MIN - 1);
		assert.equal(check.ok === false && check.retryAfterSeconds, 1);
	});
});
