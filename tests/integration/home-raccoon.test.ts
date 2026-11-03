/**
 * Home's everyday raccoon is the reader's own draw (→ DECISIONS #232): seeded
 * by the member and the date, so housemates meet their own raccoons and fill
 * their own raccoon albums.
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

	it('is drawn for each member by their own id', () => {
		const { householdId, timezone, members } = makeHousehold({ housemates: ['Mia', 'Jo'] });
		const context = {
			timezone,
			today: '2036-06-18',
			members: listMembers(householdId),
			overdue: []
		};

		for (const member of members) {
			assert.equal(
				getHomeSummary(householdId, { ...context, member }).raccoon,
				everydayRaccoon('2036-06-18', 14, member.id),
				member.displayName
			);
		}
	});
});
