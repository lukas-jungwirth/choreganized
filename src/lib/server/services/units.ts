/**
 * The household's own units (→ plan 44, DECISIONS #321): the words it counts in
 * besides the eight units and the counting words the shared reader knows
 * (`utils/amounts.ts`). A word is added on purpose (the import review's "New
 * unit: Ring. Add it?", the editor's unit panel of plan 46), never by a guess.
 *
 * The reader takes these words as its `known` set (`parseIngredient(line,
 * known)`), and the AI import lists them in its prompt beside the others.
 * Every function takes `householdId` first and stays inside it.
 */
import { and, asc, eq } from 'drizzle-orm';
import {
	countingBase,
	countingWord,
	householdUnitKey,
	isKnownUnitWord,
	unitFromWord,
	unitWordKey,
	UNIT_WORD_MAX
} from '$lib/utils/amounts';
import { db } from '../db';
import { householdUnits } from '../db/schema';

export type HouseholdUnit = { id: string; word: string };

export type UnitErrorCode =
	/** Empty, too long, or not a word ("2", "g/ml"). */
	| 'invalid'
	/** One of the eight, a counting word the reader knows, or already the household's. */
	| 'known';

export class UnitError extends Error {
	constructor(readonly code: UnitErrorCode) {
		super(code);
		this.name = 'UnitError';
	}
}

/** The household's words, oldest first. */
export function listUnits(householdId: string): HouseholdUnit[] {
	return db
		.select({ id: householdUnits.id, word: householdUnits.word })
		.from(householdUnits)
		.where(eq(householdUnits.householdId, householdId))
		.orderBy(asc(householdUnits.addedAt), asc(householdUnits.word))
		.all();
}

/** The household's words as the reader's `known` set: lowercased. */
export function knownUnitWords(householdId: string): Set<string> {
	return new Set(listUnits(householdId).map((unit) => unitWordKey(unit.word)));
}

/** The household's words by their lowercased key, each as it was added ("ring" → "Ring"). */
export function unitSpellings(householdId: string): Map<string, string> {
	return new Map(listUnits(householdId).map((unit) => [unitWordKey(unit.word), unit.word]));
}

/**
 * A word that is on the list already, as a row stores it: one of the eight by
 * its key, a counting word in its one form, or the household's own word as
 * added (`own`). Null for a word on no list (→ plan 46, "Add your own").
 */
export function existingUnit(
	householdId: string,
	raw: string
): { word: string; own: boolean } | null {
	const word = raw.replace(/\s+/g, ' ').trim();
	if (!word) return null;
	const unit = unitFromWord(word);
	if (unit) return { word: unit, own: false };
	if (countingWord(word)) return { word: countingBase(word), own: false };
	const key = householdUnitKey(word, knownUnitWords(householdId));
	const spelling = key ? unitSpellings(householdId).get(key) : undefined;
	return spelling ? { word: spelling, own: true } : null;
}

/** Add a word; refuses one that is no word or that the list already has. */
export function addUnit(householdId: string, memberId: string | null, raw: string): HouseholdUnit {
	const word = raw.replace(/\s+/g, ' ').trim();
	if (!word || word.length > UNIT_WORD_MAX || !/^\p{L}[\p{L}.-]*$/u.test(word)) {
		throw new UnitError('invalid');
	}
	const wordKey = unitWordKey(word);
	if (isKnownUnitWord(word) || householdUnitKey(word, knownUnitWords(householdId))) {
		throw new UnitError('known');
	}

	const [row] = db
		.insert(householdUnits)
		.values({ householdId, word, wordKey, addedBy: memberId })
		.onConflictDoNothing()
		.returning({ id: householdUnits.id, word: householdUnits.word })
		.all();
	if (!row) throw new UnitError('known');
	return row;
}

/** Remove one of the household's words; another household's id does nothing. */
export function removeUnit(householdId: string, id: string): boolean {
	const result = db
		.delete(householdUnits)
		.where(and(eq(householdUnits.householdId, householdId), eq(householdUnits.id, id)))
		.run();
	return result.changes > 0;
}
