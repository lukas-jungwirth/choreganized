/**
 * Impressum and Datenschutz (→ SPEC §13): public, signed in or out, because the
 * sign-in screen — the first place the app asks for an email address — links
 * here. Outside `(app)` on purpose, so nothing here asks for a household.
 *
 * A page whose variable is unset is a 404, the same answer as a page that
 * doesn't exist: an install that never set one has no such page at all.
 */
import { error } from '@sveltejs/kit';
import { legalLang, legalLinks, legalText } from '$lib/server/legal';
import { isLegalPage, legalBack, legalHref, parseLegalFrom } from '$lib/utils/legal';
import { parseLegalText } from '$lib/utils/legal-text';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, locals }) => {
	const page = params.page;
	if (!isLegalPage(page)) error(404);
	const text = legalText(page);
	if (text === null) error(404);

	const from = parseLegalFrom(url.searchParams.get('from'));
	const other = page === 'imprint' ? 'privacy' : 'imprint';

	return {
		page,
		blocks: parseLegalText(text),
		/** The language the operator wrote in, which need not be the reader's. */
		lang: legalLang(),
		back: legalBack(from, !!locals.member),
		/** The other page, keeping where the reader started; null while it isn't set. */
		other: legalLinks()[other] ? { page: other, href: legalHref(other, from) } : null
	};
};
