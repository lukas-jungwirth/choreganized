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

	// `<html lang>` is a placeholder in app.html because it is per-request: it
	// tells a screen reader which voice to read the page in, and it is the one
	// attribute of the document that no component can reach.
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', HTML_LANG[event.locals.locale])
	});
};

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
