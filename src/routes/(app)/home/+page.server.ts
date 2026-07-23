import { requireMember } from '$lib/server/guards';
import { getHomeSummary } from '$lib/server/services/home';
import type { PageServerLoad } from './$types';

/**
 * Home is a read-only dashboard: one service call, no actions (→ SPEC §2).
 * The timezone, today, the roster and the overdue rows all come from the layout,
 * which has already read them for the shell — so the page adds queries rather
 * than repeating them, and every card is answering the same clock.
 */
export const load: PageServerLoad = async (event) => {
	const { member, householdId } = requireMember(event);
	const { household, today, members, overdue } = await event.parent();

	return getHomeSummary(householdId, {
		member,
		timezone: household.timezone,
		today,
		members,
		overdue
	});
};
