/**
 * Stop a cook timer — the Cancel button [7h], Stop on one that rang
 * (→ DECISIONS #250), and the first half of Pause, which cancels and later starts
 * a fresh one (→ DECISIONS #15).
 *
 * Idempotent on purpose: stopping a timer that was already stopped, or that
 * belongs to somebody else, answers 200 with `{ canceled: false }`. The client's
 * question is "will this still buzz me or sit on my screen?", and the answer in
 * both cases is no.
 */
import { json } from '@sveltejs/kit';
import { requireMemberApi } from '$lib/server/guards';
import { cancelTimer } from '$lib/server/services/cook-timers';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = (event) => {
	const { householdId, user } = requireMemberApi(event);

	return json({ canceled: cancelTimer(householdId, user.id, event.params.id) });
};
