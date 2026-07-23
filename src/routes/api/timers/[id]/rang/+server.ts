/**
 * "The open page rang this one itself."
 *
 * Cook mode posts here the instant its own countdown reaches zero, *before* it
 * vibrates — claiming the same `notifiedAt` flag the server alarm would have
 * claimed, so the phone in your hand is never buzzed twice for one timer
 * (→ `services/cook-timers.ts`).
 *
 * `{ owned: false }` means the server got there first: the page was backgrounded
 * and throttled, the push has already gone out, and the notification is on the
 * lock screen where it belongs.
 */
import { json } from '@sveltejs/kit';
import { requireMemberApi } from '$lib/server/guards';
import { markTimerRung } from '$lib/server/services/cook-timers';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
	const { householdId, user } = requireMemberApi(event);

	return json({ owned: markTimerRung(householdId, user.id, event.params.id) });
};
