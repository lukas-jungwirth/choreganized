/**
 * The integration fixture (→ docs/TESTING.md "Integration").
 *
 * `$lib/server/db` opens whatever `DATABASE_PATH` names; under Vitest that is
 * `:memory:` (→ `.env.test`), and Vitest gives every test *file* its own module
 * graph — so every file gets its own empty database, migrated from zero by the
 * first call to `migrateOnce()`. Tests inside one file share it, which is why
 * every fixture below creates a *fresh* household: the multi-tenancy boundary
 * ("household A never sees B") is then exercised by every test that runs after
 * another, not only by the ones that mean to.
 *
 * Households are created through the real service, never by hand-written
 * inserts — a fixture that bypasses `createHousehold` would pass on a database
 * the app could never have produced.
 */
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db, runMigrations, tables } from '$lib/server/db';
import { MEMBER_COLORS } from '$lib/member-colors';
import { createHousehold, getHousehold, joinHousehold } from '$lib/server/services/household';
import type { Member } from '$lib/server/db/schema';

let migrated = false;

/** Apply every migration to this file's in-memory database (idempotent). */
export function migrateOnce(): void {
	if (migrated) return;
	// The belt to vite.config.ts's braces: whatever the shell exported, a test
	// that reaches a file on disk stops here rather than migrating it.
	if (env.DATABASE_PATH !== ':memory:') {
		throw new Error(
			`tests must run against :memory:, not DATABASE_PATH=${env.DATABASE_PATH} (→ vite.config.ts TEST_ENV)`
		);
	}
	runMigrations();
	migrated = true;
}

/** A signed-up user with no household — what `/onboarding` starts from. */
export function insertUser(name = 'Test User'): string {
	migrateOnce();
	const id = crypto.randomUUID();
	db.insert(tables.user)
		.values({ id, name, email: `${id}@example.test` })
		.run();
	return id;
}

export type Fixture = {
	householdId: string;
	timezone: string;
	/** The member who created the household. */
	owner: Member;
	/** Every member in join order, the owner first. */
	members: Member[];
	inviteCode: string;
};

export type FixtureOptions = {
	name?: string;
	timezone?: string;
	/** Display names of the housemates who join after the owner. */
	housemates?: string[];
	storeNames?: string[];
};

/**
 * A household the way onboarding makes one: the owner via `createHousehold`,
 * each housemate via `joinHousehold` with the household's own invite code.
 */
export function makeHousehold(options: FixtureOptions = {}): Fixture {
	migrateOnce();
	const timezone = options.timezone ?? 'Europe/Vienna';

	const owner = createHousehold(insertUser('Owner'), {
		householdName: options.name ?? 'Test household',
		displayName: 'Owner',
		color: MEMBER_COLORS[0].value,
		timezone,
		storeNames: options.storeNames ?? ['Grocery', 'Drugstore', 'Hardware store']
	});

	const inviteCode = readInviteCode(owner.householdId);

	// Real housemates join minutes or days apart; in a test they would all land in
	// the same millisecond and the roster's `joinedAt` order would fall through to
	// its id tiebreak — a random UUID, i.e. a coin flip. So each join is stamped a
	// minute after the last, and "join order" means what the tests say it means.
	const housemates = (options.housemates ?? []).map((displayName, index) => {
		const member = joinHousehold(insertUser(displayName), inviteCode, {
			displayName,
			// The owner has [0]; a household never has more members than colours.
			color: MEMBER_COLORS[index + 1].value
		});
		const joinedAt = new Date(owner.joinedAt.getTime() + (index + 1) * 60_000);
		db.update(tables.members).set({ joinedAt }).where(eq(tables.members.id, member.id)).run();
		return { ...member, joinedAt };
	});

	return {
		householdId: owner.householdId,
		timezone,
		owner,
		members: [owner, ...housemates],
		inviteCode
	};
}

export function readInviteCode(householdId: string): string {
	const code = getHousehold(householdId)?.inviteCode;
	if (!code) throw new Error(`household ${householdId} has no invite code`);
	return code;
}

/** A member row as the database holds it now. */
export function memberRow(memberId: string): Member {
	const row = db.select().from(tables.members).where(eq(tables.members.id, memberId)).get();
	if (!row) throw new Error(`no member ${memberId}`);
	return row;
}

/** Raw access for assertions that want to look at the rows themselves. */
export { db, tables };
