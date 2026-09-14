import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { e2eMode } from '$lib/server/e2e-mode';
import type { Actions, PageServerLoad } from './$types';

/**
 * The gallery's clock never moves. Its samples read dates against "today" —
 * DateField's caption, the away control's "until", the chore cards — and with
 * the real date those strings changed overnight, which is how the visual
 * baselines failed on their third day (→ DECISIONS #144). A Thursday, so the
 * holiday sample's "closed on Monday" still reads as a coming day.
 */
const GALLERY_TODAY = '2026-09-11';

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

	// DateField's caption needs a "today" to read dates against. Sent down from
	// here rather than read in the component, so SSR and hydration agree — and
	// fixed, so two screenshots a week apart agree too.
	return { today: GALLERY_TODAY };
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
