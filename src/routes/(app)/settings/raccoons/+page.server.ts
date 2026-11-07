/**
 * The raccoon album (→ plan 35, SPEC §6): every raccoon Home can show, and
 * which of them this member has met there. The list is the code's
 * (`utils/raccoon-album`); the sightings are the member's own.
 */
import { requireMember } from '$lib/server/guards';
import { listSightings, markSightingsNoticed } from '$lib/server/services/raccoons';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const { householdId, member } = requireMember(event);
	const { today, adminMode } = await event.parent();

	const sightings = listSightings(householdId, member.id).map((row) => ({
		raccoon: row.raccoon,
		firstSeenOn: row.firstSeenOn,
		seenCount: row.seenCount,
		isNew: row.noticedAt === null
	}));
	// Read first, so this visit still wears its "New" badges and the next one doesn't.
	markSightingsNoticed(householdId, member.id);

	// Admin mode shows every raccoon, met or not, to check the art and the
	// words (→ DECISIONS #240). Only the view changes: nothing is recorded.
	return { today, sightings, revealAll: adminMode };
};
