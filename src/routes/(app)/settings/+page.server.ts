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
import { AiImportError, testGeminiKey } from '$lib/server/services/ai-import';
import {
	getAiImportStatus,
	getGeminiApiKey,
	getHousehold,
	HouseholdError,
	leaveHousehold,
	renameHousehold,
	setGeminiApiKey,
	setLocale,
	setNotificationPref,
	updateProfile
} from '$lib/server/services/household';
import { setAway } from '$lib/server/services/tasks';
import { isTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from '$lib/theme';
import { isCalendarDate, todayIn } from '$lib/utils/dates';
import { DISPLAY_NAME_MAX, HOUSEHOLD_NAME_MAX, looksLikeGeminiKey } from '$lib/utils/household';
import type { Actions, PageServerLoad } from './$types';

/** The switches [6a] draws, and the columns `push.ts` filters sends on. */
const PREFS: NotificationPref[] = [
	'notifyTaskReminders',
	'notifyOverdueNudges',
	'notifyShoppingUpdates',
	'notifyShopClosures'
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

/** A failed key test in this screen's words — a rejected key vs a busy/unreachable service. */
function aiTestMessage(cause: unknown, m: Messages): string {
	const t = m.settings.aiImport.test;
	if (cause instanceof AiImportError) {
		if (cause.code === 'bad-key') return t.badKey;
		if (cause.code === 'rate-limited') return t.busy;
		if (cause.code === 'model-unavailable') return t.model;
	}
	return t.failed;
}

export const load: PageServerLoad = (event) => {
	const { user, member, householdId } = requireMember(event);

	// The household, the roster and `today` come from the `(app)` layout — this
	// load only adds what is nobody else's business: the sign-in identity and
	// this member's own preferences.
	return {
		email: user.email,
		// Whether AI import is set up, and a masked hint — never the key itself
		// (→ SPEC §4.7, §6). Members see it read-only; only the owner can change it.
		aiImport: getAiImportStatus(householdId),
		prefs: {
			notifyTaskReminders: member.notifyTaskReminders,
			notifyOverdueNudges: member.notifyOverdueNudges,
			notifyShoppingUpdates: member.notifyShoppingUpdates,
			notifyShopClosures: member.notifyShopClosures
		},
		/** The stored choice, not the resolved language: null is "System" [6a]. */
		chosenLocale: member.locale,
		/**
		 * Same shape for the theme, and here the stored choice is the *whole*
		 * story — null is "System", and what that resolves to is a question only
		 * the browser can answer (→ `components/settings/ThemeSheet.svelte`).
		 */
		chosenTheme: event.locals.theme,
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
	 * Light, dark, or follow the device (→ SPEC §6). The cookie *is* the setting
	 * here — there is no column behind it, because a theme is a property of the
	 * screen you are reading on and not of the person or the house
	 * (→ DECISIONS #119).
	 *
	 * An unrecognised value — including the empty string the "System" row posts —
	 * deletes it, which is how "follow the device" is stored: only the absence of
	 * the cookie leaves `color-scheme: light dark` in charge (→ app.css).
	 *
	 * Unlike `?/language` this needs no reload. Nothing rendered changes — the
	 * palette is entirely custom properties, so re-running the loads is enough to
	 * repaint (→ `components/settings/ThemeSheet.svelte`).
	 */
	theme: async (event) => {
		// Not household data, but the settings screen is behind the guard and a
		// signed-out POST here has no business being answered.
		requireMember(event);
		const form = await event.request.formData();

		const value = form.get('theme');

		if (isTheme(value)) {
			// Read on the server to stamp `<html data-theme>` (→ hooks.server.ts), so
			// it keeps SvelteKit's httpOnly default like the locale cookie.
			event.cookies.set(THEME_COOKIE, value, {
				path: '/',
				maxAge: THEME_COOKIE_MAX_AGE,
				sameSite: 'lax'
			});
		} else {
			event.cookies.delete(THEME_COOKIE, { path: '/' });
		}

		return { themeSaved: true };
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
	 * Store the household's Gemini key for AI recipe import [6a] (→ plan 13,
	 * SPEC §4.7). Owner-only — the service enforces it (→ DECISIONS #10) — and the
	 * shape check is deliberately loose: a real key is proven by the first
	 * extraction, not here.
	 */
	saveAiKey: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const m = catalog(event.locals.locale);
		const key = String(form.get('key') ?? '').trim();
		if (!looksLikeGeminiKey(key)) return fail(400, { error: m.settings.aiImport.invalid });

		try {
			setGeminiApiKey(householdId, member.id, key);
		} catch (cause) {
			return refuse(cause, m);
		}

		return { aiKeySaved: true };
	},

	/** Clear the key — AI import goes back off. Owner-only, like setting it. */
	removeAiKey: async (event) => {
		const { householdId, member } = requireMember(event);

		try {
			setGeminiApiKey(householdId, member.id, null);
		} catch (cause) {
			return refuse(cause, catalog(event.locals.locale));
		}

		return { aiKeyRemoved: true };
	},

	/**
	 * Test the stored key against the live API [6a] (→ plan 14) — a green "connection
	 * works" or the reason it doesn't, changing nothing. Not owner-gated: the sheet is
	 * owner-only UI, but a test mutates no data (it just spends a trivial API call).
	 */
	testAiKey: async (event) => {
		const { householdId } = requireMember(event);
		const m = catalog(event.locals.locale);

		const key = getGeminiApiKey(householdId);
		if (!key) return fail(400, { aiTestError: m.settings.aiImport.test.noKey });

		try {
			await testGeminiKey(key);
		} catch (cause) {
			return fail(422, { aiTestError: aiTestMessage(cause, m) });
		}

		return { aiTestOk: true };
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
