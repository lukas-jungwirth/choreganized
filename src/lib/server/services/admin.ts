/**
 * The admin page's numbers (→ plan 34, SPEC §12).
 *
 * The one service that reads across households, and the only reason that is
 * allowed: its single caller is `/admin`, behind `requireAdmin` (→ DECISIONS
 * #227). Counts, dates and household names — never what is *in* a household:
 * no chores, items, recipes or amounts.
 *
 * "Active" is something a person did, not something the server did on its own:
 * a chore ticked or skipped, a shopping item added or checked, a dinner
 * planned, a recipe or an expense added, or a member's session refreshed (Better
 * Auth renews it about once a day while the app is open). Reminders and
 * recurring expenses run on cron and say nothing about anyone using the app.
 */
import { count, eq, max } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from '../db';
import {
	expenses,
	households,
	meals,
	members,
	pushSubscriptions,
	recipes,
	session,
	shoppingItems,
	taskCompletions,
	user
} from '../db/schema';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/** How many weeks the sign-up bars go back. */
export const ADMIN_WEEKS = 12;

export type AdminHousehold = {
	id: string;
	name: string;
	memberCount: number;
	createdAt: Date;
	/** The newest thing anyone in it did, or null if nobody ever did anything. */
	lastActiveAt: Date | null;
};

export type AdminWeek = {
	/** Start of the week, counted back from now in whole weeks. */
	start: Date;
	households: number;
	users: number;
};

export type AdminStats = {
	totals: {
		users: number;
		households: number;
		members: number;
		/** Devices with notifications on. */
		pushDevices: number;
	};
	active7: number;
	active30: number;
	/** Oldest first, the current week last. */
	weeks: AdminWeek[];
	/** Most recently active first; never-active ones last, newest first. */
	households: AdminHousehold[];
};

/** Newest timestamp per household out of one table. */
function newestBy(
	table: SQLiteTable,
	householdId: SQLiteColumn,
	at: SQLiteColumn
): Map<string, number> {
	const rows = db
		.select({ householdId, at: max(at) })
		.from(table)
		.groupBy(householdId)
		.all() as { householdId: string; at: Date | number | null }[];

	return new Map(
		rows
			.filter((row) => row.at !== null)
			.map((row) => [row.householdId, row.at instanceof Date ? row.at.getTime() : Number(row.at)])
	);
}

/** Newest session refresh per household, through the member that owns it. */
function newestSessionBy(): Map<string, number> {
	const rows = db
		.select({ householdId: members.householdId, at: max(session.updatedAt) })
		.from(session)
		.innerJoin(members, eq(members.userId, session.userId))
		.groupBy(members.householdId)
		.all();

	return new Map(
		rows.filter((row) => row.at !== null).map((row) => [row.householdId, row.at!.getTime()])
	);
}

function lastActivity(): Map<string, number> {
	const sources = [
		newestBy(taskCompletions, taskCompletions.householdId, taskCompletions.completedAt),
		newestBy(shoppingItems, shoppingItems.householdId, shoppingItems.createdAt),
		newestBy(shoppingItems, shoppingItems.householdId, shoppingItems.checkedAt),
		newestBy(meals, meals.householdId, meals.createdAt),
		newestBy(recipes, recipes.householdId, recipes.createdAt),
		newestBy(expenses, expenses.householdId, expenses.createdAt),
		newestSessionBy()
	];

	const newest = new Map<string, number>();
	for (const source of sources) {
		for (const [householdId, at] of source) {
			newest.set(householdId, Math.max(at, newest.get(householdId) ?? 0));
		}
	}
	return newest;
}

/** Which of the last `ADMIN_WEEKS` weeks a moment falls in, 0 = oldest; -1 = earlier. */
function weekIndex(at: Date, now: Date): number {
	const back = Math.floor((now.getTime() - at.getTime()) / WEEK);
	return back < 0 || back >= ADMIN_WEEKS ? -1 : ADMIN_WEEKS - 1 - back;
}

export function getAdminStats(now: Date = new Date()): AdminStats {
	const newest = lastActivity();

	const memberCounts = new Map(
		db
			.select({ householdId: members.householdId, n: count() })
			.from(members)
			.groupBy(members.householdId)
			.all()
			.map((row) => [row.householdId, row.n])
	);

	const list: AdminHousehold[] = db
		.select({ id: households.id, name: households.name, createdAt: households.createdAt })
		.from(households)
		.all()
		.map((household) => {
			const at = newest.get(household.id);
			return {
				...household,
				memberCount: memberCounts.get(household.id) ?? 0,
				lastActiveAt: at === undefined ? null : new Date(at)
			};
		})
		.sort(
			(a, b) =>
				(b.lastActiveAt?.getTime() ?? -1) - (a.lastActiveAt?.getTime() ?? -1) ||
				b.createdAt.getTime() - a.createdAt.getTime()
		);

	const activeSince = (days: number) =>
		list.filter((h) => h.lastActiveAt && h.lastActiveAt.getTime() > now.getTime() - days * DAY)
			.length;

	const weeks: AdminWeek[] = Array.from({ length: ADMIN_WEEKS }, (_, index) => ({
		start: new Date(now.getTime() - (ADMIN_WEEKS - index) * WEEK),
		households: 0,
		users: 0
	}));
	for (const household of list) {
		const index = weekIndex(household.createdAt, now);
		if (index >= 0) weeks[index].households += 1;
	}
	const users = db.select({ createdAt: user.createdAt }).from(user).all();
	for (const row of users) {
		const index = weekIndex(row.createdAt, now);
		if (index >= 0) weeks[index].users += 1;
	}

	return {
		totals: {
			users: users.length,
			households: list.length,
			members: [...memberCounts.values()].reduce((sum, n) => sum + n, 0),
			pushDevices: db.select({ n: count() }).from(pushSubscriptions).get()?.n ?? 0
		},
		active7: activeSince(7),
		active30: activeSince(30),
		weeks,
		households: list
	};
}
