/**
 * All activity [9f] (→ SPEC §11.12): the whole ledger, searched and filtered,
 * grouped by month with what the household spent, a month at a time.
 *
 * Every filter lives in the URL — `?q=`, `?category=`, `?person=`, `?mine=1`,
 * `?payments=1`, `?from=YYYY-MM-01` — so back undoes a filter, a refresh keeps
 * it, and the page works as a plain GET form (→ DECISIONS #76).
 */
import { requireMember } from '$lib/server/guards';
import {
	filterHistory,
	getExpenseSettings,
	listLedger,
	listPeople,
	personIdFor
} from '$lib/server/services/expenses';
import { isExpenseCategory } from '$lib/utils/expenses';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId, member } = requireMember(event);
	const { today } = await event.parent();
	const params = event.url.searchParams;

	const people = listPeople(householdId);
	const me = personIdFor(householdId, member.id);
	const category = params.get('category');
	const person = params.get('person');

	const filters = {
		query: (params.get('q') ?? '').slice(0, 80),
		category: isExpenseCategory(category) ? category : null,
		// A person id that isn't this household's filters to nothing rather than to everything.
		personId: person && people.some((row) => row.id === person) ? person : null,
		mine: params.get('mine') === '1',
		payments: params.get('payments') === '1'
	};

	return {
		people,
		me,
		filters,
		currency: getExpenseSettings(householdId).currency,
		...filterHistory(listLedger(householdId), filters, me, today, params.get('from'))
	};
};
