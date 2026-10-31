/**
 * All activity [9f] (→ SPEC §11.12): the whole ledger, searched and filtered
 * by time, payer and categories, grouped by day or by month with what the
 * household spent.
 *
 * Every filter lives in the URL — `?q=`, `?time=` (+ `?start=`/`?end=` for
 * picked dates), `?payer=`, `?category=` (repeated: categories and/or
 * `payments`), and `?from=YYYY-MM-01` for the oldest month "Show more" has
 * reached — so a refresh keeps it and a filter can be linked to (→ DECISIONS #76).
 */
import { requireMember } from '$lib/server/guards';
import {
	filterHistory,
	getExpenseSettings,
	listLedger,
	listPeople,
	personIdFor,
	type HistoryFilters
} from '$lib/server/services/expenses';
import { isCalendarDate } from '$lib/utils/dates';
import { isHistoryRange, parseHistoryCategories } from '$lib/utils/expense-history';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId, member } = requireMember(event);
	const { today } = await event.parent();
	const params = event.url.searchParams;

	const people = listPeople(householdId);
	const me = personIdFor(householdId, member.id);
	const time = params.get('time');
	// Picked dates arrive in whatever order they were typed; keep them in order,
	// and "Pick dates…" with neither date is just all of it.
	const picked = [params.get('start'), params.get('end')].map((date) =>
		isCalendarDate(date) ? date : null
	);
	const [start, end] =
		picked[0] && picked[1] && picked[0] > picked[1] ? [picked[1], picked[0]] : picked;
	const range = isHistoryRange(time) && (time !== 'custom' || start || end) ? time : 'all';
	const payer = params.get('payer');

	const filters: HistoryFilters = {
		query: (params.get('q') ?? '').slice(0, 80),
		range,
		start: range === 'custom' ? start : null,
		end: range === 'custom' ? end : null,
		// Someone who isn't in this household's ledger is ignored, like any unknown value.
		payerId: payer && people.some((row) => row.id === payer) ? payer : null,
		categories: parseHistoryCategories(params.getAll('category'))
	};

	return {
		people,
		me,
		filters,
		currency: getExpenseSettings(householdId).currency,
		...filterHistory(listLedger(householdId, people), filters, today, params.get('from'))
	};
};
