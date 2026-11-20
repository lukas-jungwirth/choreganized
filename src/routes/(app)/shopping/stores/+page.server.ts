/**
 * Manage lists [7g] (→ SPEC §3.4). Any member may reorder, add, edit and
 * delete. Adding, editing (name, kind, icon) and deleting go through the list
 * sheet, whose actions are shared with the overview and an opened list
 * (→ `lib/server/shopping-actions`); the arrows are the one action only this
 * screen has, and they work without JavaScript.
 */
import { requireMember } from '$lib/server/guards';
import { listStoresWithCounts, moveStore } from '$lib/server/services/shopping';
import { shoppingActions } from '$lib/server/shopping-actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	return { stores: listStoresWithCounts(householdId) };
};

export const actions: Actions = {
	...shoppingActions,

	move: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const direction = form.get('direction') === 'up' ? 'up' : 'down';
		moveStore(householdId, String(form.get('id') ?? ''), direction);

		return { moved: true };
	}
};
