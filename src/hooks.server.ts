/**
 * Server wiring: boot tasks (`init`) and per-request auth + language context
 * (`handle`).
 */
import { building } from '$app/environment';
import { isAuthPath, svelteKitHandler } from 'better-auth/svelte-kit';
import { eq } from 'drizzle-orm';
import type { Handle, RequestEvent, ServerInit } from '@sveltejs/kit';
import {
	DEFAULT_LOCALE,
	HTML_LANG,
	isLocale,
	LOCALE_COOKIE,
	negotiateLocale,
	type Locale
} from '$lib/i18n/locale';
import { auth } from '$lib/server/auth';
import { registerCronJobs } from '$lib/server/cron';
import { db, runMigrations } from '$lib/server/db';
import { members } from '$lib/server/db/schema';
import { isTheme, THEME_COOKIE, type Theme } from '$lib/theme';

/** Runs once before the first request — safe with a single instance. */
export const init: ServerInit = () => {
	runMigrations();
	registerCronJobs();
};

export const handle: Handle = async ({ event, resolve }) => {
	// Set before the branch below: `App.Locals.locale` promises it is always
	// there, and `svelteKitHandler` hands the event back to `resolve` while the
	// app is building — a render with no language is a 500 on the first `m.…`.
	// The member isn't loaded yet here, so this is the signed-out answer; the
	// full resolution happens once there is one.
	event.locals.locale = resolveLocale(event);

	// Unlike language, the theme is settled here for good: it is only ever the
	// cookie, so nothing the session lookup turns up could change it
	// (→ `$lib/theme`).
	event.locals.theme = resolveTheme(event);

	// Better Auth owns /api/auth/** end-to-end; no locals needed there.
	if (isAuthPath(event.url.toString(), auth.options)) {
		return svelteKitHandler({ auth, event, resolve, building });
	}

	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.member = session
		? (db.select().from(members).where(eq(members.userId, session.user.id)).get() ?? null)
		: null;
	event.locals.locale = resolveLocale(event);

	// `<html lang>` and `<html data-theme>` are placeholders in app.html because
	// they are per-request: one tells a screen reader which voice to read the
	// page in, the other decides the palette before a single byte of CSS is
	// applied. Both are attributes of the document that no component can reach.
	//
	// With no cookie, `%theme%` expands to nothing rather than to some "system"
	// value: the absence of the attribute is what leaves `color-scheme:
	// light dark` in charge, so the device's own setting wins with no
	// client-side script and no flash (→ app.css).
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%lang%', HTML_LANG[event.locals.locale])
				// No leading space: app.html already separates the placeholder from
				// `lang`, so an empty expansion just leaves a harmless one inside the
				// tag rather than gluing two attributes together.
				.replace('%theme%', event.locals.theme ? `data-theme="${event.locals.theme}"` : '')
	});

	// Ask for the device's colour preference on *subsequent* requests to this
	// origin. Deliberately not `Critical-CH`: the document never waits for it —
	// it answers "follow the device" in CSS (→ app.css). The one consumer that
	// can't do that is the manifest, which is fetched after a page has already
	// been served and so gets the hint for free
	// (→ `routes/manifest.webmanifest`, `$lib/theme`).
	response.headers.append('Accept-CH', 'Sec-CH-Prefers-Color-Scheme');

	return response;
};

/**
 * Which theme this request is painted in, or `null` for "follow the device".
 *
 * The whole resolution: there is no membership column to outrank the cookie and
 * no header to fall back to (`Sec-CH-Prefers-Color-Scheme` is Chromium-only and
 * needs a `Critical-CH` round trip to arrive at all). "Follow the device" is
 * therefore answered in CSS rather than here — which is also why this returns
 * null instead of guessing light (→ `$lib/theme`, app.css).
 */
function resolveTheme(event: RequestEvent): Theme | null {
	const cookie = event.cookies.get(THEME_COOKIE);
	return isTheme(cookie) ? cookie : null;
}

/**
 * Which language this request is answered in (→ SPEC §6, `$lib/i18n`).
 *
 * 1. **The member's own choice**, when they have made one. It lives on the
 *    membership rather than in the cookie so a phone and a laptop agree, and so
 *    the cron sweep can address a notification in its recipient's language.
 * 2. **The cookie** — what a *signed-out* screen has to go on (login, an invite
 *    link), and what makes the first paint after a switch already correct.
 * 3. **`Accept-Language`** — the phone's own setting, which is the right guess
 *    for someone who has never been asked.
 * 4. English.
 *
 * A NULL `members.locale` is the "System" option, not an absence: it means
 * "follow this device", so it deliberately falls through to 2/3 rather than
 * pinning anything. That is also why nothing here *writes* a cookie — only an
 * explicit choice does (→ `settings/+page.server.ts`), or changing the phone's
 * language would stop changing the app's.
 */
function resolveLocale(event: RequestEvent): Locale {
	const chosen = event.locals.member?.locale;
	if (isLocale(chosen)) return chosen;

	const cookie = event.cookies.get(LOCALE_COOKIE);
	if (isLocale(cookie)) return cookie;

	return negotiateLocale(event.request.headers.get('accept-language')) ?? DEFAULT_LOCALE;
}
