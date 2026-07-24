/**
 * Shopping (→ SPEC §3). Four actions, one service call each: the quick field
 * and the sheet both post to `add`, the check circle to `toggle`, the sheet's
 * CTA and delete row to `update`/`delete`.
 */
import { fail } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import {
	addItem,
	deleteItem,
	getShoppingList,
	listStores,
	setChecked,
	updateItem
} from '$lib/server/services/shopping';
import { ITEM_NAME_MAX } from '$lib/utils/shopping';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	// One read, two uses: the groups are built from it, and it goes to the
	// browser as the sheet's chips — including the empty stores the list itself
	// doesn't render (→ [3a]).
	const stores = listStores(householdId);

	return {
		list: getShoppingList(householdId, stores),
		stores: stores.map(({ id, name }) => ({ id, name }))
	};
};

/** The trimmed item name, or the message to send back with a 400. */
function readName(form: FormData, m: Messages): { name: string } | { error: string } {
	const name = String(form.get('name') ?? '').trim();
	if (!name) return { error: m.errors.shopping.itemName };
	if (name.length > ITEM_NAME_MAX) return { error: m.errors.keepUnder(ITEM_NAME_MAX) };
	return { name };
}

/** "" (or a stray non-number) means no quantity; the service clamps the rest. */
function readQuantity(form: FormData): number | null {
	const raw = String(form.get('quantity') ?? '').trim();
	if (!raw) return null;
	const parsed = Number(raw.replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : null;
}

function readUnit(form: FormData): string | null {
	return String(form.get('unit') ?? '').trim() || null;
}

export const actions: Actions = {
	add: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const name = readName(form, catalog(event.locals.locale));
		if ('error' in name) return fail(400, { error: name.error });

		// The quick field posts no store at all, which is the difference between
		// "wherever quick-add goes" (the first store) and the sheet's explicit
		// "Other" (→ services/shopping.ts).
		const store = form.get('storeId');

		addItem(householdId, member.id, {
			name: name.name,
			quantity: readQuantity(form),
			unit: readUnit(form),
			storeId: store === null ? undefined : String(store) || null
		});

		return { added: true };
	},

	update: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const id = String(form.get('id') ?? '');
		const name = readName(form, catalog(event.locals.locale));
		if ('error' in name) return fail(400, { error: name.error });

		updateItem(householdId, id, {
			name: name.name,
			quantity: readQuantity(form),
			unit: readUnit(form),
			storeId: String(form.get('storeId') ?? '') || null
		});

		return { updated: true };
	},

	/**
	 * `checked` is the state the row wants to be in, not a flip: two taps racing
	 * each other then settle on an answer instead of undoing one another.
	 */
	toggle: async (event) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		setChecked(
			householdId,
			String(form.get('id') ?? ''),
			member.id,
			form.get('checked') === 'true'
		);

		return { toggled: true };
	},

	delete: async (event) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		deleteItem(householdId, String(form.get('id') ?? ''));

		return { deleted: true };
	}
};
