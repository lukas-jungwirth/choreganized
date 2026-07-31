/**
 * The two things every route needs, signed in or not: which language to speak
 * and which theme to paint in.
 *
 * `hooks.server.ts` resolves both per request; this hands them to the browser so
 * the root layout can put the matching catalog into context, keep the browser
 * chrome in step, and survive a client-side navigation
 * (→ `$lib/i18n`, `$lib/theme`).
 */
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	return { locale: event.locals.locale, theme: event.locals.theme };
};
