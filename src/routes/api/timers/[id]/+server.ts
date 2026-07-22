/**
 * Stop a cook timer — the Cancel button [7h], and the first half of both
 * "+1:00" and Pause, which cancel and then start a fresh one (→ DECISIONS #15).
 *
 * Idempotent on purpose: cancelling a timer that already rang, was already
 * cancelled, or belongs to somebody else all answer 200 with
 * `{ canceled: false }`. The client's question is "is this thing going to buzz
 * me?", and the answer in every one of those cases is no.
 */
import { json } from '@sveltejs/kit';
import { requireMemberApi } from '$lib/server/guards';
import { cancelTimer } from '$lib/server/services/cook-timers';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) => {
	const { householdId, user } = requireMemberApi(event);

	return json({ canceled: cancelTimer(householdId, user.id, event.params.id) });
};
