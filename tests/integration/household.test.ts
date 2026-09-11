/**
 * Household lifecycle, through the service the onboarding and Settings actions
 * call (→ services/household.ts, DECISIONS #7, #10, #11, #12).
 *
 * The rules pinned here are the ones a walkthrough can't show in one sitting:
 * one household per user, the owner as the only one who may manage members,
 * and what leaving does to a house of one versus a house of two.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { MEMBER_COLORS } from '$lib/member-colors';
import {
	createHousehold,
	getHousehold,
	getInvitePreview,
	HouseholdError,
	joinHousehold,
	leaveHousehold,
	listMembers,
	regenerateInviteCode,
	removeMember,
	renameHousehold,
	revokeInviteCode,
	transferOwnership
} from '$lib/server/services/household';
import { insertUser, makeHousehold } from '../helpers/db';

function codeOf(error: unknown): string {
	assert.ok(error instanceof HouseholdError, `expected a HouseholdError, got ${String(error)}`);
	return error.code;
}

describe('createHousehold', () => {
	it('makes the creator the owner and writes the first stores in walking order', () => {
		const { owner, householdId } = makeHousehold({ storeNames: ['Billa', 'dm'] });

		assert.equal(owner.role, 'owner');
		assert.equal(getHousehold(householdId)?.name, 'Test household');
		assert.deepEqual(
			listMembers(householdId).map((m) => m.displayName),
			['Owner']
		);
	});

	it('refuses a second household for the same user (v1: one per user)', () => {
		const { owner } = makeHousehold();

		assert.throws(
			() =>
				createHousehold(owner.userId, {
					householdName: 'Second home',
					displayName: 'Me',
					color: MEMBER_COLORS[0].value,
					timezone: 'Europe/Vienna',
					storeNames: []
				}),
			(error) => codeOf(error) === 'already-member'
		);
	});
});

describe('joinHousehold', () => {
	it('adds a housemate as a plain member, in join order', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Elisabeth'] });

		assert.equal(members[1].role, 'member');
		assert.deepEqual(
			listMembers(householdId).map((m) => m.displayName),
			['Owner', 'Elisabeth']
		);
	});

	it('normalises the code the way the join screen does', () => {
		const { inviteCode } = makeHousehold();
		const sloppy = ` ${inviteCode.toLowerCase().slice(0, 3)}-${inviteCode.slice(3)} `;

		const member = joinHousehold(insertUser('Late'), sloppy, {
			displayName: 'Late',
			color: MEMBER_COLORS[1].value
		});
		assert.equal(member.role, 'member');
	});

	it('refuses an unknown code, a taken colour, and a user who already has a home', () => {
		const { inviteCode, owner } = makeHousehold();
		const profile = { displayName: 'X', color: MEMBER_COLORS[1].value };

		assert.throws(
			() => joinHousehold(insertUser(), 'ZZZZZZ', profile),
			(error) => codeOf(error) === 'invalid-code'
		);
		assert.throws(
			() => joinHousehold(insertUser(), inviteCode, { ...profile, color: owner.color }),
			(error) => codeOf(error) === 'color-taken'
		);
		assert.throws(
			() => joinHousehold(owner.userId, inviteCode, profile),
			(error) => codeOf(error) === 'already-member'
		);
	});

	it('a revoked code stops working; a regenerated one is the only one that works', () => {
		const { householdId, owner, inviteCode } = makeHousehold();

		revokeInviteCode(householdId, owner.id);
		assert.equal(getInvitePreview(inviteCode), null);

		const fresh = regenerateInviteCode(householdId, owner.id);
		assert.notEqual(fresh, inviteCode);
		assert.equal(getInvitePreview(fresh)?.householdName, 'Test household');
		assert.equal(getInvitePreview(inviteCode), null);
	});
});

describe('the owner-only writes', () => {
	it('a plain member cannot rename, revoke, transfer or remove', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Elisabeth'] });
		const housemate = members[1];

		for (const attempt of [
			() => renameHousehold(householdId, housemate.id, 'Mine now'),
			() => revokeInviteCode(householdId, housemate.id),
			() => transferOwnership(householdId, housemate.id, housemate.id),
			() => removeMember(householdId, housemate.id, members[0].id)
		]) {
			assert.throws(attempt, (error) => codeOf(error) === 'not-owner');
		}
		assert.equal(getHousehold(householdId)?.name, 'Test household');
	});

	it('an owner of another household is nobody here', () => {
		const a = makeHousehold({ name: 'A' });
		const b = makeHousehold({ name: 'B' });

		assert.throws(
			() => renameHousehold(a.householdId, b.owner.id, 'Taken over'),
			(error) => codeOf(error) === 'not-member'
		);
		assert.throws(
			() => removeMember(a.householdId, a.owner.id, b.owner.id),
			(error) => codeOf(error) === 'not-member'
		);
		assert.equal(getHousehold(a.householdId)?.name, 'A');
		assert.equal(listMembers(b.householdId).length, 1);
	});

	it('transferring leaves exactly one owner', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Elisabeth'] });

		transferOwnership(householdId, members[0].id, members[1].id);

		const roles = listMembers(householdId).map((m) => [m.displayName, m.role]);
		assert.deepEqual(roles, [
			['Owner', 'member'],
			['Elisabeth', 'owner']
		]);
	});

	it('removing a housemate is not the same door as leaving', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Elisabeth'] });

		assert.throws(
			() => removeMember(householdId, members[0].id, members[0].id),
			(error) => codeOf(error) === 'remove-self'
		);
		removeMember(householdId, members[0].id, members[1].id);
		assert.deepEqual(
			listMembers(householdId).map((m) => m.displayName),
			['Owner']
		);
	});
});

describe('leaveHousehold', () => {
	it('the owner cannot leave while there is someone to hand the house to', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Elisabeth'] });

		assert.throws(
			() => leaveHousehold(householdId, members[0].id),
			(error) => codeOf(error) === 'transfer-first'
		);
	});

	it('a housemate leaves and the household stays', () => {
		const { householdId, members } = makeHousehold({ housemates: ['Elisabeth'] });

		assert.deepEqual(leaveHousehold(householdId, members[1].id), { householdDeleted: false });
		assert.equal(listMembers(householdId).length, 1);
	});

	it('the last member takes the household with them — but only when the screen said so', () => {
		const { householdId, owner } = makeHousehold();

		assert.throws(
			() => leaveHousehold(householdId, owner.id),
			(error) => codeOf(error) === 'stale-roster'
		);
		assert.deepEqual(leaveHousehold(householdId, owner.id, true), { householdDeleted: true });
		assert.equal(getHousehold(householdId), undefined);
	});
});
