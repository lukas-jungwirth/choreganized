/**
 * Shopping (→ SPEC §3). Four actions, one service call each: the quick field
 * and the sheet both post to `add`, the check circle to `toggle`, the sheet's
 * CTA and delete row to `update`/`delete`.
 */
import { fail } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import { answerHolidayNotice, readHolidayAnswer } from '$lib/server/services/holidays';
import {
	addItem,
	deleteItem,
	getShoppingList,
	listItemNames,
	listStores,
	reorderItems,
	setChecked,
	updateItem
} from '$lib/server/services/shopping';
import { ITEM_NAME_MAX } from '$lib/utils/shopping';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId } = requireMember(event);

	return {
		items: getShoppingList(householdId),
		// Walking order *and* the sheet's chips — including the empty stores the
		// list itself doesn't render (→ [3a]). The screen groups the items by
		// them, and regroups on every tick (→ `utils/shopping` `splitList`).
		stores: listStores(householdId).map(({ id, name }) => ({ id, name })),
		// The pool the add field completes from, filtered in the browser.
		suggestions: listItemNames(householdId)
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
	},

	/**
	 * A store group's new walking order after a drag: the group's storeId ("" for
	 * "Other") and its item ids, in order, as one comma-separated field. The
	 * service is what guards which of those ids may actually move.
	 */
	reorder: async (event) => {
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
