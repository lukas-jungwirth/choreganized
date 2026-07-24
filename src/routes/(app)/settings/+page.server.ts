/**
 * Settings [6a] (→ SPEC §6) — the screen everything about *you* and about the
 * house hangs off: profile, notifications, the holiday pause, the household's
 * name, and the two ways out (sign out, leave).
 *
 * Plan 05 stood this route up with the Notifications section alone, because
 * enabling push is a per-device decision that needed a permanent home. Plan 10
 * fills in the rest. Every action is a form action calling one service function
 * — the role checks live in `services/household.ts`, so an action that forgot
 * to ask still can't rename someone else's house.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import {
	catalog,
	DEFAULT_LOCALE,
	isLocale,
	LOCALE_COOKIE,
	LOCALE_COOKIE_MAX_AGE,
	negotiateLocale,
	type Messages
} from '$lib/i18n';
import { isMemberColor } from '$lib/member-colors';
import { requireMember } from '$lib/server/guards';
import { pushConfigured, sendTestNotification, type NotificationPref } from '$lib/server/push';
import {
	getHousehold,
	HouseholdError,
	leaveHousehold,
	renameHousehold,
	setLocale,
	setNotificationPref,
	updateProfile
} from '$lib/server/services/household';
import { setAway } from '$lib/server/services/tasks';
import { isCalendarDate, todayIn } from '$lib/utils/dates';
import { DISPLAY_NAME_MAX, HOUSEHOLD_NAME_MAX } from '$lib/utils/household';
import type { Actions, PageServerLoad } from './$types';

/** The three switches [6a] draws, and the columns `push.ts` filters sends on. */
const PREFS: NotificationPref[] = [
	'notifyTaskReminders',
	'notifyOverdueNudges',
	'notifyShoppingUpdates'
];

function isPref(value: unknown): value is NotificationPref {
	return typeof value === 'string' && PREFS.includes(value as NotificationPref);
}

/**
 * The service's refusals, in this screen's words. Everything else is rethrown —
 * an unexpected failure is a 500, not a form error nobody can act on.
 *
 * The parameter is `cause`, not `error`: `error` is SvelteKit's own helper,
 * imported above, and a catch clause that shadows it is one edit away from
 * calling the caught value.
 */
function refuse(cause: unknown, m: Messages) {
	if (cause instanceof HouseholdError) {
		switch (cause.code) {
			case 'color-taken':
				return fail(409, { error: m.errors.household['color-taken'] });
			case 'not-owner':
				return fail(403, { error: m.errors.household['not-owner'] });
			case 'transfer-first':
				return fail(409, { error: m.errors.household['transfer-first'] });
			case 'stale-roster':
				return fail(409, { error: m.errors.household['stale-roster'] });
			case 'not-member':
				// Removed from the household between loading this page and posting.
				return fail(404, { error: m.errors.household['not-member'] });
		}
	}
	throw cause;
}

export const load: PageServerLoad = (event) => {
	const { user, member } = requireMember(event);

	// The household, the roster and `today` come from the `(app)` layout — this
	// load only adds what is nobody else's business: the sign-in identity and
	// this member's own preferences.
	return {
		email: user.email,
		prefs: {
			notifyTaskReminders: member.notifyTaskReminders,
			notifyOverdueNudges: member.notifyOverdueNudges,
			notifyShoppingUpdates: member.notifyShoppingUpdates
		},
		/** The stored choice, not the resolved language: null is "System" [6a]. */
		chosenLocale: member.locale,
		/**
		 * What "System" would actually resolve to — the header alone, *ignoring*
		 * the choice and the cookie. `event.locals.locale` is the wrong number to
		 * show there: with English chosen on a German phone it reads back
		 * "currently English", which is the one thing that row must not say.
		 */
		deviceLocale: negotiateLocale(event.request.headers.get('accept-language')) ?? DEFAULT_LOCALE
	};
};

export const actions: Actions = {
	/** Name and colour [6a] — always your own membership (→ SPEC §6 "Account"). */
	profile: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const m = catalog(event.locals.locale);
		const displayName = String(form.get('displayName') ?? '').trim();
		const color = String(form.get('color') ?? '');

		if (!displayName) return fail(400, { error: m.errors.displayName });
		if (displayName.length > DISPLAY_NAME_MAX) {
			return fail(400, { error: m.errors.keepUnder(DISPLAY_NAME_MAX) });
		}
		if (!isMemberColor(color)) return fail(400, { error: m.errors.pickColour });

		try {
			updateProfile(householdId, member.id, { displayName, color });
		} catch (cause) {
			return refuse(cause, m);
		}

		return { profileSaved: true };
	},

	/**
	 * One preference switch. An unchecked checkbox posts nothing at all, which
	 * is the "off" — the same reading `?/create` gives the rotate toggle.
	 */
	notify: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const pref = form.get('pref');
		if (!isPref(pref)) {
			return fail(400, { error: catalog(event.locals.locale).errors.tasks.notANotification });
		}

		setNotificationPref(householdId, member.id, pref, form.get('enabled') !== null);

		return { prefSaved: true };
	},

	/**
	 * The UI language (→ SPEC §6). An unrecognised value — including the empty
	 * string the "System" row posts — is the absence of a choice, which is a real
	 * setting: it leaves the column NULL so every device follows its own
	 * `Accept-Language` (→ hooks.server.ts).
	 *
	 * The cookie is written alongside so a *signed-out* screen speaks the same
	 * language (login, an invite link), and so the very first paint after a
	 * switch is already right — before any session lookup has happened. Choosing
	 * "System" clears it, or the phone's own language would stop mattering.
	 *
	 * The sheet reloads the document itself once this returns, rather than
	 * patching the page it is sitting on — `<html lang>` and every string already
	 * rendered have to change with it (→ `components/settings/LanguageSheet.svelte`).
	 */
	language: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const value = form.get('locale');
		const locale = isLocale(value) ? value : null;

		setLocale(householdId, member.id, locale);

		if (locale) {
			// Server-read only (→ hooks.server.ts), so it keeps SvelteKit's httpOnly
			// default rather than opting out of it for no reader.
			event.cookies.set(LOCALE_COOKIE, locale, {
				path: '/',
				maxAge: LOCALE_COOKIE_MAX_AGE,
				sameSite: 'lax'
			});
		} else {
			event.cookies.delete(LOCALE_COOKIE, { path: '/' });
		}

		return { languageSaved: true };
	},

	/**
	 * The holiday pause — the same service call the snooze sheet's toggle makes
	 * (→ SPEC §5.5), so the two controls are one state.
	 */
	away: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		// Actions can't reach the layout's copy of the clock, so they ask again —
		// and "today" stays the household's business, not the phone's.
		const household = getHousehold(householdId);
		if (!household) error(500, catalog(event.locals.locale).errors.householdMissing);

		const until = form.get('until');
		setAway(
			householdId,
			member.id,
			isCalendarDate(until) ? until : null,
			todayIn(household.timezone)
		);

		return { awaySaved: true };
	},

	/** Owner-only; the service is what enforces that (→ DECISIONS #10). */
	renameHousehold: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const m = catalog(event.locals.locale);
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: m.errors.householdName });
		if (name.length > HOUSEHOLD_NAME_MAX) {
			return fail(400, { error: m.errors.keepUnder(HOUSEHOLD_NAME_MAX) });
		}

		try {
			renameHousehold(householdId, member.id, name);
		} catch (cause) {
			return refuse(cause, m);
		}

		return { renamed: true };
	},

	/**
	 * Leaving [6d]. The redirect is deliberately outside the `try`: SvelteKit
	 * signals it by throwing, and catching it here would turn a successful
	 * departure into an error message.
	 */
	leave: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		// Which of [6d]'s two sentences the confirm actually showed. The service
		// refuses to delete a household on the strength of a screen that promised
		// "your points stay with the household" (→ DECISIONS #79).
		const expectDelete = form.get('mode') === 'last';

		try {
			leaveHousehold(householdId, member.id, expectDelete);
		} catch (cause) {
			return refuse(cause, catalog(event.locals.locale));
		}

		// No membership any more, so `requireMember` would send them here anyway.
		redirect(303, '/onboarding');
	},

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
