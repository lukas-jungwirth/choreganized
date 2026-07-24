/**
 * The one thing every route needs, signed in or not: which language to speak.
 *
 * `hooks.server.ts` resolves it per request; this hands it to the browser so
 * the root layout can put the matching catalog into context, and so a
 * client-side navigation keeps it (→ `$lib/i18n`).
 */
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => {
	return { locale: event.locals.locale };
};
