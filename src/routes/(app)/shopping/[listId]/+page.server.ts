/**
 * One list, opened (plan 36 [L5], SPEC §3.1): its own route, so the phone's
 * back button and the swipe-back return to the overview, and a link can point
 * at it. The add field here adds to this list and nothing else.
 *
 * Scoped like every other: a list id from another household (or a list deleted
 * a second ago) is a 404, never somebody else's rows.
 */
import { error } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { SHOPPING_DEP } from '$lib/live';
import { requireMember } from '$lib/server/guards';
import {
	getShoppingList,
	getStore,
	listItemNames,
	listStores
} from '$lib/server/services/shopping';
import { shoppingActions } from '$lib/server/shopping-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	// The same live channel as the overview: an event invalidates this load too.
	event.depends(SHOPPING_DEP);

	const list = getStore(householdId, event.params.listId);
	if (!list) error(404, catalog(event.locals.locale).shopping.lists.notFound);

	return {
		list: { id: list.id, name: list.name, icon: list.icon, kind: list.kind },
		items: getShoppingList(householdId).filter((item) => item.storeId === list.id),
		// For the sheet [3a]'s chips: a row can still be moved to another list.
		stores: listStores(householdId).map(({ id, name, icon, kind }) => ({ id, name, icon, kind })),
		suggestions: listItemNames(householdId)
	};
};

export const actions: Actions = shoppingActions;
