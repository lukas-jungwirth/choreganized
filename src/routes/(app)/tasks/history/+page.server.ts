/**
 * Tasks → History [8a]. Read-only: the month's podium and the completed feed,
 * two service calls and no actions (→ SPEC §5.8).
 *
 * The feed's window comes off the URL, so "load more" is a link rather than a
 * fetch — reading `event.url` is what makes SvelteKit re-run this load when the
 * link is followed.
 */
import { requireMember } from '$lib/server/guards';
import { getCompletedFeed, getPodium } from '$lib/server/services/history';
import { countTasks, type TaskContext } from '$lib/server/services/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	// The clock, `today` and the roster all come from the layout, so the podium
	// and the feed's day labels are answering the same question as the tab it
	// sits under.
	const { household, today, members } = await event.parent();
	const context: TaskContext = { today, timezone: household.timezone, locale: event.locals.locale };

	return {
		podium: getPodium(householdId, context, members),
		feed: getCompletedFeed(householdId, context, event.url.searchParams.get('from')),
		/** The segmented control's "To do · {n}" — the other half of this screen. */
		todoCount: countTasks(householdId)
	};
};
