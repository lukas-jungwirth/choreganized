import { redirect } from '@sveltejs/kit';
import { mailEnabled, SIGN_IN_CODE_MINUTES } from '$lib/server/mail';
import { activeSendLimits } from '$lib/server/send-limit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	// Already signed in? `/` decides where they belong (home or onboarding).
	if (locals.user) redirect(303, '/');

	return {
		// Better Auth bounces failed OAuth round-trips back here with `?error=…`.
		signInFailed: url.searchParams.has('error'),
		// A deploy with no mail settings keeps the Google-only screen (plan 31).
		emailSignIn: mailEnabled(),
		codeMinutes: SIGN_IN_CODE_MINUTES,
		// How long "Send again" counts down — the server's own limit per address.
		codeCooldownSeconds: activeSendLimits().cooldownSeconds
	};
};
