/**
 * The admin page's numbers (→ services/admin.ts, plan 34). What "active" means
 * is the part worth pinning: something a person did, inside the window, in
 * *that* household, and nothing a newer household's activity could lend an
 * older one.
 */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { describe, it } from 'vitest';
import { ADMIN_WEEKS, getAdminStats } from '$lib/server/services/admin';
import { db, makeHousehold, tables } from '../helpers/db';

const DAY = 24 * 60 * 60 * 1000;

describe('getAdminStats', () => {
	it('counts households by their newest activity, and buckets sign-ups by week', () => {
		const now = new Date('2026-11-03T12:00:00Z');
		const ago = (days: number) => new Date(now.getTime() - days * DAY);

		// Busy: two members, an item added two days ago.
		const busy = makeHousehold({ name: 'Busy', housemates: ['Mia'] });
		db.update(tables.households)
			.set({ createdAt: ago(60) })
			.where(eq(tables.households.id, busy.householdId))
			.run();
		db.insert(tables.shoppingItems)
			.values({ householdId: busy.householdId, name: 'Milk', createdAt: ago(2) })
			.run();

		// Lapsed: last did anything twenty days ago — active in 30, not in 7.
		const lapsed = makeHousehold({ name: 'Lapsed' });
		db.update(tables.households)
			.set({ createdAt: ago(25) })
			.where(eq(tables.households.id, lapsed.householdId))
			.run();
		db.insert(tables.shoppingItems)
			.values({
				householdId: lapsed.householdId,
				name: 'Bread',
				createdAt: ago(40),
				checkedAt: ago(20)
			})
			.run();

		// Silent: created this week, never touched.
		const silent = makeHousehold({ name: 'Silent' });
		db.update(tables.households)
			.set({ createdAt: ago(1) })
			.where(eq(tables.households.id, silent.householdId))
			.run();

		// Users are stamped at insert by the real clock; pin them to `now`'s week.
		db.update(tables.user)
			.set({ createdAt: ago(3) })
			.run();

		const stats = getAdminStats(now);

		assert.deepEqual(stats.totals, { users: 4, households: 3, members: 4, pushDevices: 0 });
		assert.equal(stats.active7, 1);
		assert.equal(stats.active30, 2);

		assert.deepEqual(
			stats.households.map((h) => [h.name, h.memberCount, h.lastActiveAt?.getTime() ?? null]),
			[
				['Busy', 2, ago(2).getTime()],
				// The check-off, not the older add: the newest thing anyone did.
				['Lapsed', 1, ago(20).getTime()],
				['Silent', 1, null]
			]
		);

		assert.equal(stats.weeks.length, ADMIN_WEEKS);
		assert.deepEqual(
			stats.weeks.map((week) => week.households),
			// Oldest week first: 60 days back is the 9th week back, 25 the 4th, 1 this one.
			[0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1]
		);
		assert.deepEqual(
			stats.weeks.map((week) => week.users),
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4]
		);
	});
});
