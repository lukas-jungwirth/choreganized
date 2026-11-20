/**
 * The actions a list's rows, its add field and its sheets post to, shared by
 * the two screens that show them: the overview `/shopping` and an opened list
 * `/shopping/[listId]` (plan 36). Spread into each route's `actions`, like
 * `meal-actions.ts`: one sheet, one answer, wherever it was opened from. Each
 * is still one service call (→ docs/ARCHITECTURE.md "Server patterns").
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { isListKind, parseQuickAdd, type ListKind } from '$lib/utils/lists';
import { ITEM_NAME_MAX, STORE_NAME_MAX, suggestionKey } from '$lib/utils/shopping';
import { requireMember } from './guards';
import {
	addItem,
	createStore,
	deleteItem,
	listItemNames,
	listStores,
	quickAddItem,
	renameStore,
	reorderItems,
	resetList,
	setChecked,
	setStoreKind,
	undoReset,
	updateItem,
	type ResetTick
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

/** The New list sheet's switch; anything else is a shopping list. */
function readKind(form: FormData): ListKind | undefined {
	const kind = form.get('kind');
	return isListKind(kind) ? kind : undefined;
}

/**
 * What Start over took away, as the undo bar hands it back: a JSON array of
 * `{ id, checkedAt, by }`. Shape only; the service decides what may be restored.
 */
function readTicks(form: FormData): ResetTick[] {
	let raw: unknown;
	try {
		raw = JSON.parse(String(form.get('ticks') ?? '[]'));
	} catch {
		return [];
	}
	if (!Array.isArray(raw)) return [];
	return raw
		.slice(0, 500)
		.flatMap((tick) =>
			tick &&
			typeof tick.id === 'string' &&
			typeof tick.checkedAt === 'number' &&
			(tick.by === null || typeof tick.by === 'string')
				? [{ id: tick.id, checkedAt: tick.checkedAt, by: tick.by }]
				: []
		);
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
		const lists = listStores(householdId);
		const kindOf = (id: string | null | undefined) =>
			lists.find((list) => list.id === id)?.kind ?? 'buy';

		// The field posts the list its icon shows. Without JavaScript it posts
		// none, and a known name goes where it went last, unless that list is a
		// checklist now: the rule the icon follows (→ `utils/lists` `listTarget`).
		// Only a shopping list that still exists; a deleted one is no memory at all.
		const remembered = lists.find((list) => list.id === known?.storeId && list.kind === 'buy')?.id;
		const target = storeId !== undefined ? storeId : remembered;

		// A checklist's rows are not the household's shopping words (plan 36
		// step 2), so they are not respelled after them either.
		const respell = kindOf(target) === 'buy' ? known?.name : undefined;

		const result = quickAddItem(householdId, member.id, {
			name: respell ?? parsed.name,
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

		const list = createStore(
			householdId,
			name.name,
			String(form.get('icon') ?? '') || null,
			readKind(form) ?? 'buy'
		);

		return { listId: list.id };
	},

	/**
	 * Rename a list, change its icon and its kind (the ⋯ on an opened list). The
	 * sheet has already asked, if changing the kind moves ticked rows.
	 */
	editList: async (event: RequestEvent) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const name = readListName(form, catalog(event.locals.locale));
		if ('error' in name) return fail(400, { error: name.error });

		const id = String(form.get('id') ?? '');
		renameStore(householdId, id, name.name, String(form.get('icon') ?? '') || null);
		const kind = readKind(form);
		if (kind) setStoreKind(householdId, id, kind);

		return { listId: id };
	},

	/**
	 * Start over (plan 36 [L4]): every tick on a checklist, gone in one go.
	 * Answers with what it took away, for the undo bar.
	 */
	resetList: async (event: RequestEvent) => {
		const { householdId, member } = requireMember(event);
		const form = await event.request.formData();

		const result = resetList(householdId, member.id, String(form.get('id') ?? ''));
		if (!result) return fail(404, { error: catalog(event.locals.locale).shopping.lists.notFound });

		return { reset: result };
	},

	/** The undo bar's way back from Start over. */
	undoReset: async (event: RequestEvent) => {
		const { householdId } = requireMember(event);
		const form = await event.request.formData();

		const restored = undoReset(householdId, String(form.get('id') ?? ''), readTicks(form));

		return { restored };
	}
};
