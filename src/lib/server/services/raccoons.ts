/**
 * The raccoon album (→ plan 35, SPEC §6): which of Home's raccoons a member has
 * met, and how often.
 *
 * Home's `load` records a sighting once it has worked out the pose; the album
 * reads them back. Everything is per member and filtered by household too, like
 * every table (→ ARCHITECTURE "Household scoping").
 */
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import type { CalendarDate } from '$lib/utils/dates';
import { ALBUM_ENTRIES, ALBUM_SIZE, isAlbumName } from '$lib/utils/raccoon-album';
import { db } from '../db';
import { raccoonSightings, type RaccoonSighting } from '../db/schema';

/**
 * Only raccoons still in the album count: a pose retired from Home keeps its
 * rows (it was met), but "40 of 39" is not a thing to show.
 */
const inAlbum = inArray(
	raccoonSightings.raccoon,
	ALBUM_ENTRIES.map((entry) => entry.name)
);

export type Sighting = {
	/** The first time this member met it. */
	isNew: boolean;
	/** How many album raccoons they have met, this one included. */
	found: number;
	total: number;
};

/**
 * One sighting of `raccoon` in `slot` (→ `utils/raccoon` `homeSlot`). The first
 * inserts the row; one in a later slot counts once more; one in the slot
 * already recorded changes nothing, so reloading Home all evening is one
 * sighting. A name that isn't in the album (a section raccoon) is refused.
 */
export function recordSighting(
	householdId: string,
	memberId: string,
	raccoon: string,
	today: CalendarDate,
	slot: string
): Sighting {
	if (!isAlbumName(raccoon)) throw new Error(`${raccoon} is not an album raccoon`);

	return db.transaction((tx) => {
		const mine = and(
			eq(raccoonSightings.householdId, householdId),
			eq(raccoonSightings.memberId, memberId)
		);
		const existing = tx
			.select()
			.from(raccoonSightings)
			.where(and(mine, eq(raccoonSightings.raccoon, raccoon)))
			.get();

		if (!existing) {
			tx.insert(raccoonSightings)
				.values({ householdId, memberId, raccoon, firstSeenOn: today, lastSlot: slot })
				.run();
		} else if (existing.lastSlot !== slot) {
			tx.update(raccoonSightings)
				.set({ seenCount: existing.seenCount + 1, lastSlot: slot })
				.where(eq(raccoonSightings.id, existing.id))
				.run();
		}

		const found = tx
			.select({ found: count() })
			.from(raccoonSightings)
			.where(and(mine, inAlbum))
			.get()!.found;
		return { isNew: !existing, found, total: ALBUM_SIZE };
	});
}

/** Every album raccoon this member has met, for the album. */
export function listSightings(householdId: string, memberId: string): RaccoonSighting[] {
	return db
		.select()
		.from(raccoonSightings)
		.where(
			and(
				eq(raccoonSightings.householdId, householdId),
				eq(raccoonSightings.memberId, memberId),
				inAlbum
			)
		)
		.all();
}

/** How many they have met — the Settings row's "17 of 39". */
export function countSightings(householdId: string, memberId: string): number {
	return db
		.select({ found: count() })
		.from(raccoonSightings)
		.where(
			and(
				eq(raccoonSightings.householdId, householdId),
				eq(raccoonSightings.memberId, memberId),
				inAlbum
			)
		)
		.get()!.found;
}

/**
 * The album has shown them everything it has: the "New" badges go. Called by
 * the album's `load` after it has read the rows, so this visit still shows
 * them and the next one doesn't.
 */
export function markSightingsNoticed(
	householdId: string,
	memberId: string,
	now: Date = new Date()
): void {
	db.update(raccoonSightings)
		.set({ noticedAt: now })
		.where(
			and(
				eq(raccoonSightings.householdId, householdId),
				eq(raccoonSightings.memberId, memberId),
				isNull(raccoonSightings.noticedAt)
			)
		)
		.run();
}
