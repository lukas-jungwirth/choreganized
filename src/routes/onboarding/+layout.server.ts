import { requireUser } from '$lib/server/guards';
import type { LayoutServerLoad } from './$types';

/**
 * Onboarding is for signed-in users. Whether a *member* may be here differs per
 * step — the chooser/create/join bounce members to `/home`, while `invite` is
 * the screen you land on right after creating a household — so that check lives
 * in each page's load.
 */
export const load: LayoutServerLoad = (event) => {
	const user = requireUser(event);
	return { firstName: user.name.split(' ')[0] || user.name };
};
