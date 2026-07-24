/**
 * The membership gate. Everything below `(app)` runs inside a household, so the
 * guard, the roster and the tab-bar badge are loaded once here rather than in
 * every page (→ docs/ARCHITECTURE.md "Server patterns").
 *
 * `today` and the overdue rows are returned as well as used: Home needs exactly
 * these, and taking them from here is what keeps the tab badge and the overdue
 * banner agreeing across household-local midnight.
 */
import { error } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { getHousehold, listMembers } from '$lib/server/services/household';
import { listOverdueForMember } from '$lib/server/services/tasks';
import { todayIn } from '$lib/utils/dates';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	const { member, householdId } = requireMember(event);

	// The FK cascades, so a membership without its household can't survive a
	// delete. Sending them to /onboarding would be a redirect loop — that route
	// bounces members straight back here — so say so plainly instead.
	const household = getHousehold(householdId);
	if (!household) error(500, catalog(event.locals.locale).errors.householdMissing);

	const today = todayIn(household.timezone);

	return {
		household: { name: household.name, timezone: household.timezone },
		/** In join order — the order avatars stack in. */
		members: listMembers(householdId),
		currentMember: {
			id: member.id,
			displayName: member.displayName,
			color: member.color,
			role: member.role,
			awayUntil: member.awayUntil
		},
		today,
		/** Drives the Tasks tab badge [4e]; Home reads the same rows for its banner. */
		overdue: listOverdueForMember(householdId, member, today)
	};
};
