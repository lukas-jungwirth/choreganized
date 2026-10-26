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
	createExpense,
	createPayment,
	deleteExpense,
	ExpenseError,
	getExpenseSettings,
	restoreExpense,
	setCurrency,
	setSplitDefault,
	updateExpense,
	updatePayment,
	type ExpenseErrorCode
} from '$lib/server/services/expenses';
import { getHousehold, HouseholdError } from '$lib/server/services/household';
import { todayIn } from '$lib/utils/dates';
import { isDefaultSplitMode, isExpenseCategory, isSplitMode } from '$lib/utils/expenses';
import { parseAmount, type SplitRow } from '$lib/utils/money';

const MESSAGE: Record<ExpenseErrorCode, keyof Messages['expenses']['errors']> = {
	amount: 'amount',
	description: 'description',
	date: 'date',
	person: 'person',
	split: 'split',
	'same-person': 'samePerson',
	'not-found': 'notFound',
	currency: 'currency',
	'currency-locked': 'currencyLocked'
};

function failWith(event: RequestEvent, error: unknown) {
	if (!(error instanceof ExpenseError)) throw error;
	return fail(400, {
		error: catalog(event.locals.locale).expenses.errors[MESSAGE[error.code]]
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

/** Create or update an expense [9b]; `id` decides which. */
export async function saveExpenseAction(event: RequestEvent) {
	const form = await event.request.formData();
	try {
		const { householdId, member, today, currency } = context(event);
		const category = String(form.get('category') ?? '');
		const splitMode = String(form.get('splitMode') ?? '');
		if (!isExpenseCategory(category) || !isSplitMode(splitMode)) throw new ExpenseError('split');

		const input = {
			description: String(form.get('description') ?? ''),
			category,
			amountMinor: readAmount(form, currency),
			date: String(form.get('date') ?? '') || today,
			paidById: String(form.get('paidById') ?? ''),
			splitMode,
			rows: readRows(form.get('split'))
		};

		const id = String(form.get('id') ?? '');
		if (id) {
			updateExpense(householdId, member.id, id, input, today);
			return { saved: id };
		}
		return { saved: createExpense(householdId, member.id, input, today) };
	} catch (error) {
		return failWith(event, error);
	}
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
