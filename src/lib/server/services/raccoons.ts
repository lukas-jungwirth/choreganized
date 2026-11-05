/**
 * The raccoon album (→ plan 35, SPEC §6): which of Home's raccoons a member has
 * met, and how often.
 *
 * Home's `load` records a sighting once it has worked out the pose; the album
 * reads them back. Everything is per member and filtered by household too, like
 * every table (→ ARCHITECTURE "Household scoping").
 */
import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AlbumName } from '$lib/assets/mascot/album';
import type { CalendarDate } from '$lib/utils/dates';
import { WELCOME_RACCOON } from '$lib/utils/raccoon';
import {
	ALBUM_ENTRIES,
	ALBUM_SIZE,
	behindFront,
	countMissing,
	isAlbumName
} from '$lib/utils/raccoon-album';
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
): void {
	if (!isAlbumName(raccoon)) throw new Error(`${raccoon} is not an album raccoon`);

	db.transaction((tx) => {
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

/**
 * Is this the member's first visit to Home (→ DECISIONS #238)? True while they
 * have met no raccoon at all, and for the rest of the slot in which the only one
 * they have met is the welcome raccoon, so a reload right after the first
 * look doesn't swap the greeting for the day's draw. From the next slot on,
 * Home draws as usual.
 */
export function isFirstVisit(householdId: string, memberId: string, slot: string): boolean {
	const met = db
		.select({ raccoon: raccoonSightings.raccoon, lastSlot: raccoonSightings.lastSlot })
		.from(raccoonSightings)
		.where(
			and(eq(raccoonSightings.householdId, householdId), eq(raccoonSightings.memberId, memberId))
		)
		.limit(2)
		.all();
	if (met.length === 0) return true;
	return met.length === 1 && met[0].raccoon === WELCOME_RACCOON && met[0].lastSlot === slot;
}

export type AlbumSummary = {
	found: number;
	total: number;
	/** Unmet ★★ Rare and ★★★ Legendary raccoons. */
	rare: number;
	legendary: number;
	/** The newest find: Home's front card. Null only before the first raccoon. */
	latest: AlbumName | null;
	/** Met since the album was last opened, newest first. */
	unseen: AlbumName[];
	/** The two silhouettes behind the front card. */
	behind: AlbumName[];
};

/** What Home's album card shows (→ SPEC §2): call it after the visit's sighting is in. */
export function albumSummary(householdId: string, memberId: string): AlbumSummary {
	const rows = db
		.select({ raccoon: raccoonSightings.raccoon, noticedAt: raccoonSightings.noticedAt })
		.from(raccoonSightings)
		.where(
			and(
				eq(raccoonSightings.householdId, householdId),
				eq(raccoonSightings.memberId, memberId),
				inAlbum
			)
		)
		// The rowid only breaks a tie within one millisecond: VACUUM may renumber it.
		.orderBy(desc(raccoonSightings.createdAt), desc(sql`rowid`))
		.all();

	const met = rows.map((row) => row.raccoon as AlbumName);
	const latest = met[0] ?? null;

	return {
		found: met.length,
		total: ALBUM_SIZE,
		rare: countMissing(2, met),
		legendary: countMissing(3, met),
		latest,
		unseen: rows.filter((row) => row.noticedAt === null).map((row) => row.raccoon as AlbumName),
		behind: behindFront(met, latest)
	};
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
