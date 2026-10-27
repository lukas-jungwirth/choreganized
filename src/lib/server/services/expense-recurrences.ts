/**
 * Recurring expenses (→ SPEC §11.9, plan 30, DATA-MODEL "expense_recurrences").
 *
 * A series is a template plus the date its next occurrence is due. A series
 * starts from an expense logged with "Repeats" (→ `services/expenses.ts`
 * `createExpense`); from then on the 06:00 sweep (→ `cron.ts`) calls
 * `materializeDue`, which copies the template into an ordinary expense for
 * every due date and moves `nextDate` on.
 *
 * **`nextDate` is the whole memory.** The occurrence and the advance commit in
 * one transaction, and the advance only goes through if `nextDate` still reads
 * what the sweep read — so a server that was down for three months adds three
 * occurrences on its first tick back, and a second sweep (a slow tick, a
 * restart, a second process) adds none (→ DECISIONS #175).
 *
 * Editing a series changes only the occurrences still to come: one already
 * logged is an expense like any other and is edited on its own. Stopping keeps
 * the series row and every occurrence; it only ends the copying.
 */
import { and, asc, count, eq, isNull, lte, TransactionRollbackError } from 'drizzle-orm';
import { addRepeat, isCalendarDate, type CalendarDate } from '$lib/utils/dates';
import {
	isRepeatUnit,
	type ExpenseCategory,
	type RepeatUnit,
	type SplitMode
} from '$lib/utils/expenses';
import { splitAmount } from '$lib/utils/money';
import { db } from '../db';
import { expenseRecurrenceShares, expenseRecurrences, expenses } from '../db/schema';
import { notifyExpense } from './expense-notify';
import {
	ExpenseError,
	listPeople,
	validTemplate,
	writeShares,
	type ExpenseInput,
	type ExpenseShareRow
} from './expenses';

export type SeriesItem = {
	id: string;
	description: string;
	category: ExpenseCategory;
	amountMinor: number;
	paidById: string;
	splitMode: SplitMode;
	/** Everyone in it, what was typed for them, and what that comes to at today's amount. */
	shares: ExpenseShareRow[];
	unit: RepeatUnit;
	/** The day of the month it keeps to (1–31); null for weekly. */
	anchorDay: number | null;
	nextDate: CalendarDate;
	/** Occurrences logged so far and not deleted — "the 11 rents already added" [9h-stop]. */
	occurrences: number;
};

/**
 * A template's rows in the order the split sheet lists people. The order is
 * part of the split: the leftover cent goes to the earliest in the list
 * (→ DECISIONS #169), so an occurrence rounds the way the expense it was
 * started from did — not the way the primary key happens to sort.
 */
function inRosterOrder<T extends { id: string }>(order: Map<string, number>, rows: T[]): T[] {
	return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function rosterOrder(householdId: string): Map<string, number> {
	return new Map(listPeople(householdId).map((person, index) => [person.id, index]));
}

/** Every running series in the household, the soonest due first [9h]. */
export function listSeries(householdId: string): SeriesItem[] {
	return readSeries(householdId, null);
}

/** One running series, or null — stopped, another household's, or never was. */
export function getSeries(householdId: string, id: string): SeriesItem | null {
	return readSeries(householdId, id)[0] ?? null;
}

function readSeries(householdId: string, id: string | null): SeriesItem[] {
	const rows = db
		.select()
		.from(expenseRecurrences)
		.where(
			and(
				eq(expenseRecurrences.householdId, householdId),
				isNull(expenseRecurrences.stoppedAt),
				id === null ? undefined : eq(expenseRecurrences.id, id)
			)
		)
		.orderBy(asc(expenseRecurrences.nextDate), asc(expenseRecurrences.createdAt))
		.all();
	if (rows.length === 0) return [];

	const inputs = db
		.select({
			recurrenceId: expenseRecurrenceShares.recurrenceId,
			personId: expenseRecurrenceShares.personId,
			input: expenseRecurrenceShares.input
		})
		.from(expenseRecurrenceShares)
		.innerJoin(expenseRecurrences, eq(expenseRecurrences.id, expenseRecurrenceShares.recurrenceId))
		.where(
			and(
				eq(expenseRecurrences.householdId, householdId),
				id === null ? undefined : eq(expenseRecurrenceShares.recurrenceId, id)
			)
		)
		.all();

	const logged = new Map(
		db
			.select({ id: expenses.recurrenceId, occurrences: count() })
			.from(expenses)
			.where(and(eq(expenses.householdId, householdId), isNull(expenses.deletedAt)))
			.groupBy(expenses.recurrenceId)
			.all()
			.map((row) => [row.id, row.occurrences])
	);

	const order = rosterOrder(householdId);
	return rows.map((row) => {
		const typed = inRosterOrder(
			order,
			inputs
				.filter((input) => input.recurrenceId === row.id)
				.map((input) => ({ id: input.personId, input: input.input }))
		);
		const split = splitAmount(row.amountMinor, row.splitMode, typed);
		const shareOf = new Map(
			split.ok ? split.shares.map((share) => [share.id, share.shareMinor]) : []
		);

		return {
			id: row.id,
			description: row.description,
			category: row.category,
			amountMinor: row.amountMinor,
			paidById: row.paidById,
			splitMode: row.splitMode,
			shares: typed.map((input) => ({
				personId: input.id,
				shareMinor: shareOf.get(input.id) ?? 0,
				input: input.input
			})),
			unit: row.unit,
			anchorDay: row.anchorDay,
			nextDate: row.nextDate,
			occurrences: logged.get(row.id) ?? 0
		};
	});
}

/**
 * The running series each current member pays or shares in, by member id —
 * what leaving or removing them would stop (→ SPEC §11.13, DECISIONS #178).
 */
export function seriesByMember(householdId: string): Record<string, string[]> {
	const memberOf = new Map(
		listPeople(householdId)
			.filter((person) => person.memberId !== null)
			.map((person) => [person.id, person.memberId as string])
	);
	const named: Record<string, string[]> = {};
	for (const series of listSeries(householdId)) {
		const involved = new Set([series.paidById, ...series.shares.map((share) => share.personId)]);
		for (const personId of involved) {
			const memberId = memberOf.get(personId);
			if (memberId) (named[memberId] ??= []).push(series.description);
		}
	}
	return named;
}

/** How many series are running — the count beside "Recurring" in the tab's ••• [9a-owe]. */
export function countSeries(householdId: string): number {
	return (
		db
			.select({ n: count() })
			.from(expenseRecurrences)
			.where(
				and(eq(expenseRecurrences.householdId, householdId), isNull(expenseRecurrences.stoppedAt))
			)
			.get()?.n ?? 0
	);
}

export type SeriesInput = Omit<ExpenseInput, 'date'> & {
	unit: RepeatUnit;
	/** When the next one is due: today or later. */
	nextDate: CalendarDate;
};

/**
 * "Edit series" [9h-stop] [9e]: the template and its schedule. Occurrences
 * already logged keep what they were logged with (→ SPEC §11.9).
 *
 * The next date may be today — the sweep then adds it on its next tick once it
 * is past 06:00 — but can't be moved earlier: a date that has gone is logged
 * as an expense, not scheduled. One the sweep hasn't reached yet may be kept.
 * Moving the date (or the unit) re-anchors the series on the new day of the
 * month; saving it unchanged keeps the anchor, so a series parked on 28 Feb
 * still goes back to the 31st in March.
 */
export function updateSeries(
	householdId: string,
	id: string,
	input: SeriesInput,
	today: CalendarDate
): void {
	if (!isRepeatUnit(input.unit)) throw new ExpenseError('split');
	if (!isCalendarDate(input.nextDate)) throw new ExpenseError('next-date');

	db.transaction((tx) => {
		const row = tx
			.select()
			.from(expenseRecurrences)
			.where(
				and(
					eq(expenseRecurrences.id, id),
					eq(expenseRecurrences.householdId, householdId),
					isNull(expenseRecurrences.stoppedAt)
				)
			)
			.get();
		if (!row) throw new ExpenseError('not-found');
		// Left as it was, a date already due is fine — the sweep hasn't caught up
		// yet (it is before 06:00, or the server was down). Moved, it must not go
		// back in time.
		if (input.nextDate !== row.nextDate && input.nextDate < today) {
			throw new ExpenseError('next-date');
		}

		const { description, shares } = validTemplate(tx, householdId, input);
		const moved = input.nextDate !== row.nextDate || input.unit !== row.unit;
		const anchorDay =
			input.unit === 'week'
				? null
				: moved || row.anchorDay === null
					? Number(input.nextDate.slice(8, 10))
					: row.anchorDay;

		tx.update(expenseRecurrences)
			.set({
				description,
				category: input.category,
				amountMinor: input.amountMinor,
				paidById: input.paidById,
				splitMode: input.splitMode,
				unit: input.unit,
				anchorDay,
				nextDate: input.nextDate,
				updatedAt: new Date()
			})
			.where(eq(expenseRecurrences.id, id))
			.run();

		tx.delete(expenseRecurrenceShares).where(eq(expenseRecurrenceShares.recurrenceId, id)).run();
		tx.insert(expenseRecurrenceShares)
			.values(shares.map((share) => ({ recurrenceId: id, personId: share.id, input: share.input })))
			.run();
	});
}

/** "Stop repeating" [9h-stop]: no more occurrences; the ones logged stay. */
export function stopSeries(householdId: string, id: string): boolean {
	return (
		db
			.update(expenseRecurrences)
			.set({ stoppedAt: new Date(), updatedAt: new Date() })
			.where(
				and(
					eq(expenseRecurrences.id, id),
					eq(expenseRecurrences.householdId, householdId),
					isNull(expenseRecurrences.stoppedAt)
				)
			)
			.run().changes > 0
	);
}

/**
 * Log every occurrence that is due by `today`, each as an ordinary expense
 * dated the day it was due, and tell the people in it (→ SPEC §11.9, §11.11).
 * Called by the cron tick once the household's clock has passed 06:00, every
 * minute after that — on almost every tick nothing is due and this is one
 * indexed query.
 *
 * @param today the household-local calendar date
 * @returns the ids of the expenses it logged, oldest first
 */
export function materializeDue(householdId: string, today: CalendarDate): string[] {
	const due = db
		.select({ id: expenseRecurrences.id })
		.from(expenseRecurrences)
		.where(
			and(
				eq(expenseRecurrences.householdId, householdId),
				isNull(expenseRecurrences.stoppedAt),
				lte(expenseRecurrences.nextDate, today)
			)
		)
		.orderBy(asc(expenseRecurrences.nextDate))
		.all();

	const logged: string[] = [];
	const order = due.length > 0 ? rosterOrder(householdId) : new Map<string, number>();
	for (const { id } of due) {
		// One occurrence per transaction, until the series is caught up.
		for (;;) {
			let expenseId: string | null;
			try {
				expenseId = logOccurrence(householdId, id, today, order);
			} catch (error) {
				// Another sweep advanced this series first; it logged the occurrence.
				if (error instanceof TransactionRollbackError) break;
				throw error;
			}
			if (!expenseId) break;
			logged.push(expenseId);
		}
	}

	// After every commit, so a push never announces an expense that rolled back.
	for (const expenseId of logged) void notifyExpense(householdId, { kind: 'repeated', expenseId });
	return logged;
}

/**
 * Log the series' next occurrence if it is due, and move `nextDate` on — both
 * or neither. Returns the new expense's id, or null when nothing was due (or
 * another sweep got there first).
 */
function logOccurrence(
	householdId: string,
	id: string,
	today: CalendarDate,
	order: Map<string, number>
): string | null {
	return db.transaction((tx) => {
		const series = tx
			.select()
			.from(expenseRecurrences)
			.where(
				and(
					eq(expenseRecurrences.id, id),
					eq(expenseRecurrences.householdId, householdId),
					isNull(expenseRecurrences.stoppedAt),
					lte(expenseRecurrences.nextDate, today)
				)
			)
			.get();
		if (!series) return null;

		const typed = inRosterOrder(
			order,
			tx
				.select({ id: expenseRecurrenceShares.personId, input: expenseRecurrenceShares.input })
				.from(expenseRecurrenceShares)
				.where(eq(expenseRecurrenceShares.recurrenceId, id))
				.all()
		);
		// Recomputed every time from what was typed, at the template's amount now.
		const split = splitAmount(series.amountMinor, series.splitMode, typed);
		if (!split.ok) {
			// Only a template written around the service could get here. Stopping it
			// beats retrying a broken split every minute for the rest of time.
			console.error(`[expenses] series ${id} no longer splits (${split.reason}); stopped`);
			tx.update(expenseRecurrences)
				.set({ stoppedAt: new Date() })
				.where(eq(expenseRecurrences.id, id))
				.run();
			return null;
		}

		const now = new Date();
		const { id: expenseId } = tx
			.insert(expenses)
			.values({
				householdId,
				kind: 'expense',
				description: series.description,
				category: series.category,
				amountMinor: series.amountMinor,
				date: series.nextDate,
				paidById: series.paidById,
				splitMode: series.splitMode,
				// "Added by" names whoever set the series up [9e].
				createdByMemberId: series.createdByMemberId,
				updatedByMemberId: series.createdByMemberId,
				createdAt: now,
				updatedAt: now,
				recurrenceId: id
			})
			.returning({ id: expenses.id })
			.get();
		writeShares(tx, expenseId, split.shares);

		const advanced = tx
			.update(expenseRecurrences)
			.set({ nextDate: addRepeat(series.nextDate, series.unit, series.anchorDay) })
			.where(and(eq(expenseRecurrences.id, id), eq(expenseRecurrences.nextDate, series.nextDate)))
			.run();
		// Someone else moved it in between: undo the insert rather than log twice.
		if (advanced.changes !== 1) tx.rollback();

		return expenseId;
	});
}
