import { redirect } from '@sveltejs/kit';
import { INVITE_CODE_COOKIE } from '$lib/utils/invite-code';
import type { PageServerLoad } from './$types';

/**
 * The entry point every sign-in and every "open the app" lands on:
 * no session → login · session but no household → onboarding · else home.
 */
export const load: PageServerLoad = ({ locals, cookies }) => {
	if (!locals.user) redirect(303, '/login');

	if (!locals.member) {
		// Came in through an invite link before signing in — resume that.
		redirect(303, cookies.get(INVITE_CODE_COOKIE) ? '/onboarding/join' : '/onboarding');
	}

	redirect(303, '/home');
};
