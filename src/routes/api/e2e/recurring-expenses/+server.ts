/**
 * Run the 06:00 recurring-expense sweep for the caller's household now
 * (→ plan 30, `services/expense-recurrences.ts`). **E2E mode only** — the
 * Playwright journey can't wait for a household clock to pass 06:00, and the
 * cron job is the same call behind that gate. Everywhere else this is a 404.
 */
import { error, json } from '@sveltejs/kit';
import { e2eMode } from '$lib/server/e2e-mode';
import { requireMemberApi } from '$lib/server/guards';
import { materializeDue } from '$lib/server/services/expense-recurrences';
import { getHousehold } from '$lib/server/services/household';
import { todayIn } from '$lib/utils/dates';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
	if (!e2eMode()) error(404, 'Not found');
	const { householdId } = requireMemberApi(event);
	const household = getHousehold(householdId);
	if (!household) error(404, 'Not found');

	return json({ logged: materializeDue(householdId, todayIn(household.timezone)).length });
};
