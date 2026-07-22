import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { todayIn } from '$lib/utils/dates';
import type { Actions, PageServerLoad } from './$types';

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

export const actions: Actions = {
	/**
	 * `AwayControl` posts to `?/away` wherever it sits — Tasks [4c] and Settings
	 * [6a] both answer it. The gallery has no household to pause, so it answers
	 * with nothing rather than letting the switch throw a 404.
	 */
	away: () => {
		if (!dev) error(404, 'Not found');
		return { away: true };
	},

	notify: () => {
		if (!dev) error(404, 'Not found');
		return { prefSaved: true };
	}
};
