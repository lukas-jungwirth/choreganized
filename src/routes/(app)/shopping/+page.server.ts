/**
 * Lists, the overview (→ SPEC §3, plan 36). The rows, the add field and the
 * sheets post to the actions shared with an opened list
 * (→ `lib/server/shopping-actions`); the shop-closure banner's answer is the
 * one action only this screen has.
 */
import { SHOPPING_DEP } from '$lib/live';
import { requireMember } from '$lib/server/guards';
import { answerHolidayNotice, readHolidayAnswer } from '$lib/server/services/holidays';
import { getShoppingList, listItemNames, listStores } from '$lib/server/services/shopping';
import { shoppingActions } from '$lib/server/shopping-actions';
import { FOLDED_COOKIE, readFolded } from '$lib/utils/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	// What the live channel re-runs when a housemate changes something
	// (→ `lib/live-shopping.svelte.ts`). Named rather than `invalidateAll` so a
	// tick in the shop costs this load and not the whole layout's as well.
	event.depends(SHOPPING_DEP);

	return {
		items: getShoppingList(householdId),
		// Every list, empty ones included: the cards are only the ones with
		// something on them, but the field's menu and the sheet's chips offer all
		// of them (→ `utils/shopping` `splitList`).
		stores: listStores(householdId).map(({ id, name, icon, kind }) => ({ id, name, icon, kind })),
		// The pool the add field completes from, filtered in the browser, each
		// name with the list it went to last.
		suggestions: listItemNames(householdId),
		// Per device, so the first paint is already folded (→ DECISIONS #119).
		folded: readFolded(event.cookies.get(FOLDED_COOKIE))
	};
};

export const actions: Actions = {
	...shoppingActions,

	/**
	 * "Remind me tomorrow" / "Got it" on the shop-closure banner (→ SPEC §3.6).
	 * The banner shows here and on Home, so the wrapper does too — the state is a
	 * row rather than a screen's flag, so answering on either puts it away on both.
	 */
	holidayNotice: async (event) => {
		const { householdId, member } = requireMember(event);
		const answered = readHolidayAnswer(await event.request.formData());

		// A stale tab answering a notice that is no longer up writes nothing — and
		// needs no error either, since the banner it was answering is already gone.
		// Reported honestly all the same rather than as a blanket success.
		return {
			holidayAnswered: answered
				? answerHolidayNotice(householdId, member.id, answered.closureDate, answered.answer)
				: false
		};
	}
};
