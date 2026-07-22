import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.member) redirect(303, '/home');
};

export const actions: Actions = {
	/** The chooser is a form so it works before JavaScript loads. */
	default: async ({ request }) => {
		const choice = (await request.formData()).get('choice');
		redirect(303, choice === 'join' ? '/onboarding/join' : '/onboarding/create');
	}
};
