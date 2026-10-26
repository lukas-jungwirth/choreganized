/**
 * Expenses [9a] (→ SPEC §11): the balance, the recent ledger and the sheets that
 * write to it. The actions are shared with the detail screen and Settings
 * (→ `$lib/server/expense-actions.ts`), so a form means the same thing
 * wherever it is posted from.
 */
import { requireMember } from '$lib/server/guards';
import {
	currencyAction,
	deleteExpenseAction,
	restoreExpenseAction,
	saveExpenseAction,
	savePaymentAction,
	splitDefaultAction
} from '$lib/server/expense-actions';
import {
	balancesOf,
	deletedExpense,
	descriptionSuggestions,
	getExpenseSettings,
	listLedger,
	listPeople,
	personIdFor
} from '$lib/server/services/expenses';
import type { Actions, PageServerLoad } from './$types';

/** How much of the ledger the tab shows before "All activity" [9a]. */
const RECENT = 20;

export const load: PageServerLoad = (event) => {
	const { householdId, member } = requireMember(event);

	const people = listPeople(householdId);
	const ledger = listLedger(householdId, people);
	const settings = getExpenseSettings(householdId);

	return {
		people,
		me: personIdFor(householdId, member.id),
		balances: balancesOf(people, ledger),
		recent: ledger.slice(0, RECENT),
		more: ledger.length > RECENT,
		currency: settings.currency,
		splitDefault: settings.splitDefault,
		currencyLocked: settings.hasExpenses,
		suggestions: descriptionSuggestions(ledger),
		/**
		 * The detail screen deletes, then comes here with `?deleted=` for the undo
		 * bar. Only a row that really is deleted, and this household's, gets one.
		 */
		justDeleted: (() => {
			const id = event.url.searchParams.get('deleted');
			return id ? deletedExpense(householdId, id) : null;
		})()
	};
};

export const actions: Actions = {
	save: saveExpenseAction,
	pay: savePaymentAction,
	delete: deleteExpenseAction,
	restore: restoreExpenseAction,
	splitDefault: splitDefaultAction,
	currency: currencyAction
};
