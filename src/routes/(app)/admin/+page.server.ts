/**
 * The admin page (→ plan 34, SPEC §12): how many households use the app, and
 * which. `requireAdmin` is `requireMember` plus a 404 for everyone not in
 * admin mode.
 *
 * The instants become calendar dates here, in the admin's own household's
 * timezone: the screen only ever says "Nov 3", and `m.date.*` takes dates.
 */
import { requireAdmin } from '$lib/server/guards';
import { getAdminStats } from '$lib/server/services/admin';
import { toCalendarDate } from '$lib/utils/dates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const { household } = await event.parent();
	const day = (at: Date) => toCalendarDate(at, household.timezone);

	const stats = getAdminStats();

	return {
		totals: stats.totals,
		active7: stats.active7,
		active30: stats.active30,
		weeks: stats.weeks.map((week) => ({ ...week, start: day(week.start) })),
		households: stats.households.map((row) => ({
			id: row.id,
			name: row.name,
			memberCount: row.memberCount,
			createdAt: day(row.createdAt),
			lastActiveAt: row.lastActiveAt && day(row.lastActiveAt)
		}))
	};
};
