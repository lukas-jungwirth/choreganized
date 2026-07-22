/**
 * Settings [6a] — plan 10's screen, standing up early with the one section plan
 * 05 owns: Notifications. Enabling push is a per-device decision that has to
 * live somewhere permanent, and "somewhere permanent" is Settings.
 *
 * Plan 10 fills in profile, household, away mode and the per-category toggles
 * around this.
 */
import { requireMember } from '$lib/server/guards';
import { pushConfigured, sendTestNotification } from '$lib/server/push';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	requireMember(event);
	return {};
};

export const actions: Actions = {
	/**
	 * The round trip that proves it: server → push service → this device
	 * (→ SPEC §6). The one send in the app that is awaited, because the whole
	 * point is telling you whether it worked.
	 */
	testNotification: async (event) => {
		const { user } = requireMember(event);

		return { sent: await sendTestNotification(user.id), configured: pushConfigured() };
	}
};
