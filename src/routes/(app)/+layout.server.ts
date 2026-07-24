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
import { listActiveTimers } from '$lib/server/services/cook-timers';
import { getHousehold, listMembers } from '$lib/server/services/household';
import { listOverdueForMember } from '$lib/server/services/tasks';
import { todayIn } from '$lib/utils/dates';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	const { user, member, householdId } = requireMember(event);

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
		overdue: listOverdueForMember(householdId, member, today),
		/**
		 * The dock above the tab bar and cook mode's ring are both a rendering of
		 * these [7h]. Read here rather than only in cook mode, because a timer
		 * outlives the screen that started it and this is the one load that runs
		 * on every page (→ DECISIONS #103).
		 *
		 * This load reads no `event.url`, so it re-runs on a document load, on any
		 * form action and on `refetchOnFocus`'s `invalidateAll` — but *not* on
		 * plain client-side navigation. That is exactly why the dock is driven by
		 * the store rather than straight off this data.
		 */
		timers: listActiveTimers(householdId, user.id),
		/**
		 * When that list was read. The store needs it to tell "cancelled on the
		 * other phone" from "this payload is simply older than the row I just
		 * started" — two loads can be in flight at once (→ `cookTimers.sync`).
		 */
		timersFetchedAt: Date.now()
	};
};
