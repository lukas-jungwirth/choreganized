/**
 * Tasks → History [8a] — the stats landing (→ SPEC §5.8): how the recurring plan
 * splits, by design, and the points board over a chosen timeframe. The full
 * completed feed is a level down, behind "All completed chores".
 *
 * The timeframe lives in the URL (`?range=`), so the toggle is a link — it
 * survives a refresh and works with no JavaScript; reading `event.url` is what
 * re-runs this load when it's followed.
 */
import { requireMember } from '$lib/server/guards';
import { choreSplit, pointsByMemberSince } from '$lib/server/services/tasks';
import { addDays, zonedStartOfDay } from '$lib/utils/dates';
import { DEFAULT_POINTS_WINDOW, isPointsWindow, pointsWindowDays } from '$lib/utils/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	// The roster and `today` come from the layout, so the split and the board
	// answer the same question as the tab they sit under.
	const { household, today, members } = await event.parent();

	// A hand-edited `?range=` that isn't a window falls back to the default.
	const param = event.url.searchParams.get('range');
	const range = isPointsWindow(param) ? param : DEFAULT_POINTS_WINDOW;
	const days = pointsWindowDays(range);
	// Inclusive of today, so "30 days" is the last 30 calendar days; "all time" has
	// no lower bound at all.
	const since =
		days === null ? null : zonedStartOfDay(addDays(today, -(days - 1)), household.timezone);

	return {
		split: choreSplit(householdId, members),
		/** Points by member id for the chosen window; the board reads it against the roster. */
		points: Object.fromEntries(pointsByMemberSince(householdId, since)),
		range
	};
};
