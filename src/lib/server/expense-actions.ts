/**
 * The expense form actions, shared by every screen that posts them (→ SPEC §11):
 * the tab [9a] and the detail [9e] both save, pay and delete; the tab and
 * Settings both set the default split and the currency. One handler each, so
 * the two copies of a form can't drift into two rules.
 *
 * Thin, like every action here: read the form, call the service, map its
 * `ExpenseError` to a sentence. The service re-checks everything — a form
 * field is a claim, not a fact.
 */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { catalog, type Messages } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import {
	addGuest,
	createExpense,
	createPayment,
	deleteExpense,
	ExpenseError,
	reminders,
	getExpenseSettings,
	removeGuest,
	guestShareToken,
	renewGuestShareToken,
	renameGuest,
	restoreExpense,
	setCurrency,
	setGuestIncludeInNew,
	setSplitDefault,
	updateExpense,
	updatePayment,
	type ExpenseErrorCode
} from '$lib/server/services/expenses';
import { stopSeries, updateSeries } from '$lib/server/services/expense-recurrences';
import { sendNotices } from '$lib/server/services/expense-notify';
import { getHousehold, HouseholdError } from '$lib/server/services/household';
import { todayIn } from '$lib/utils/dates';
import { DISPLAY_NAME_MAX } from '$lib/utils/household';
import {
	GUESTS_MAX,
	isDefaultSplitMode,
	isExpenseCategory,
	readRepeat,
	isSplitMode
} from '$lib/utils/expenses';
import { parseAmount, type SplitRow } from '$lib/utils/money';

type Errors = Messages['expenses']['errors'];
/** The messages that are plain text; the two with a limit in them are below. */
type PlainError = { [K in keyof Errors]: Errors[K] extends string ? K : never }[keyof Errors];

const MESSAGE: Record<Exclude<ExpenseErrorCode, 'guest-name' | 'guest-limit'>, PlainError> = {
	amount: 'amount',
	description: 'description',
	date: 'date',
	person: 'person',
	split: 'split',
	'same-person': 'samePerson',
	'not-found': 'notFound',
	currency: 'currency',
	'currency-locked': 'currencyLocked',
	'next-date': 'nextDate',
	'date-too-old': 'dateTooOld',
	'series-start': 'seriesStart',
	'series-person': 'seriesPerson',
	'guest-name-taken': 'guestNameTaken',
	'guest-balance': 'guestBalance'
};

function failWith(event: RequestEvent, error: unknown) {
	if (!(error instanceof ExpenseError)) throw error;
	const errors = catalog(event.locals.locale).expenses.errors;
	return fail(400, {
		error:
			error.code === 'guest-name'
				? errors.guestName(DISPLAY_NAME_MAX)
				: error.code === 'guest-limit'
					? errors.guestLimit(GUESTS_MAX)
					: errors[MESSAGE[error.code]]
	});
}

function context(event: RequestEvent) {
	const { householdId, member } = requireMember(event);
	const household = getHousehold(householdId);
	if (!household) throw new ExpenseError('not-found');
	return {
		householdId,
		member,
		today: todayIn(household.timezone),
		currency: household.currency
	};
}

/**
 * `[{ "id": "…", "input": 3000 }, …]` — everyone in the split and what was typed
 * for them. Anything that isn't that shape is an empty split, which the service
 * refuses with the sentence for it.
 */
function readRows(raw: FormDataEntryValue | null): SplitRow[] {
	try {
		const parsed: unknown = JSON.parse(String(raw ?? '[]'));
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter(
				(row): row is { id: string; input: unknown } =>
					typeof row === 'object' && row !== null && typeof row.id === 'string'
			)
			.map((row) => ({
				id: row.id,
				input: typeof row.input === 'number' && Number.isFinite(row.input) ? row.input : null
			}));
	} catch {
		return [];
	}
}

function readAmount(form: FormData, currency: string): number {
	const amount = parseAmount(String(form.get('amount') ?? ''), currency);
	if (amount === null) throw new ExpenseError('amount');
	return amount;
}

/** What [9b] and the series sheet share: the expense minus its date. */
function readTemplate(form: FormData, currency: string) {
	const category = String(form.get('category') ?? '');
	const splitMode = String(form.get('splitMode') ?? '');
	if (!isExpenseCategory(category) || !isSplitMode(splitMode)) throw new ExpenseError('split');

	return {
		description: String(form.get('description') ?? ''),
		category,
		amountMinor: readAmount(form, currency),
		paidById: String(form.get('paidById') ?? ''),
		splitMode,
		rows: readRows(form.get('split'))
	};
}

/**
 * Create or update an expense [9b]; `id` decides which. `repeat` — `week`,
 * `month` or `year`, every `interval` of them — also starts a series from it
 * (→ SPEC §11.9); anything else, the Repeats row's "Never" included, starts none.
 */
export async function saveExpenseAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId, member, today, currency } = context(event);
		const input = {
			...readTemplate(form, currency),
			date: String(form.get('date') ?? '') || today
		};
		const repeat = readRepeat(form.get('repeat'), form.get('interval'));

		const id = String(form.get('id') ?? '');
		if (id) {
			updateExpense(householdId, member.id, id, input, today, repeat);
			return { saved: id };
		}
		return { saved: createExpense(householdId, member.id, input, today, repeat) };
	} catch (error) {
		return failWith(event, error);
	}
}

/** "Edit series" [9h-stop] [9e]: the template and when the next one is due. */
export async function saveSeriesAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId, today, currency } = context(event);
		const repeat = readRepeat(form.get('unit'), form.get('interval'));
		if (!repeat) throw new ExpenseError('split');

		const id = String(form.get('id') ?? '');
		updateSeries(
			householdId,
			id,
			{ ...readTemplate(form, currency), ...repeat, nextDate: String(form.get('nextDate') ?? '') },
			today
		);
		return { saved: id };
	} catch (error) {
		return failWith(event, error);
	}
}

/** "Stop repeating" [9h-stop]. */
export async function stopSeriesAction(event: RequestEvent) {
	const { householdId } = requireMember(event);
	const id = String((await event.request.formData()).get('id') ?? '');
	return { stopped: stopSeries(householdId, id) ? id : null };
}

/** Create or update a payment [9d]. */
export async function savePaymentAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId, member, today, currency } = context(event);
		const input = {
			fromId: String(form.get('fromId') ?? ''),
			toId: String(form.get('toId') ?? ''),
			amountMinor: readAmount(form, currency),
			date: String(form.get('date') ?? '') || today
		};

		const id = String(form.get('id') ?? '');
		if (id) {
			updatePayment(householdId, member.id, id, input, today);
			return { saved: id };
		}
		return { saved: createPayment(householdId, member.id, input, today) };
	} catch (error) {
		return failWith(event, error);
	}
}

export async function deleteExpenseAction(event: RequestEvent) {
	const { householdId } = requireMember(event);
	const id = String((await event.request.formData()).get('id') ?? '');
	return { deleted: deleteExpense(householdId, id) ? id : null };
}

export async function restoreExpenseAction(event: RequestEvent) {
	const { householdId } = requireMember(event);
	const id = String((await event.request.formData()).get('id') ?? '');
	return { restored: restoreExpense(householdId, id) };
}

/**
 * Remind / Remind everyone on the balance card [10a]: a nudge to whoever owes
 * the reader, or just `personId`. Answers with the people it reached, so the
 * card says "Reminded" only to those who will actually hear it, and with
 * whether anybody still owes at all — the card may be older than the ledger.
 */
export async function remindAction(event: RequestEvent) {
	const { householdId, member } = requireMember(event);
	const personId = String((await event.request.formData()).get('personId') ?? '') || null;
	const { owing, notices } = reminders(householdId, member.id, personId);
	// Fire-and-forget like every push: a slow push service must not hold the tap.
	void sendNotices(notices).catch((error) => console.error('[push] reminder failed:', error));
	return { owing, reminded: notices.map((notice) => notice.personId) };
}

/**
 * The household's default split [9c] / Settings → Expenses: a mode and, for
 * `percent` / `shares`, the same JSON rows an expense posts.
 */
export async function splitDefaultAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId } = requireMember(event);
		const mode = String(form.get('mode') ?? '');
		if (!isDefaultSplitMode(mode)) throw new ExpenseError('split');

		setSplitDefault(
			householdId,
			mode,
			readRows(form.get('split')).map((row) => ({ personId: row.id, weight: row.input ?? 0 }))
		);
		return { splitDefault: getExpenseSettings(householdId).splitDefault };
	} catch (error) {
		return failWith(event, error);
	}
}

/**
 * Add a guest [G2] (→ SPEC §11.15), from the split sheet, the payer picker or
 * Expense settings. Answers the new person's id: the sheet it came from ticks
 * them in or makes them the payer.
 */
export async function addGuestAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId } = requireMember(event);
		return { guestId: addGuest(householdId, String(form.get('name') ?? '')) };
	} catch (error) {
		return failWith(event, error);
	}
}

/** The guest sheet [G5]: a new name, and "Include in new expenses". */
export async function updateGuestAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId } = requireMember(event);
		const guestId = String(form.get('guestId') ?? '');
		const name = form.get('name');
		if (name !== null) renameGuest(householdId, guestId, String(name));
		const include = form.get('includeInNew');
		if (include !== null) setGuestIncludeInNew(householdId, guestId, include === 'on');
		return { guestSaved: guestId };
	} catch (error) {
		return failWith(event, error);
	}
}

/**
 * The guest's link [G5]: the token, made on the first Share link or Copy and
 * the same one after that. The sheet builds the address from it.
 */
export async function guestLinkAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId } = requireMember(event);
		return { token: guestShareToken(householdId, String(form.get('guestId') ?? '')) };
	} catch (error) {
		return failWith(event, error);
	}
}

/** "Make a new link" [G5], after its confirm: the old link stops working. */
export async function renewGuestLinkAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId } = requireMember(event);
		return { token: renewGuestShareToken(householdId, String(form.get('guestId') ?? '')) };
	} catch (error) {
		return failWith(event, error);
	}
}

/** "Remove guest" [G5], once they are settled up. */
export async function removeGuestAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId } = requireMember(event);
		const guestId = String(form.get('guestId') ?? '');
		removeGuest(householdId, guestId);
		return { guestRemoved: guestId };
	} catch (error) {
		return failWith(event, error);
	}
}

/** Owner-only, and only before the first expense (→ DECISIONS #170). */
export async function currencyAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId, member } = requireMember(event);
		setCurrency(householdId, member.id, String(form.get('currency') ?? ''));
		return { currency: true };
	} catch (error) {
		if (error instanceof HouseholdError && error.code === 'not-owner') {
			return fail(403, { error: catalog(event.locals.locale).expenses.settings.ownerOnly });
		}
		return failWith(event, error);
	}
}
