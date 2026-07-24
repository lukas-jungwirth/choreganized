import { fail, redirect } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { isMemberColor } from '$lib/member-colors';
import { requireUser } from '$lib/server/guards';
import { getInvitePreview, HouseholdError, joinHousehold } from '$lib/server/services/household';
import { DISPLAY_NAME_MAX } from '$lib/utils/household';
import { INVITE_CODE_COOKIE, normalizeInviteCode } from '$lib/utils/invite-code';
import type { Actions, PageServerLoad } from './$types';

/**
 * One route, two steps: enter the code, then set up your profile. The resolved
 * code lives in the URL so a refresh (or a back-navigation) keeps its place.
 */
export const load: PageServerLoad = ({ locals, url, cookies }) => {
	if (locals.member) redirect(303, '/home');

	const requested = url.searchParams.get('code') ?? cookies.get(INVITE_CODE_COOKIE) ?? '';
	if (!requested) return { preview: null, code: '', error: null };

	const preview = getInvitePreview(requested);
	return {
		preview,
		code: normalizeInviteCode(requested),
		error: preview ? null : catalog(locals.locale).onboarding.join.badCode
	};
};

export const actions: Actions = {
	/** Step 1 → step 2: resolve the code, then show the household it belongs to. */
	verify: async (event) => {
		const { request } = event;
		const form = await request.formData();
		const code = normalizeInviteCode(String(form.get('code') ?? ''));
		const preview = getInvitePreview(code);

		if (!preview) {
			return fail(400, { error: catalog(event.locals.locale).onboarding.join.badCode, code });
		}
		redirect(303, `/onboarding/join?code=${preview.code}`);
	},

	/** Step 2: create the membership. */
	join: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();

		const code = normalizeInviteCode(String(form.get('code') ?? ''));
		const displayName = String(form.get('displayName') ?? '').trim();
		const color = String(form.get('color') ?? '');

		const m = catalog(event.locals.locale);

		if (!displayName || displayName.length > DISPLAY_NAME_MAX || !isMemberColor(color)) {
			return fail(400, {
				error: !displayName
					? m.errors.displayName
					: displayName.length > DISPLAY_NAME_MAX
						? m.onboarding.join.nameTooLong(DISPLAY_NAME_MAX)
						: m.errors.pickColour,
				code
			});
		}

		try {
			joinHousehold(user.id, code, { displayName, color });
		} catch (error) {
			if (error instanceof HouseholdError) {
				if (error.code === 'already-member') redirect(303, '/home');
				return fail(400, {
					error:
						error.code === 'color-taken' ? m.errors.colourTakenJoin : m.onboarding.join.badCode,
					code
				});
			}
			throw error;
		}

		event.cookies.delete(INVITE_CODE_COOKIE, { path: '/' });
		redirect(303, '/home');
	}
};
