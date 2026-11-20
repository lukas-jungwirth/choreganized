/**
 * The actions a list's rows, its add field and its sheets post to, shared by
 * the two screens that show them: the overview `/shopping` and an opened list
 * `/shopping/[listId]` (plan 36). Spread into each route's `actions`, like
 * `meal-actions.ts`: one sheet, one answer, wherever it was opened from. Each
 * is still one service call (→ docs/ARCHITECTURE.md "Server patterns").
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { parseQuickAdd } from '$lib/utils/lists';
import { ITEM_NAME_MAX, STORE_NAME_MAX, suggestionKey } from '$lib/utils/shopping';
import { requireMember } from './guards';
import {
	addItem,
	createStore,
	deleteItem,
	listItemNames,
	quickAddItem,
	renameStore,
	reorderItems,
	setChecked,
	updateItem
} from './services/shopping';

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

function readListName(form: FormData, m: Messages): { name: string } | { error: string } {
	const name = String(form.get('name') ?? '').trim();
	if (!name) return { error: m.errors.shopping.storeName };
	if (name.length > STORE_NAME_MAX) return { error: m.errors.keepUnder(STORE_NAME_MAX) };
	return { name };
}

/**
 * "" is "Other", a real target; a missing field is "wherever quick-add goes"
 * (the first list → services/shopping.ts).
 */
function readStoreId(form: FormData): string | null | undefined {
	const store = form.get('storeId');
	return store === null ? undefined : String(store) || null;
}

export const shoppingActions = {
	/**
	 * The add field and the sheet [3a] both post here. The field says so
	 * (`quick`): its line may carry an amount ("2 l milk"), a known name keeps the
	 * household's spelling ("milk" → "Milk"), and a name under "{n} bought" on
	 * the target list is put back rather than added twice (plan 36).
	 */
	add: async (event: RequestEvent) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const name = readName(form, catalog(event.locals.locale));
		if ('error' in name) return fail(400, { error: name.error });

		const storeId = readStoreId(form);

		if (form.get('quick') === null) {
			addItem(householdId, member.id, {
				name: name.name,
				quantity: readQuantity(form),
				unit: readUnit(form),
				storeId
			});
			return { added: true };
		}

		const parsed = parseQuickAdd(name.name);
		const key = suggestionKey(parsed.name);
		const known = listItemNames(householdId).find((row) => suggestionKey(row.name) === key);

		// The field posts the list its icon shows. Without JavaScript it posts
		// none, and a known name goes where it went last — the rule the icon
		// follows (→ `utils/lists` `listTarget`).
		const target = storeId !== undefined ? storeId : (known?.storeId ?? undefined);

		const result = quickAddItem(householdId, member.id, {
			name: known?.name ?? parsed.name,
			quantity: parsed.quantity,
			unit: parsed.unit,
			storeId: target
		});

		return { added: true, restored: result.restored };
	},

	update: async (event: RequestEvent) => {
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
	toggle: async (event: RequestEvent) => {
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

	delete: async (event: RequestEvent) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		deleteItem(householdId, String(form.get('id') ?? ''));

		return { deleted: true };
	},

	/**
	 * A list's new walking order after a drag: its storeId ("" for "Other") and
	 * its item ids, in order, as one comma-separated field. The service is what
	 * guards which of those ids may actually move.
	 */
	reorder: async (event: RequestEvent) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		// "" is the "Other" group, a real target — only a missing field is "no store".
		const rawStore = form.get('storeId');
		const storeId = rawStore ? String(rawStore) : null;
		const ids = String(form.get('ids') ?? '')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);

		reorderItems(householdId, storeId, ids);

		return { reordered: true };
	},

	/** New list [L6]: answers with its id, and the sheet opens it. */
	createList: async (event: RequestEvent) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const name = readListName(form, catalog(event.locals.locale));
		if ('error' in name) return fail(400, { error: name.error });

		const list = createStore(householdId, name.name, String(form.get('icon') ?? '') || null);

		return { listId: list.id };
	},

	/** Rename a list and change its icon (the ⋯ on an opened list). */
	editList: async (event: RequestEvent) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const name = readListName(form, catalog(event.locals.locale));
		if ('error' in name) return fail(400, { error: name.error });

		const id = String(form.get('id') ?? '');
		renameStore(householdId, id, name.name, String(form.get('icon') ?? '') || null);

		return { listId: id };
	}
};
