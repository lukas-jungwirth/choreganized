/**
 * Home's everyday raccoon is the reader's own (→ DECISIONS #232): housemates
 * sit at different places in the rotation, so the same afternoon shows each of
 * them a different pose, and the raccoon album is worth filling one each.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { listMembers } from '$lib/server/services/household';
import { getHomeSummary } from '$lib/server/services/home';
import { everydayRaccoon } from '$lib/utils/raccoon';
import { makeHousehold } from '../helpers/db';

describe("Home's everyday raccoon", () => {
	beforeEach(() => {
		// A Wednesday afternoon in Vienna, no special day: an everyday pose.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2036-06-18T12:00:00Z'));
	});
	afterEach(() => vi.useRealTimers());

	it('is a different one for each housemate, and the first to join keeps the old one', () => {
		const { householdId, timezone, members } = makeHousehold({ housemates: ['Mia', 'Jo'] });
		const roster = listMembers(householdId);
		const context = { timezone, today: '2036-06-18', members: roster, overdue: [] };

		const raccoons = members.map(
			(member) => getHomeSummary(householdId, { ...context, member }).raccoon
		);

		assert.equal(new Set(raccoons).size, 3, raccoons.join(', '));
		assert.equal(raccoons[0], everydayRaccoon('2036-06-18', 14));
	});
});
