/**
 * Household lifecycle: create, join, invite codes.
 *
 * These are the two service functions that can't take `householdId` first —
 * they're what turns a bare user into a member (→ docs/ARCHITECTURE.md
 * "Server patterns"). Everything downstream follows the convention.
 */
import { asc, eq } from 'drizzle-orm';
import {
	generateInviteCode,
	INVITE_CODE_LENGTH,
	normalizeInviteCode
} from '$lib/utils/invite-code';
import { db } from '../db';
import { households, members, stores, type Household, type Member } from '../db/schema';

/** Walking order for a first shopping list; renameable/reorderable later (7g). */
const DEFAULT_STORES = ['Grocery', 'Drugstore', 'Hardware store'];

export type HouseholdErrorCode =
	/** No household has this code (never existed, or it was revoked). */
	| 'invalid-code'
	/** v1 allows one household per user (→ DECISIONS #7). */
	| 'already-member'
	/** Another member already uses that avatar colour. */
	| 'color-taken';

/** Expected, user-facing failures — actions map these to inline messages. */
export class HouseholdError extends Error {
	constructor(readonly code: HouseholdErrorCode) {
		super(code);
		this.name = 'HouseholdError';
	}
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The invite code is globally unique, so retry the (vanishingly rare) clash. */
function unusedInviteCode(tx: Transaction): string {
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = generateInviteCode();
		const clash = tx
			.select({ id: households.id })
			.from(households)
			.where(eq(households.inviteCode, code))
			.get();
		if (!clash) return code;
	}
	throw new Error('Could not generate an unused invite code');
}

function membershipOf(tx: Transaction, userId: string): Member | undefined {
	return tx.select().from(members).where(eq(members.userId, userId)).get();
}

function colorsTakenIn(tx: Transaction, householdId: string): string[] {
	return tx
		.select({ color: members.color })
		.from(members)
		.where(eq(members.householdId, householdId))
		.all()
		.map((row) => row.color);
}

export type CreateHouseholdInput = {
	householdName: string;
	displayName: string;
	color: string;
	/** IANA name from the creator's browser; the household's clock from now on. */
	timezone: string;
};

export function createHousehold(userId: string, input: CreateHouseholdInput): Member {
	return db.transaction((tx) => {
		if (membershipOf(tx, userId)) throw new HouseholdError('already-member');

		const householdId = crypto.randomUUID();

		tx.insert(households)
			.values({
				id: householdId,
				name: input.householdName,
				inviteCode: unusedInviteCode(tx),
				timezone: input.timezone
			})
			.run();

		tx.insert(stores)
			.values(DEFAULT_STORES.map((name, sortOrder) => ({ householdId, name, sortOrder })))
			.run();

		return tx
			.insert(members)
			.values({
				householdId,
				userId,
				displayName: input.displayName,
				color: input.color,
				role: 'owner'
			})
			.returning()
			.get();
	});
}

export function joinHousehold(
	userId: string,
	code: string,
	profile: { displayName: string; color: string }
): Member {
	const inviteCode = normalizeInviteCode(code);

	return db.transaction((tx) => {
		const household =
			inviteCode.length === INVITE_CODE_LENGTH
				? tx.select().from(households).where(eq(households.inviteCode, inviteCode)).get()
				: undefined;

		if (!household) throw new HouseholdError('invalid-code');
		if (membershipOf(tx, userId)) throw new HouseholdError('already-member');
		if (colorsTakenIn(tx, household.id).includes(profile.color)) {
			throw new HouseholdError('color-taken');
		}

		return tx
			.insert(members)
			.values({
				householdId: household.id,
				userId,
				displayName: profile.displayName,
				color: profile.color,
				role: 'member'
			})
			.returning()
			.get();
	});
}

export function getHousehold(householdId: string): Household | undefined {
	return db.select().from(households).where(eq(households.id, householdId)).get();
}

/**
 * The household roster, in join order — the order avatars stack in, and the
 * rotation order for "alternate each time" tasks (→ docs/DATA-MODEL.md).
 * Deliberately narrower than a `Member` row: this goes to the browser, and a
 * housemate's `userId` or notification preferences have no business there.
 */
export type HouseholdMember = {
	id: string;
	displayName: string;
	color: string;
	role: 'owner' | 'member';
	/** Holiday pause end date, or null. Drives the paused/dimmed rendering. */
	awayUntil: string | null;
};

export function listMembers(householdId: string): HouseholdMember[] {
	return db
		.select({
			id: members.id,
			displayName: members.displayName,
			color: members.color,
			role: members.role,
			awayUntil: members.awayUntil
		})
		.from(members)
		.where(eq(members.householdId, householdId))
		.orderBy(asc(members.joinedAt))
		.all();
}

/**
 * Every household and the clock it lives by. The one query in the app that
 * isn't household-scoped, and deliberately so: the cron sweeps have no request
 * and no member behind them, they walk all households and act on the ones whose
 * local time says it's due (→ `lib/server/cron.ts`).
 */
export function listHouseholdClocks(): { id: string; timezone: string }[] {
	return db.select({ id: households.id, timezone: households.timezone }).from(households).all();
}

export type InvitePreview = {
	/** Normalized code, safe to put back in a URL. */
	code: string;
	householdName: string;
	/** The owner — "{inviter} invited you to {household}". */
	inviter: { displayName: string; color: string } | null;
	/** Colours the joiner can't pick. */
	takenColors: string[];
};

/** Public: resolves an invite code for the landing page and the join screen. */
export function getInvitePreview(code: string): InvitePreview | null {
	const inviteCode = normalizeInviteCode(code);
	if (inviteCode.length !== INVITE_CODE_LENGTH) return null;

	const household = db.select().from(households).where(eq(households.inviteCode, inviteCode)).get();

	if (!household) return null;

	const householdMembers = db
		.select({ displayName: members.displayName, color: members.color, role: members.role })
		.from(members)
		.where(eq(members.householdId, household.id))
		.all();

	const inviter = householdMembers.find((member) => member.role === 'owner') ?? householdMembers[0];

	return {
		code: inviteCode,
		householdName: household.name,
		inviter: inviter ? { displayName: inviter.displayName, color: inviter.color } : null,
		takenColors: householdMembers.map((member) => member.color)
	};
}

/** Owner-only in the UI (→ DECISIONS #10); used here and by plan 10. */
export function regenerateInviteCode(householdId: string): string {
	return db.transaction((tx) => {
		const code = unusedInviteCode(tx);
		tx.update(households).set({ inviteCode: code }).where(eq(households.id, householdId)).run();
		return code;
	});
}

export function revokeInviteCode(householdId: string): void {
	db.update(households).set({ inviteCode: null }).where(eq(households.id, householdId)).run();
}
