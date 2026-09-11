import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { e2eMode } from '$lib/server/e2e-mode';
import { todayIn } from '$lib/utils/dates';
import type { Actions, PageServerLoad } from './$types';

/**
 * The kit gallery is a build tool, not a screen: it exists so a component can be
 * checked against design/Hearth.dc.html before the plan that first uses it
 * lands. Never reachable in production — the one exception is a build running
 * under `E2E_MODE=true`, where the visual tests screenshot it as the component
 * inventory in both themes (→ docs/TESTING.md "Visual").
 */
function requireGallery(): void {
	if (!dev && !e2eMode()) error(404, 'Not found');
}

export const load: PageServerLoad = () => {
	requireGallery();

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
		requireGallery();
		return { away: true };
	},

	notify: () => {
		requireGallery();
		return { prefSaved: true };
	}
};
