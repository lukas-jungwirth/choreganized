import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { todayIn } from '$lib/utils/dates';
import type { PageServerLoad } from './$types';

/**
 * The kit gallery is a build tool, not a screen: it exists so a component can be
 * checked against design/Hearth.dc.html before the plan that first uses it
 * lands. Never reachable in production.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');

	// DateField's caption needs a "today" to read dates against. Resolved here
	// and sent down, rather than read from `Intl` in the component — there it
	// would resolve the server's zone while rendering and the browser's on
	// hydration, a mismatch on the one page whose whole job is looking right.
	return { today: todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone) };
};
