/**
 * The line under the Tasks title — what is overdue and due today — for the list
 * and both History screens, which share that header (→ SPEC §5.1, DECISIONS #212).
 * A layout rather than three loads, so it is asked once; form actions re-run it
 * with everything else, so ticking a task off updates the line too.
 */
import { requireMember } from '$lib/server/guards';
import { countDue } from '$lib/server/services/tasks';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const { householdId } = requireMember(event);
	const { household, today } = await event.parent();

	return {
		due: countDue(householdId, { today, timezone: household.timezone, locale: event.locals.locale })
	};
};
