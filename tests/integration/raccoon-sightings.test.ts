/**
 * The raccoon album's sightings (→ plan 35, services/raccoons.ts): a raccoon
 * counts once per slot of Home's day, belongs to the member who met it, and
 * leaves with them.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { describe, it } from 'vitest';
import { leaveHousehold } from '$lib/server/services/household';
import {
	countSightings,
	listSightings,
	markSightingsNoticed,
	recordSighting
} from '$lib/server/services/raccoons';
import { db, makeHousehold, tables } from '../helpers/db';

const TODAY = '2036-06-18';

describe('recordSighting', () => {
	it('is new the first time, and counts the slot it fell in', () => {
		const { householdId, owner } = makeHousehold();

		const first = recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);
		assert.deepEqual(first, { isNew: true, found: 1, total: 39 });

		const [row] = listSightings(householdId, owner.id);
		assert.equal(row.raccoon, 'beach');
		assert.equal(row.firstSeenOn, TODAY);
		assert.equal(row.seenCount, 1);
		assert.equal(row.noticedAt, null);
	});

	it('changes nothing for a second look in the same slot', () => {
		const { householdId, owner } = makeHousehold();
		recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);

		const again = recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);
		assert.deepEqual(again, { isNew: false, found: 1, total: 39 });
		assert.equal(listSightings(householdId, owner.id)[0].seenCount, 1);
	});

	it('counts the next slot once more, and keeps the first day', () => {
		const { householdId, owner } = makeHousehold();
		recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);

		recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#2`);
		recordSighting(householdId, owner.id, 'beach', '2036-06-19', '2036-06-19#0');

		const [row] = listSightings(householdId, owner.id);
		assert.equal(row.seenCount, 3);
		assert.equal(row.firstSeenOn, TODAY);
		assert.equal(row.lastSlot, '2036-06-19#0');
	});

	it('adds a second raccoon to the count', () => {
		const { householdId, owner } = makeHousehold();
		recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);

		const second = recordSighting(householdId, owner.id, 'fishing', TODAY, `${TODAY}#2`);
		assert.deepEqual(second, { isNew: true, found: 2, total: 39 });
		assert.equal(countSightings(householdId, owner.id), 2);
	});

	it('leaves a raccoon retired from the album out of the count', () => {
		const { householdId, owner } = makeHousehold();
		recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);
		db.insert(tables.raccoonSightings)
			.values({
				householdId,
				memberId: owner.id,
				raccoon: 'retired-pose',
				firstSeenOn: TODAY,
				lastSlot: `${TODAY}#0`
			})
			.run();

		assert.equal(countSightings(householdId, owner.id), 1);
		assert.deepEqual(
			listSightings(householdId, owner.id).map((row) => row.raccoon),
			['beach']
		);
		assert.equal(recordSighting(householdId, owner.id, 'fishing', TODAY, `${TODAY}#2`).found, 2);
	});

	it('refuses a raccoon that is not in the album', () => {
		const { householdId, owner } = makeHousehold();
		assert.throws(() => recordSighting(householdId, owner.id, 'shopping', TODAY, `${TODAY}#1`));
		assert.equal(countSightings(householdId, owner.id), 0);
	});
});

describe('whose album', () => {
	it('keeps each member to their own, and each household to its own', () => {
		const home = makeHousehold({ housemates: ['Mia'] });
		const [owner, mia] = home.members;
		const other = makeHousehold();

		recordSighting(home.householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);

		assert.equal(countSightings(home.householdId, mia.id), 0);
		assert.deepEqual(listSightings(home.householdId, mia.id), []);
		// The right member id under the wrong household reads nothing either.
		assert.equal(countSightings(other.householdId, owner.id), 0);

		// Mia meeting the same raccoon is her own first time.
		assert.equal(
			recordSighting(home.householdId, mia.id, 'beach', TODAY, `${TODAY}#1`).isNew,
			true
		);
	});

	it('goes with a member who leaves', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Mia'] });
		const mia = members[1];
		recordSighting(householdId, mia.id, 'beach', TODAY, `${TODAY}#1`);

		leaveHousehold(householdId, mia.id);

		const rows = db
			.select()
			.from(tables.raccoonSightings)
			.where(eq(tables.raccoonSightings.memberId, mia.id))
			.all();
		assert.deepEqual(rows, []);
	});
});

describe('markSightingsNoticed', () => {
	it('clears the "New" badges of this member only', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Mia'] });
		const [owner, mia] = members;
		recordSighting(householdId, owner.id, 'beach', TODAY, `${TODAY}#1`);
		recordSighting(householdId, mia.id, 'beach', TODAY, `${TODAY}#1`);

		const now = new Date('2036-06-18T15:00:00Z');
		markSightingsNoticed(householdId, owner.id, now);

		assert.deepEqual(listSightings(householdId, owner.id)[0].noticedAt, now);
		assert.equal(listSightings(householdId, mia.id)[0].noticedAt, null);
	});
});
