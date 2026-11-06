/**
 * What a timer that went off leaves behind (→ SPEC §4.6, DECISIONS #251). Whoever
 * comes back to a silent phone has to find it still on the list, counting past
 * zero, until they stop it, without it being rung a second time or holding up a
 * new timer.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';
import {
	cancelTimer,
	listActiveTimers,
	markTimerRung,
	startTimer,
	sweepCookTimers
} from '$lib/server/services/cook-timers';
import { catalog } from '$lib/i18n';
import { TIMERS_MAX } from '$lib/utils/timer-parse';
import { makeHousehold } from '../helpers/db';

const sent = vi.hoisted(
	() => [] as Array<{ userId: string; payload: unknown; options?: { urgency?: string } }>
);

vi.mock('$lib/server/push', async (original) => ({
	...(await original<typeof import('$lib/server/push')>()),
	sendToUser: async (
		userId: string,
		payload: (m: unknown) => unknown,
		options?: { urgency?: string }
	): Promise<number> => {
		sent.push({ userId, payload, options });
		return 1;
	}
}));

const START = new Date('2026-11-06T18:00:00Z');
const MINUTE = 60_000;

function after(ms: number): Date {
	return new Date(START.getTime() + ms);
}

function start(householdId: string, userId: string, seconds = 60) {
	return startTimer(
		householdId,
		userId,
		{ label: 'Rice', seconds, recipeId: null, stepIndex: null, replaces: null },
		START
	);
}

describe('a timer that has gone off', () => {
	beforeEach(() => {
		sent.length = 0;
	});

	it('stays on the list, counting past zero, until somebody stops it', () => {
		const { householdId, owner } = makeHousehold();
		const timer = start(householdId, owner.userId);

		assert.deepEqual(
			listActiveTimers(householdId, owner.userId, after(30_000)).map((t) => [
				t.remainingMs,
				t.rung
			]),
			[[30_000, false]]
		);

		assert.equal(markTimerRung(householdId, owner.userId, timer.id, after(MINUTE)), true);

		const [late] = listActiveTimers(householdId, owner.userId, after(MINUTE + 754_000));
		assert.equal(late.id, timer.id);
		assert.equal(late.remainingMs, -754_000);
		assert.equal(late.rung, true);
		assert.equal(late.totalSeconds, 60);

		assert.equal(cancelTimer(householdId, owner.userId, timer.id, after(2 * MINUTE)), true);
		assert.deepEqual(listActiveTimers(householdId, owner.userId, after(2 * MINUTE)), []);
		assert.equal(cancelTimer(householdId, owner.userId, timer.id, after(3 * MINUTE)), false);
	});

	it('is gone by the time dinner is long over', () => {
		const { householdId, owner } = makeHousehold();
		start(householdId, owner.userId);

		const hours = (n: number) => after(MINUTE + n * 60 * MINUTE);

		assert.equal(listActiveTimers(householdId, owner.userId, hours(2.9)).length, 1);
		assert.equal(listActiveTimers(householdId, owner.userId, hours(3.1)).length, 0);
	});

	it('takes no slot from the next timer', () => {
		const { householdId, owner } = makeHousehold();
		for (let i = 0; i < TIMERS_MAX; i++) {
			markTimerRung(householdId, owner.userId, start(householdId, owner.userId).id, after(MINUTE));
		}

		const fresh = startTimer(
			householdId,
			owner.userId,
			{ label: 'Pasta', seconds: 60, recipeId: null, stepIndex: null, replaces: null },
			after(2 * MINUTE)
		);

		assert.equal(fresh.rung, false);
		assert.equal(
			listActiveTimers(householdId, owner.userId, after(2 * MINUTE)).length,
			TIMERS_MAX + 1
		);
	});

	it('is replaced outright by a +1:00 in the last seconds, after the page claimed it', () => {
		const { householdId, owner } = makeHousehold();
		const timer = start(householdId, owner.userId);
		markTimerRung(householdId, owner.userId, timer.id, after(58_000));

		const longer = startTimer(
			householdId,
			owner.userId,
			{ label: 'Rice', seconds: 62, recipeId: null, stepIndex: null, replaces: timer.id },
			after(58_500)
		);

		assert.deepEqual(
			listActiveTimers(householdId, owner.userId, after(59_000)).map((t) => t.id),
			[longer.id]
		);
	});

	it('cannot be stopped from another household', () => {
		const home = makeHousehold();
		const other = makeHousehold();
		const timer = start(home.householdId, home.owner.userId);
		markTimerRung(home.householdId, home.owner.userId, timer.id, after(MINUTE));

		assert.equal(
			cancelTimer(other.householdId, other.owner.userId, timer.id, after(MINUTE)),
			false
		);
		assert.equal(listActiveTimers(home.householdId, home.owner.userId, after(MINUTE)).length, 1);
	});

	it('tells the notification when it went off, and is only sent once', async () => {
		const { householdId, owner } = makeHousehold();
		const timer = start(householdId, owner.userId);

		const due = after(MINUTE + 5000);
		await sweepCookTimers(due);
		await sweepCookTimers(after(MINUTE + 65_000));

		const mine = sent.filter((push) => push.userId === owner.userId);
		assert.equal(mine.length, 1);
		// Otherwise Android may hold it back on a locked phone lying still.
		assert.equal(mine[0].options?.urgency, 'high');

		const payload = (
			mine[0].payload as (m: unknown) => {
				tag: string;
				timestamp: number;
				timerId: string;
				actions: { action: string; title: string }[];
			}
		)(catalog('en'));
		assert.equal(payload.timestamp, after(MINUTE).getTime());
		assert.equal(payload.tag, `timer-${timer.id}`);
		assert.equal(payload.timerId, timer.id);
		assert.deepEqual(payload.actions, [{ action: 'stop-timer', title: 'Stop' }]);

		cancelTimer(householdId, owner.userId, timer.id, due);
	});
});
