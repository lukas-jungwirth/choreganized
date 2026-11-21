/**
 * A guest's read-only page [G6] [G7] (→ SPEC §11.15, plan 38): what they owe or
 * are owed, and every expense and payment they are part of, from the link a
 * member sent them. Outside `(app)` on purpose, beside `/j` and `/legal`:
 * nobody signs in here, and `hooks.server.ts` doesn't even look for a session
 * on `/g/`, so the page speaks the request's language and sets the
 * no-index, no-referrer, no-store headers.
 *
 * The data is exactly `guestPage`'s, which is built to hold only what the page
 * shows: no ids, no household name, nobody else's share. An unknown, replaced
 * or removed guest's token is one 404 [G8] that names nobody.
 */
import { error } from '@sveltejs/kit';
import { legalLinks } from '$lib/server/legal';
import { guestPage } from '$lib/server/services/expenses';
import { todayIn } from '$lib/utils/dates';
import { guestFrom } from '$lib/utils/legal';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const page = guestPage(params.token);
	if (!page) error(404);

	const { timezone, ...shown } = page;
	return {
		guest: shown,
		/** For "Today" / "Yesterday" in the list, in the household's own calendar. */
		today: todayIn(timezone),
		/** Impressum and Datenschutz, when the deploy has them (→ SPEC §13). */
		legal: legalLinks(),
		legalFrom: guestFrom(params.token)
	};
};
