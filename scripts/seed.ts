/**
 * Dev seed — demo household data so the later plans have something to render.
 *
 *   npm run db:seed -- you@example.com
 *
 * The email is the Google account you signed in with: the seed binds the demo
 * household to that existing user, so **sign in once before running it**. If you
 * already have a household (plan 01 onboarding), the demo data is added to that
 * one instead of creating a second.
 *
 * Re-running is safe. Every seeded row has a deterministic id and is inserted
 * with ON CONFLICT DO NOTHING: nothing is duplicated, and nothing you changed in
 * the app is overwritten. Deleting a seeded row in the app and re-running brings
 * it back — that's the intended "reset my demo data" workflow.
 *
 * Standalone by design: SvelteKit's virtual modules ($lib, $env) don't resolve
 * outside Vite, so this opens its own connection with the same pragmas as
 * src/lib/server/db/index.ts. Run with Node's native TypeScript support.
 */
import Database from 'better-sqlite3';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
	households,
	meals,
	members,
	recipeIngredients,
	recipeSteps,
	recipes,
	shoppingItems,
	stores,
	taskCompletions,
	tasks,
	user
} from '../src/lib/server/db/schema.ts';

/* ── Calendar helpers ────────────────────────────────────────────────────────
 * Household-local 'YYYY-MM-DD' strings. Plan 04 builds the real
 * src/lib/utils/dates.ts; this script stays standalone, so it keeps its own
 * two-line copy. `en-CA` formats as YYYY-MM-DD; the arithmetic runs entirely in
 * UTC so it never round-trips a local date through a timezone offset.
 */
function todayIn(timezone: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

function addDays(date: string, days: number): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Instant N days ago at a plausible hour — clamped to the past, so seeding at
 * 07:00 never stamps a task as completed at 10:00 "today".
 */
function daysAgo(days: number, hour: number): Date {
	const at = new Date();
	at.setDate(at.getDate() - days);
	at.setHours(hour, 12, 0, 0);
	const now = Date.now();
	return at.getTime() > now ? new Date(now - days * 86_400_000 - 90 * 60_000) : at;
}

/* ── Connect ─────────────────────────────────────────────────────────────── */

const email = process.argv[2];

if (!email) {
	console.error('Usage: npm run db:seed -- you@example.com');
	process.exit(1);
}

const databasePath = process.env.DATABASE_PATH ?? './data/choreganized.db';
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: 'src/lib/server/db/migrations' });

const owner = db.select().from(user).where(eq(user.email, email)).get();

if (!owner) {
	console.error(
		`No user with email ${email} in ${databasePath}.\n` +
			'Start the app, sign in with Google once, then run this again.'
	);
	process.exit(1);
}

/* ── Household & members ─────────────────────────────────────────────────── */

const DEMO_HOUSEMATE_ID = 'seed-user-elisabeth';
const MEMBER_SAGE = '#5F8D72';
const MEMBER_TERRACOTTA = '#C67C51';

/** Same shape as the real one plan 01 builds: 6 chars, no ambiguous glyphs. */
function inviteCode(): string {
	const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
	return Array.from(
		crypto.getRandomValues(new Uint8Array(6)),
		(byte) => alphabet[byte % alphabet.length]
	).join('');
}

const existingMembership = db.select().from(members).where(eq(members.userId, owner.id)).get();

const householdId = existingMembership?.householdId ?? crypto.randomUUID();

/** Deterministic id for a seeded row — the whole idempotency story. */
const sid = (kind: string, name: string) => `seed:${householdId}:${kind}:${name}`;

/**
 * Rows actually written. SQLite counts every row an INSERT touches on this
 * connection, and ON CONFLICT DO NOTHING skips don't count — so the delta across
 * the transaction is exactly "what was new this run".
 */
const rowsWritten = () => sqlite.prepare('select total_changes()').pluck().get() as number;
const before = rowsWritten();

const seeded = db.transaction((tx) => {
	if (!existingMembership) {
		tx.insert(households)
			.values({
				id: householdId,
				name: 'Sonnengasse 12',
				inviteCode: inviteCode(),
				timezone: 'Europe/Vienna'
			})
			.onConflictDoNothing()
			.run();

		tx.insert(members)
			.values({
				id: sid('member', 'owner'),
				householdId,
				userId: owner.id,
				displayName: owner.name.split(' ')[0] || 'You',
				color: MEMBER_SAGE,
				role: 'owner'
			})
			.onConflictDoNothing()
			.run();
	}

	// A second member makes assignees, avatars and the leaderboard meaningful.
	// The user row is a stub: no account row, so it can never be signed in to.
	// Skipped once a real housemate has joined.
	const memberCount = tx
		.select({ id: members.id })
		.from(members)
		.where(eq(members.householdId, householdId))
		.all().length;

	if (memberCount < 2) {
		tx.insert(user)
			.values({
				id: DEMO_HOUSEMATE_ID,
				name: 'Elisabeth',
				email: 'elisabeth@seed.choreganized.local',
				emailVerified: false
			})
			.onConflictDoNothing()
			.run();

		tx.insert(members)
			.values({
				id: sid('member', 'housemate'),
				householdId,
				userId: DEMO_HOUSEMATE_ID,
				displayName: 'Elisabeth',
				color: MEMBER_TERRACOTTA,
				role: 'member'
			})
			.onConflictDoNothing()
			.run();
	}

	// Resolve the two members the demo data hangs off *after* the inserts: the
	// housemate may be a real person who joined (stub skipped), or the stub
	// insert may have been a no-op. Everything below references these ids, so
	// they have to be ids that exist.
	const householdMembers = tx
		.select({ id: members.id, displayName: members.displayName })
		.from(members)
		.where(eq(members.householdId, householdId))
		.orderBy(asc(members.joinedAt))
		.all();

	const ownerMember =
		householdMembers.find((member) => member.id === existingMembership?.id) ??
		householdMembers.find((member) => member.id === sid('member', 'owner')) ??
		householdMembers[0];

	if (!ownerMember) throw new Error(`Household ${householdId} has no members to seed against.`);

	// One-member household (a real housemate can't be invented): everything is
	// yours, which still exercises every screen.
	const housemate = householdMembers.find((member) => member.id !== ownerMember.id) ?? ownerMember;

	const ownerMemberId = ownerMember.id;
	const ownerName = ownerMember.displayName;
	const housemateMemberId = housemate.id;
	const housemateName = housemate.displayName;

	const household = tx
		.select({ name: households.name, timezone: households.timezone })
		.from(households)
		.where(eq(households.id, householdId))
		.get();

	const today = todayIn(household?.timezone ?? 'Europe/Vienna');

	/* ── Shopping ────────────────────────────────────────────────────────── */

	/**
	 * Onboarding already hands a new household these three stores, and their ids
	 * are UUIDs — so seeding into a household you created in the app would file
	 * the demo items under a *second* "Grocery" if we went by id alone. Match on
	 * the name first and only insert what's genuinely missing.
	 */
	const DEMO_STORES = [
		{ key: 'grocery', name: 'Grocery' },
		{ key: 'drugstore', name: 'Drugstore' },
		{ key: 'hardware', name: 'Hardware store' }
	];

	const existingStores = tx
		.select({ id: stores.id, name: stores.name })
		.from(stores)
		.where(eq(stores.householdId, householdId))
		.all();

	const storeId = (key: string): string => {
		const demo = DEMO_STORES.find((store) => store.key === key);
		const existing = existingStores.find(
			(store) => store.name.toLowerCase() === demo?.name.toLowerCase()
		);
		return existing?.id ?? sid('store', key);
	};

	tx.insert(stores)
		.values(
			DEMO_STORES.map(({ key, name }, sortOrder) => ({
				id: storeId(key),
				householdId,
				name,
				sortOrder
			}))
		)
		.onConflictDoNothing()
		.run();

	tx.insert(shoppingItems)
		.values([
			{
				id: sid('item', 'tomatoes'),
				householdId,
				storeId: storeId('grocery'),
				name: 'Tomatoes',
				quantity: 6,
				unit: 'pcs',
				addedByMemberId: ownerMemberId
			},
			{
				id: sid('item', 'spinach'),
				householdId,
				storeId: storeId('grocery'),
				name: 'Baby spinach',
				addedByMemberId: housemateMemberId
			},
			{
				id: sid('item', 'oat-milk'),
				householdId,
				storeId: storeId('grocery'),
				name: 'Oat milk',
				quantity: 2,
				unit: 'L',
				addedByMemberId: ownerMemberId
			},
			{
				id: sid('item', 'olive-oil'),
				householdId,
				storeId: storeId('grocery'),
				name: 'Olive oil',
				addedByMemberId: housemateMemberId
			},
			{
				id: sid('item', 'avocado'),
				householdId,
				storeId: storeId('grocery'),
				name: 'Avocado',
				quantity: 2,
				unit: 'pcs',
				addedByMemberId: ownerMemberId,
				checkedAt: daysAgo(0, 9),
				checkedByMemberId: housemateMemberId
			},
			{
				id: sid('item', 'yogurt'),
				householdId,
				storeId: storeId('grocery'),
				name: 'Greek yogurt',
				addedByMemberId: housemateMemberId,
				checkedAt: daysAgo(0, 9),
				checkedByMemberId: housemateMemberId
			},
			{
				id: sid('item', 'shampoo'),
				householdId,
				storeId: storeId('drugstore'),
				name: 'Shampoo',
				addedByMemberId: housemateMemberId
			},
			{
				id: sid('item', 'cotton-pads'),
				householdId,
				storeId: storeId('drugstore'),
				name: 'Cotton pads',
				quantity: 2,
				unit: 'pack',
				addedByMemberId: housemateMemberId
			},
			{
				id: sid('item', 'bulbs'),
				householdId,
				storeId: storeId('hardware'),
				name: 'LED bulbs (E27)',
				quantity: 2,
				unit: 'pcs',
				addedByMemberId: ownerMemberId
			},
			{
				id: sid('item', 'batteries'),
				householdId,
				name: 'AA batteries',
				quantity: 4,
				unit: 'pcs',
				addedByMemberId: ownerMemberId
			}
		])
		.onConflictDoNothing()
		.run();

	/* ── Recipes ─────────────────────────────────────────────────────────── */

	const pastaId = sid('recipe', 'mushroom-pasta');
	const curryId = sid('recipe', 'lentil-curry');

	tx.insert(recipes)
		.values([
			{
				id: pastaId,
				householdId,
				name: 'Creamy mushroom pasta',
				timeMinutes: 30,
				servings: 4,
				createdByMemberId: housemateMemberId
			},
			{
				id: curryId,
				householdId,
				name: 'Lentil curry',
				timeMinutes: 40,
				servings: 4,
				createdByMemberId: ownerMemberId
			}
		])
		.onConflictDoNothing()
		.run();

	tx.insert(recipeIngredients)
		.values([
			{ id: sid('ing', 'pasta-1'), recipeId: pastaId, name: 'Pasta', quantity: 400, unit: 'g', sortOrder: 0 }, // prettier-ignore
			{ id: sid('ing', 'pasta-2'), recipeId: pastaId, name: 'Mushrooms', quantity: 250, unit: 'g', sortOrder: 1 }, // prettier-ignore
			{ id: sid('ing', 'pasta-3'), recipeId: pastaId, name: 'Cream', quantity: 200, unit: 'ml', sortOrder: 2 }, // prettier-ignore
			{ id: sid('ing', 'pasta-4'), recipeId: pastaId, name: 'Butter', quantity: 30, unit: 'g', sortOrder: 3 }, // prettier-ignore
			{ id: sid('ing', 'pasta-5'), recipeId: pastaId, name: 'Parmesan', quantity: 50, unit: 'g', sortOrder: 4 }, // prettier-ignore
			{ id: sid('ing', 'curry-1'), recipeId: curryId, name: 'Red lentils', quantity: 300, unit: 'g', sortOrder: 0 }, // prettier-ignore
			{ id: sid('ing', 'curry-2'), recipeId: curryId, name: 'Coconut milk', quantity: 400, unit: 'ml', sortOrder: 1 }, // prettier-ignore
			{ id: sid('ing', 'curry-3'), recipeId: curryId, name: 'Curry paste', quantity: 2, unit: 'tbsp', sortOrder: 2 }, // prettier-ignore
			{ id: sid('ing', 'curry-4'), recipeId: curryId, name: 'Baby spinach', quantity: 100, unit: 'g', sortOrder: 3 } // prettier-ignore
		])
		.onConflictDoNothing()
		.run();

	// Durations in the step text are what cook mode parses into timer chips
	// (→ DECISIONS #14), so keep at least one per recipe.
	tx.insert(recipeSteps)
		.values([
			{
				id: sid('step', 'pasta-1'),
				recipeId: pastaId,
				text: 'Boil the pasta until al dente, about 9 min, reserving a cup of the water.',
				sortOrder: 0
			},
			{
				id: sid('step', 'pasta-2'),
				recipeId: pastaId,
				text: 'Sauté the mushrooms in butter until golden, 8 minutes, season well.',
				sortOrder: 1
			},
			{
				id: sid('step', 'pasta-3'),
				recipeId: pastaId,
				text: 'Add the cream, simmer for 3 min, then toss with the pasta and parmesan.',
				sortOrder: 2
			},
			{
				id: sid('step', 'curry-1'),
				recipeId: curryId,
				text: 'Fry the curry paste for 2 min until fragrant.',
				sortOrder: 0
			},
			{
				id: sid('step', 'curry-2'),
				recipeId: curryId,
				text: 'Add the lentils and coconut milk, simmer 20 minutes until soft.',
				sortOrder: 1
			},
			{
				id: sid('step', 'curry-3'),
				recipeId: curryId,
				text: 'Stir the baby spinach through and season to taste.',
				sortOrder: 2
			}
		])
		.onConflictDoNothing()
		.run();

	// Keyed by date, not by "today": re-running next week plans that week's
	// dinners instead of skipping every insert and leaving the plan in the past.
	// (`UNIQUE(householdId, date)` keeps a day you planned yourself untouched.)
	tx.insert(meals)
		.values([
			{
				id: sid('meal', today),
				householdId,
				date: today,
				recipeId: pastaId,
				cookMemberId: housemateMemberId,
				createdByMemberId: housemateMemberId
			},
			{
				id: sid('meal', addDays(today, 1)),
				householdId,
				date: addDays(today, 1),
				recipeId: curryId,
				cookMemberId: ownerMemberId,
				createdByMemberId: ownerMemberId
			},
			{
				id: sid('meal', addDays(today, 2)),
				householdId,
				date: addDays(today, 2),
				title: 'Leftovers night',
				createdByMemberId: ownerMemberId
			}
		])
		.onConflictDoNothing()
		.run();

	/* ── Tasks ───────────────────────────────────────────────────────────────
	 * One per state the Tasks screen renders: overdue, due today, upcoming,
	 * undated one-off (→ SPEC §5.1). Points are the canonical presets
	 * 5/10/20/40 (→ DECISIONS #2).
	 */

	tx.insert(tasks)
		.values([
			{
				id: sid('task', 'bedsheets'),
				householdId,
				name: 'Change the bedsheets',
				points: 10,
				recurUnit: 'month',
				recurInterval: 1,
				dueDate: addDays(today, -3),
				assigneeMemberId: housemateMemberId,
				rotate: true,
				// Both nudges already went out for this occurrence (→ SPEC §5.6).
				dueReminderSentAt: daysAgo(3, 8),
				overdueReminderSentAt: daysAgo(2, 8),
				createdByMemberId: ownerMemberId
			},
			{
				id: sid('task', 'plants'),
				householdId,
				name: 'Water the plants',
				points: 10,
				recurUnit: 'week',
				recurInterval: 1,
				dueDate: today,
				assigneeMemberId: ownerMemberId,
				createdByMemberId: ownerMemberId
			},
			{
				id: sid('task', 'towels'),
				householdId,
				name: 'Wash the towels',
				points: 20,
				recurUnit: 'week',
				recurInterval: 2,
				dueDate: addDays(today, 2),
				assigneeMemberId: housemateMemberId,
				createdByMemberId: housemateMemberId
			},
			{
				id: sid('task', 'bins'),
				householdId,
				name: 'Take out the bins',
				points: 5,
				recurUnit: 'week',
				recurInterval: 1,
				dueDate: addDays(today, 1),
				// NULL assignee = "Anyone".
				rotate: false,
				createdByMemberId: ownerMemberId
			},
			{
				id: sid('task', 'recycling'),
				householdId,
				name: 'Take out the recycling',
				points: 5,
				recurUnit: 'none',
				dueDate: addDays(today, 4),
				assigneeMemberId: ownerMemberId,
				createdByMemberId: ownerMemberId
			},
			{
				id: sid('task', 'lightbulb'),
				householdId,
				name: 'Replace the hallway bulb',
				points: 5,
				recurUnit: 'none',
				// Undated one-off — renders last, under the dated sections.
				createdByMemberId: housemateMemberId
			}
		])
		.onConflictDoNothing()
		.run();

	/* ── History & points ────────────────────────────────────────────────────
	 * Names and points are snapshots: they survive task/member deletion
	 * (→ docs/DATA-MODEL.md). Spread over recent days so the history feed has
	 * day groups and the leaderboard has a gap to show.
	 */

	tx.insert(taskCompletions)
		.values([
			{ id: sid('done', '1'), householdId, taskId: sid('task', 'bins'), taskName: 'Take out the bins', points: 5, memberId: ownerMemberId, memberName: ownerName, completedAt: daysAgo(0, 7) }, // prettier-ignore
			{ id: sid('done', '2'), householdId, taskId: sid('task', 'plants'), taskName: 'Water the plants', points: 10, memberId: housemateMemberId, memberName: housemateName, completedAt: daysAgo(0, 10) }, // prettier-ignore
			{ id: sid('done', '3'), householdId, taskId: sid('task', 'towels'), taskName: 'Wash the towels', points: 20, memberId: ownerMemberId, memberName: ownerName, completedAt: daysAgo(1, 18) }, // prettier-ignore
			{ id: sid('done', '4'), householdId, taskId: null, taskName: 'Clean the bathroom', points: 20, memberId: housemateMemberId, memberName: housemateName, completedAt: daysAgo(2, 11) }, // prettier-ignore
			{ id: sid('done', '5'), householdId, taskId: sid('task', 'bins'), taskName: 'Take out the bins', points: 5, memberId: ownerMemberId, memberName: ownerName, completedAt: daysAgo(4, 8) }, // prettier-ignore
			{ id: sid('done', '6'), householdId, taskId: null, taskName: 'Vacuum living room', points: 10, memberId: ownerMemberId, memberName: ownerName, completedAt: daysAgo(5, 16) }, // prettier-ignore
			{ id: sid('done', '7'), householdId, taskId: sid('task', 'bedsheets'), taskName: 'Change the bedsheets', points: 10, memberId: ownerMemberId, memberName: ownerName, completedAt: daysAgo(6, 12) }, // prettier-ignore
			{ id: sid('skip', '1'), householdId, taskId: sid('task', 'towels'), taskName: 'Wash the towels', points: 0, action: 'skipped', memberId: housemateMemberId, memberName: housemateName, completedAt: daysAgo(7, 9) } // prettier-ignore
		])
		.onConflictDoNothing()
		.run();

	return {
		householdName: household?.name ?? 'your household',
		members:
			housemate.id === ownerMemberId
				? `${ownerName} (owner)`
				: `${ownerName} (owner) + ${housemateName}`
	};
});

console.log(`Seeded ${databasePath} for ${email}`);
console.log(`  household  ${seeded.householdName} — ${seeded.members}`);
console.log('  shopping   3 stores · 10 items (2 already checked off)');
console.log('  cooking    2 recipes · meals planned for today, tomorrow and the day after');
console.log('  tasks      6 tasks (overdue · today · upcoming · undated) · 8 history entries');
console.log(`  → ${rowsWritten() - before} rows written; anything already there was left alone.`);

sqlite.close();
