/**
 * One expense or payment [9e]: every share, who paid, who logged it and who
 * changed it last. Edit opens the same sheet the tab does and posts the same
 * actions (→ `$lib/server/expense-actions.ts`).
 */
import { error } from '@sveltejs/kit';
import { catalog } from '$lib/i18n';
import { requireMember } from '$lib/server/guards';
import {
	deleteExpenseAction,
	saveExpenseAction,
	savePaymentAction,
	saveSeriesAction,
	splitDefaultAction
} from '$lib/server/expense-actions';
import { getSeries } from '$lib/server/services/expense-recurrences';
import {
	balancesOf,
	descriptionSuggestions,
	getExpenseSettings,
	listLedger,
	listPeople,
	personIdFor
} from '$lib/server/services/expenses';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	const { householdId, member } = requireMember(event);

	// The whole ledger, not one row: the edit sheet completes descriptions from
	// it and the settle sheet names what is owed, and the lookup is the scoping —
	// another household's id simply isn't in it.
	const people = listPeople(householdId);
	const ledger = listLedger(householdId, people);
	const item = ledger.find((row) => row.id === event.params.id);
	if (!item) error(404, catalog(event.locals.locale).expenses.errors.notFound);

	const settings = getExpenseSettings(householdId);

	return {
		item,
		people,
		me: personIdFor(householdId, member.id),
		balances: balancesOf(people, ledger),
		currency: settings.currency,
		splitDefault: settings.splitDefault,
		suggestions: descriptionSuggestions(ledger),
		/** The running series it came from — "Repeats monthly · Edit series" [9e]. */
		series: item.repeats && item.recurrenceId ? getSeries(householdId, item.recurrenceId) : null
	};
};

export const actions: Actions = {
	save: saveExpenseAction,
	pay: savePaymentAction,
	delete: deleteExpenseAction,
	saveSeries: saveSeriesAction,
	splitDefault: splitDefaultAction
};
