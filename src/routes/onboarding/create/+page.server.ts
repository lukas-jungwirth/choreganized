import { fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { isMemberColor } from '$lib/member-colors';
import { requireUser } from '$lib/server/guards';
import { createHousehold, HouseholdError } from '$lib/server/services/household';
import { DISPLAY_NAME_MAX, HOUSEHOLD_NAME_MAX } from '$lib/utils/household';
import { INVITE_CODE_COOKIE } from '$lib/utils/invite-code';
import type { Actions, PageServerLoad } from './$types';

/** The browser's IANA zone, or the default when it's missing/nonsense. */
function resolveTimezone(input: string): string {
	try {
		new Intl.DateTimeFormat('en', { timeZone: input });
		return input;
	} catch {
		return 'Europe/Vienna';
	}
}

export const load: PageServerLoad = ({ locals }) => {
	if (locals.member) redirect(303, '/home');
};

export const actions: Actions = {
	default: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();

		const householdName = String(form.get('householdName') ?? '').trim();
		const displayName = String(form.get('displayName') ?? '').trim();
		const color = String(form.get('color') ?? '');
		const values = { householdName, displayName, color };

		const m = catalog(event.locals.locale);
		const errors: { householdName?: string; displayName?: string; color?: string } = {};
		if (!householdName) errors.householdName = m.errors.householdName;
		else if (householdName.length > HOUSEHOLD_NAME_MAX)
			errors.householdName = m.errors.keepUnder(HOUSEHOLD_NAME_MAX);
		if (!displayName) errors.displayName = m.errors.displayName;
		else if (displayName.length > DISPLAY_NAME_MAX)
			errors.displayName = m.errors.keepUnder(DISPLAY_NAME_MAX);
		if (!isMemberColor(color)) errors.color = m.errors.pickColour;

		if (Object.keys(errors).length > 0) return fail(400, { errors, values });

		try {
			const stores = m.shopping.stores.defaults;

			createHousehold(user.id, {
				householdName,
				displayName,
				color,
				timezone: resolveTimezone(String(form.get('timezone') ?? '')),
				// The first three rows of the household's own content, written in the
				// language the person creating it is reading — theirs to rename [7g].
				storeNames: [stores.grocery, stores.drugstore, stores.hardware]
			});
		} catch (error) {
			// Double submit: the household from the first one already exists.
			if (error instanceof HouseholdError && error.code === 'already-member') {
				redirect(303, '/onboarding/invite');
			}
			throw error;
		}

		// They started from an invite link but made their own home instead.
		event.cookies.delete(INVITE_CODE_COOKIE, { path: '/' });
		redirect(303, '/onboarding/invite');
	}
};
