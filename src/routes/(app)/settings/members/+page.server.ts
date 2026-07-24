/**
 * Members [6b] (→ SPEC §7). Who lives here, the invite that's currently live,
 * and — for the owner — the two things only they can do to a housemate: hand
 * over the house, or show them the door (→ DECISIONS #10, #11, #12).
 *
 * The role checks are in `services/household.ts`, not here: this file decides
 * what to *render*, the service decides what may *happen*.
 */
import { error, fail } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import {
	getHousehold,
	HouseholdError,
	listMemberProfiles,
	regenerateInviteCode,
	removeMember,
	revokeInviteCode,
	transferOwnership
} from '$lib/server/services/household';
import { monthPointsByMember } from '$lib/server/services/tasks';
import { formatInviteCode } from '$lib/utils/invite-code';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId, member } = requireMember(event);
	const { household, today } = await event.parent();

	// The layout hands over name and timezone; the code lives on the row itself.
	const record = getHousehold(householdId);
	if (!record) error(500, catalog(event.locals.locale).errors.householdMissing);

	return {
		roster: listMemberProfiles(householdId, household.timezone),
		/**
		 * Month points by member id — the manage sheet's "· 210 pts" line [6c].
		 * Only the owner can open that sheet, so nobody else pays for the query
		 * (or receives everyone's score on a screen that never shows it).
		 */
		points:
			member.role === 'owner'
				? Object.fromEntries(
						monthPointsByMember(householdId, {
							today,
							timezone: household.timezone,
							locale: event.locals.locale
						})
					)
				: {},
		inviteCode: record.inviteCode,
		formattedCode: record.inviteCode ? formatInviteCode(record.inviteCode) : null
	};
};

/** Every action here is the owner's; the service says so, this maps the refusal. */
function refuse(cause: unknown, m: Messages) {
	if (cause instanceof HouseholdError) {
		switch (cause.code) {
			case 'not-owner':
				return fail(403, { error: m.errors.ownerOnlyMembers });
			case 'not-member':
				return fail(404, { error: m.errors.alreadyLeft });
			case 'remove-self':
				return fail(400, { error: m.errors.household['remove-self'] });
		}
	}
	throw cause;
}

export const actions: Actions = {
	/** Transfers, never duplicates — one owner per household (→ DECISIONS #11). */
	makeOwner: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		try {
			transferOwnership(householdId, member.id, String(form.get('memberId') ?? ''));
		} catch (cause) {
			return refuse(cause, catalog(event.locals.locale));
		}

		return { transferred: true };
	},

	/**
	 * Their membership goes; their completions keep the name snapshot and their
	 * tasks become Anyone (→ DECISIONS #12). The next request they make finds no
	 * membership and lands in onboarding.
	 */
	remove: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		try {
			removeMember(householdId, member.id, String(form.get('memberId') ?? ''));
		} catch (cause) {
			return refuse(cause, catalog(event.locals.locale));
		}

		return { removed: true };
	},

	revokeInvite: async (event) => {
		const { householdId, member } = requireMember(event);

		try {
			revokeInviteCode(householdId, member.id);
		} catch (cause) {
			return refuse(cause, catalog(event.locals.locale));
		}

		return { revoked: true };
	},

	/** A revoked household has no way back in until the owner makes a new code. */
	newInvite: async (event) => {
		const { householdId, member } = requireMember(event);

		try {
			regenerateInviteCode(householdId, member.id);
		} catch (cause) {
			return refuse(cause, catalog(event.locals.locale));
		}

		return { invited: true };
	}
};
