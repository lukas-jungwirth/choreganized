/**
 * Manage stores [7g] (→ SPEC §3.4). Any member may reorder, rename, add and
 * delete; deleting drops its items into "Other" rather than removing them.
 */
import { fail } from '@sveltejs/kit';
import { requireMember } from '$lib/server/guards';
import {
	createStore,
	deleteStore,
	listStoresWithCounts,
	moveStore,
	renameStore
} from '$lib/server/services/shopping';
import { STORE_NAME_MAX } from '$lib/utils/shopping';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	return { stores: listStoresWithCounts(householdId) };
};

function readName(form: FormData): { name: string } | { error: string } {
	const name = String(form.get('name') ?? '').trim();
	if (!name) return { error: 'Give the store a name.' };
	if (name.length > STORE_NAME_MAX) return { error: `Keep it under ${STORE_NAME_MAX} characters.` };
	return { name };
}

export const actions: Actions = {
	create: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const name = readName(form);
		if ('error' in name) return fail(400, { error: name.error });

		createStore(householdId, name.name);

		return { created: true };
	},

	rename: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const name = readName(form);
		if ('error' in name) return fail(400, { error: name.error });

		renameStore(householdId, String(form.get('id') ?? ''), name.name);

		return { renamed: true };
	},

	move: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const direction = form.get('direction') === 'up' ? 'up' : 'down';
		moveStore(householdId, String(form.get('id') ?? ''), direction);

		return { moved: true };
	},

	delete: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		deleteStore(householdId, String(form.get('id') ?? ''));

		return { deleted: true };
	}
};
