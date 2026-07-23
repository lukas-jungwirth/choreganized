import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	// Already signed in? `/` decides where they belong (home or onboarding).
	if (locals.user) redirect(303, '/');

	// Better Auth bounces failed OAuth round-trips back here with `?error=…`.
	return { signInFailed: url.searchParams.has('error') };
};
