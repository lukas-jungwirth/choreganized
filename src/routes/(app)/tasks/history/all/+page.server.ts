/**
 * Tasks → History → all completed chores [8a] (→ SPEC §5.8) — the full feed, one
 * level below the History stats. Read-only: the window comes off the URL, so
 * "load more" is a link rather than a fetch, and reading `event.url` is what
 * re-runs this load when the link is followed.
 */
import { requireMember } from '$lib/server/guards';
import { getCompletedFeed } from '$lib/server/services/history';
import type { TaskContext } from '$lib/server/services/tasks';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	// The clock and `today` come from the layout, so the feed's day labels answer
	// the same question as the rest of the Tasks screen.
	const { household, today } = await event.parent();
	const context: TaskContext = { today, timezone: household.timezone, locale: event.locals.locale };

	return {
		feed: getCompletedFeed(householdId, context, event.url.searchParams.get('from'))
	};
};
