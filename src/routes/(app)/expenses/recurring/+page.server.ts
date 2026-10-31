/**
 * Recurring [9h] [9h-stop] (→ SPEC §11.9): every running series, the soonest
 * due first, and the two things to do with one — edit the ones to come, or
 * stop. Reached from the tab's ••• menu. "Add expense" logs through the same
 * `save` the tab uses.
 */
import { requireMember } from '$lib/server/guards';
import {
	saveExpenseAction,
	saveSeriesAction,
	splitDefaultAction,
	stopSeriesAction
} from '$lib/server/expense-actions';
import { listSeries } from '$lib/server/services/expense-recurrences';
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

	// The ledger for what the edit sheet needs around the template: who can be
	// picked (anyone still owed or owing), and the descriptions it completes.
	const people = listPeople(householdId);
	const ledger = listLedger(householdId, people);
	const settings = getExpenseSettings(householdId);

	return {
		series: listSeries(householdId),
		people,
		me: personIdFor(householdId, member.id),
		balances: balancesOf(people, ledger).byPerson,
		currency: settings.currency,
		splitDefault: settings.splitDefault,
		suggestions: descriptionSuggestions(ledger)
	};
};

export const actions: Actions = {
	save: saveExpenseAction,
	saveSeries: saveSeriesAction,
	stop: stopSeriesAction,
	splitDefault: splitDefaultAction
};
