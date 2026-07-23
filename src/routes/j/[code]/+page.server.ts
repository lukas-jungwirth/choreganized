import { redirect } from '@sveltejs/kit';
import { getInvitePreview } from '$lib/server/services/household';
import { INVITE_CODE_COOKIE } from '$lib/utils/invite-code';
import type { Actions, PageServerLoad } from './$types';

/** An invite link is only useful until it's used; an hour covers the sign-in. */
const COOKIE_MAX_AGE = 60 * 60;

/**
 * Public invite landing [5e]. Anyone with the link can see who invited them and
 * to which household — that's the whole point of the link — but joining still
 * needs a Google sign-in.
 */
export const load: PageServerLoad = ({ params, locals }) => {
	// Already in a household: the invite is moot (one household per user, v1).
	if (locals.member) redirect(303, '/home');

	const preview = getInvitePreview(params.code);

	// Signed in and free to join — skip the landing, go straight to the form.
	if (preview && locals.user) redirect(303, `/onboarding/join?code=${preview.code}`);

	return { preview };
};

export const actions: Actions = {
	/** Park the code so it survives the Google round-trip, then sign in. */
	default: async ({ params, cookies }) => {
		const preview = getInvitePreview(params.code);
		if (preview) {
			cookies.set(INVITE_CODE_COOKIE, preview.code, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: COOKIE_MAX_AGE
			});
		}
		redirect(303, '/login');
	}
};
