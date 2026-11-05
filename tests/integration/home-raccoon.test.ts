/**
 * Home's everyday raccoon is the reader's own draw (→ DECISIONS #232): seeded
 * by the member and the date, so housemates meet their own raccoons and fill
 * their own raccoon albums. Someone opening Home for the first time is waved at
 * by the welcome raccoon first (→ DECISIONS #238).
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { listMembers } from '$lib/server/services/household';
import { getHomeSummary } from '$lib/server/services/home';
import { listSightings, recordSighting } from '$lib/server/services/raccoons';
import { addDays } from '$lib/utils/dates';
import { everydayRaccoon, MIDNIGHT_RACCOON, WELCOME_RACCOON } from '$lib/utils/raccoon';
import { makeHousehold } from '../helpers/db';

const TODAY = '2036-06-18';

/** A Wednesday in Vienna, no special day; 12:00Z is 14:00 there. */
function at(instant: string) {
	vi.setSystemTime(new Date(instant));
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	at('2036-06-18T12:00:00Z');
});
afterEach(() => vi.useRealTimers());

function household(housemates: string[] = []) {
	const { householdId, timezone, members } = makeHousehold({ housemates });
	const context = { timezone, today: TODAY, members: listMembers(householdId), overdue: [] };
	const home = (member: (typeof members)[number]) =>
		getHomeSummary(householdId, { ...context, member });
	/** Opening Home: what the page's load does with the summary. */
	const visit = (member: (typeof members)[number]) => {
		const summary = home(member);
		recordSighting(householdId, member.id, summary.raccoon, TODAY, summary.slot);
		return summary.raccoon;
	};
	return { householdId, members, home, visit };
}

describe("Home's everyday raccoon", () => {
	it('is drawn for each member by their own id', () => {
		const { householdId, members, home } = household(['Mia', 'Jo']);
		for (const member of members) {
			// Met one in the morning, so this afternoon is no first visit.
			recordSighting(householdId, member.id, 'reading', TODAY, `${TODAY}#0`);
			assert.equal(home(member).raccoon, everydayRaccoon(TODAY, 14, member.id), member.displayName);
		}
	});
});

describe("a member's first visit", () => {
	it('is the welcome raccoon, for the rest of that slot, then the draw', () => {
		const { members, visit } = household();
		const [me] = members;

		assert.equal(visit(me), WELCOME_RACCOON);
		// A reload in the same afternoon still waves.
		at('2036-06-18T14:30:00Z');
		assert.equal(visit(me), WELCOME_RACCOON);
		// The evening is the next slot: the day's own draw.
		at('2036-06-18T16:00:00Z');
		assert.equal(visit(me), everydayRaccoon(TODAY, 18, me.id));
	});

	it('is each member’s own: a housemate who joins later is welcomed too', () => {
		const { members, visit } = household(['Mia']);
		const [me, mia] = members;
		at('2036-06-18T06:00:00Z');
		visit(me);
		at('2036-06-18T12:00:00Z');
		assert.equal(visit(me), everydayRaccoon(TODAY, 14, me.id));
		assert.equal(visit(mia), WELCOME_RACCOON);
	});

	it('waves even at night', () => {
		const { members, visit } = household();
		at('2036-06-18T21:00:00Z'); // 23:00 in Vienna
		assert.equal(visit(members[0]), WELCOME_RACCOON);
	});

	it('is nobody’s first visit who has met another raccoon already', () => {
		const { householdId, members, home } = household();
		const [me] = members;
		recordSighting(householdId, me.id, 'sleeping', '2036-06-17', '2036-06-17#n');
		assert.equal(home(me).raccoon, everydayRaccoon(TODAY, 14, me.id));
	});
});

describe('after midnight', () => {
	it('is the midnight raccoon on some of a member’s nights, and it goes in their album', () => {
		const { householdId, members } = household();
		const [me] = members;
		recordSighting(householdId, me.id, 'reading', TODAY, `${TODAY}#0`);

		const shown: string[] = [];
		let first: string | null = null;
		for (let night = 0; night < 30; night++) {
			const today = addDays('2036-07-01', night);
			at(`${addDays(today, -1)}T22:30:00Z`); // 00:30 in Vienna
			const summary = getHomeSummary(householdId, {
				timezone: 'Europe/Vienna',
				today,
				members: listMembers(householdId),
				overdue: [],
				member: me
			});
			shown.push(summary.raccoon);
			if (summary.raccoon === MIDNIGHT_RACCOON && !first) {
				first = today;
				recordSighting(householdId, me.id, summary.raccoon, today, summary.slot);
				assert.ok(
					listSightings(householdId, me.id).some((seen) => seen.raccoon === MIDNIGHT_RACCOON)
				);
			}
		}
		assert.ok(first, 'met it within a month of late nights');
		assert.ok(shown.includes('sleeping'), 'and not every night');
		assert.deepEqual([...new Set(shown)].sort(), [MIDNIGHT_RACCOON, 'sleeping'].sort());
	});
});
