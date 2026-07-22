import { redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { formatInviteCode } from '$lib/utils/invite-code';
import { db } from '$lib/server/db';
import { households, members } from '$lib/server/db/schema';
import { requireMember } from '$lib/server/guards';
import type { PageServerLoad } from './$types';

/**
 * Step 2 of creating a household — so unlike the other onboarding screens this
 * one *requires* a membership. Settings → Members links here too [6b], and says
 * so with `?from=members`: same screen, but you already live here, so it closes
 * with "Done" back to the members list rather than "Move in" (→ DECISIONS #28).
 */
export const load: PageServerLoad = (event) => {
	const { householdId, member } = requireMember(event);
	const fromMembers = event.url.searchParams.get('from') === 'members';

	const household = db.select().from(households).where(eq(households.id, householdId)).get();
	if (!household) redirect(303, '/onboarding');

	const householdMembers = db
		.select({
			id: members.id,
			displayName: members.displayName,
			color: members.color,
			role: members.role
		})
		.from(members)
		.where(eq(members.householdId, householdId))
		.orderBy(asc(members.joinedAt))
		.all();

	return {
		fromMembers,
		householdName: household.name,
		inviteCode: household.inviteCode,
		formattedCode: household.inviteCode ? formatInviteCode(household.inviteCode) : null,
		inviteUrl: household.inviteCode
			? new URL(`/j/${household.inviteCode}`, event.url.origin).toString()
			: null,
		currentMemberId: member.id,
		members: householdMembers
	};
};
