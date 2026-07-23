/**
 * Household lifecycle: create, join, invite codes, and — from plan 10 — the
 * membership itself: profiles, notification preferences, roles, removal and
 * leaving.
 *
 * `createHousehold`/`joinHousehold` are the two service functions that can't
 * take `householdId` first — they're what turns a bare user into a member
 * (→ docs/ARCHITECTURE.md "Server patterns"). Everything downstream follows the
 * convention.
 *
 * **Role checks live here, not in the actions.** "Only the owner can rename,
 * revoke, transfer or remove" (→ DECISIONS #10) is a rule about the data, so it
 * is enforced next to the write — an action that forgot to ask cannot make the
 * write happen anyway.
 */
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { isMemberColor } from '$lib/member-colors';
import { toCalendarDate, type CalendarDate } from '$lib/utils/dates';
import {
	generateInviteCode,
	INVITE_CODE_LENGTH,
	normalizeInviteCode
} from '$lib/utils/invite-code';
import { db } from '../db';
import { households, members, stores, tasks, type Household, type Member } from '../db/schema';
import type { NotificationPref } from '../push';

/** Walking order for a first shopping list; renameable/reorderable later (7g). */
const DEFAULT_STORES = ['Grocery', 'Drugstore', 'Hardware store'];

export type HouseholdErrorCode =
	/** No household has this code (never existed, or it was revoked). */
	| 'invalid-code'
	/** v1 allows one household per user (→ DECISIONS #7). */
	| 'already-member'
	/** Another member already uses that avatar colour. */
	| 'color-taken'
	/** Renaming, revoking, transferring and removing are the owner's (→ #10). */
	| 'not-owner'
	/** The member id doesn't belong to this household — or to anyone. */
	| 'not-member'
	/** The owner can't leave while there's someone to hand the house to (→ #11). */
	| 'transfer-first'
	/** "Remove" is for housemates; leaving is its own door, with its own confirm. */
	| 'remove-self'
	/** Leaving would delete the household, which is not what the screen asked. */
	| 'stale-roster';

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

/**
 * A member row, scoped to the household — the id came off a form, so it is a
 * claim until this says otherwise.
 */
function memberIn(tx: Transaction, householdId: string, memberId: string): Member {
	const member = tx
		.select()
		.from(members)
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.get();

	if (!member) throw new HouseholdError('not-member');
	return member;
}

/** The actor, having proved they own the place (→ DECISIONS #10). */
function requireOwner(tx: Transaction, householdId: string, actorMemberId: string): Member {
	const actor = memberIn(tx, householdId, actorMemberId);
	if (actor.role !== 'owner') throw new HouseholdError('not-owner');
	return actor;
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
		// `id` mirrors the rotation's tiebreak (services/tasks.ts) so the crown and
		// the rotation agree on seniority when two members share a joinedAt (→ #75).
		.orderBy(asc(members.joinedAt), asc(members.id))
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

/**
 * A fresh code, replacing whatever was there. Owner-only, like revoking: any
 * member may pass the current code around, but only the owner decides which
 * code is live (→ DECISIONS #10).
 */
export function regenerateInviteCode(householdId: string, actorMemberId: string): string {
	return db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);

		const code = unusedInviteCode(tx);
		tx.update(households).set({ inviteCode: code }).where(eq(households.id, householdId)).run();
		return code;
	});
}

export function revokeInviteCode(householdId: string, actorMemberId: string): void {
	db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);
		tx.update(households).set({ inviteCode: null }).where(eq(households.id, householdId)).run();
	});
}

/* ── Settings & members [6a] [6b] [6c] [6d] ───────────────────────────────── */

/**
 * The roster the members screen reads: `listMembers` plus the two things only
 * this screen shows — when they moved in [6b] and, for the current user, which
 * row is theirs. `joinedAt` is an instant, so it becomes a calendar date on the
 * household's clock, not the server's.
 */
export type MemberProfile = HouseholdMember & { joined: CalendarDate };

export function listMemberProfiles(householdId: string, timezone: string): MemberProfile[] {
	return db
		.select({
			id: members.id,
			displayName: members.displayName,
			color: members.color,
			role: members.role,
			awayUntil: members.awayUntil,
			joinedAt: members.joinedAt
		})
		.from(members)
		.where(eq(members.householdId, householdId))
		.orderBy(asc(members.joinedAt), asc(members.id))
		.all()
		.map(({ joinedAt, ...member }) => ({ ...member, joined: toCalendarDate(joinedAt, timezone) }));
}

export type ProfileInput = { displayName: string; color: string };

/**
 * Name and colour [6a] — always your own membership, never someone else's, so
 * there is no role check to make: the caller passes the id `requireMember` gave
 * it. Colours are the household's scarce resource, so a clash is rejected the
 * same way onboarding rejects it (SPEC §1.5).
 */
export function updateProfile(householdId: string, memberId: string, input: ProfileInput): Member {
	const displayName = input.displayName.trim();

	return db.transaction((tx) => {
		const member = memberIn(tx, householdId, memberId);
		const color = isMemberColor(input.color) ? input.color : member.color;

		const taken = tx
			.select({ color: members.color })
			.from(members)
			.where(and(eq(members.householdId, householdId), ne(members.id, memberId)))
			.all()
			.map((row) => row.color);

		if (taken.includes(color)) throw new HouseholdError('color-taken');

		return tx
			.update(members)
			.set({ displayName, color })
			.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
			.returning()
			.get();
	});
}

/**
 * One notification preference [6a]. The column names are `push.ts`'s own
 * `NotificationPref`, so a toggle here and the `pref` a send filters on can
 * never drift apart (→ ARCHITECTURE.md "Notifications").
 */
export function setNotificationPref(
	householdId: string,
	memberId: string,
	pref: NotificationPref,
	enabled: boolean
): boolean {
	const result = db
		.update(members)
		.set({ [pref]: enabled })
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.run();

	return result.changes > 0;
}

export function renameHousehold(householdId: string, actorMemberId: string, name: string): void {
	db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);
		tx.update(households).set({ name: name.trim() }).where(eq(households.id, householdId)).run();
	});
}

/**
 * "Make owner" [6c] hands the role over rather than adding a second owner
 * (→ DECISIONS #11): exactly one row in the household is the owner before and
 * after, which is what every `role === 'owner'` check in the app assumes.
 */
export function transferOwnership(
	householdId: string,
	actorMemberId: string,
	targetMemberId: string
): void {
	db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);
		const target = memberIn(tx, householdId, targetMemberId);
		if (target.id === actorMemberId) return;

		tx.update(members)
			.set({ role: 'member' })
			.where(and(eq(members.id, actorMemberId), eq(members.householdId, householdId)))
			.run();
		tx.update(members)
			.set({ role: 'owner' })
			.where(and(eq(members.id, target.id), eq(members.householdId, householdId)))
			.run();
	});
}

/**
 * The half of leaving that is the same whether you went or were shown the door
 * (→ DECISIONS #12): the membership row goes, their tasks become **Anyone**,
 * and their completions keep the name snapshot — the points stay with the
 * house.
 *
 * Assignment is cleared here rather than left to the FK's `ON DELETE SET NULL`
 * because `rotate` has to go with it: "alternate each time" has nobody to
 * alternate from once a task is anyone's, which is the same call `reassignTask`
 * makes when it hands one to Anyone.
 */
function departMember(tx: Transaction, householdId: string, memberId: string): void {
	tx.update(tasks)
		.set({ assigneeMemberId: null, rotate: false, updatedAt: new Date() })
		.where(and(eq(tasks.householdId, householdId), eq(tasks.assigneeMemberId, memberId)))
		.run();

	tx.delete(members)
		.where(and(eq(members.id, memberId), eq(members.householdId, householdId)))
		.run();
}

function otherMemberCount(tx: Transaction, householdId: string, memberId: string): number {
	return (
		tx
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(members)
			.where(and(eq(members.householdId, householdId), ne(members.id, memberId)))
			.get()?.count ?? 0
	);
}

/** Owner-only [6c]. Their next request finds no membership and lands in onboarding. */
export function removeMember(
	householdId: string,
	actorMemberId: string,
	targetMemberId: string
): void {
	db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);
		if (targetMemberId === actorMemberId) throw new HouseholdError('remove-self');

		memberIn(tx, householdId, targetMemberId);
		departMember(tx, householdId, targetMemberId);
	});
}

/**
 * Leaving on your own [6d] (→ SPEC §7). Three outcomes, and the order of the
 * checks is the point:
 *
 * 1. **Last member** — there is nobody to hand the house to and nothing left to
 *    belong to it, so the household goes with them (cascading to every list,
 *    recipe and task). The owner is not asked to transfer first: there is
 *    nobody to transfer to.
 * 2. **Owner with housemates** — refused. Somebody has to be able to manage
 *    members, and "Make owner" is one sheet away.
 * 3. **Anyone else** — they depart like a removed member does.
 *
 * `expectDelete` is what the confirm [6d] promised: the loaded roster decides
 * which of two very different sentences it showed, and a page that has been
 * open while the last housemate left would have shown the mild one ("your
 * points stay with the household") for what is now a household deletion. So the
 * destructive branch is only taken when the screen actually said so; the other
 * direction needs no guard, because over-warning and then merely leaving costs
 * nobody anything.
 */
export function leaveHousehold(
	householdId: string,
	memberId: string,
	expectDelete = false
): { householdDeleted: boolean } {
	return db.transaction((tx) => {
		const member = memberIn(tx, householdId, memberId);

		if (otherMemberCount(tx, householdId, memberId) === 0) {
			if (!expectDelete) throw new HouseholdError('stale-roster');

			tx.delete(households).where(eq(households.id, householdId)).run();
			return { householdDeleted: true };
		}

		if (member.role === 'owner') throw new HouseholdError('transfer-first');

		departMember(tx, householdId, memberId);
		return { householdDeleted: false };
	});
}
