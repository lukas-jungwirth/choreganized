/**
 * Expenses — who paid, who owes (→ SPEC §11, plan 29, DATA-MODEL "expenses").
 *
 * The ledger is three tables: `ledger_people` (anyone who can pay or share,
 * → DECISIONS #168), `expenses` (an expense or a payment, → #167) and
 * `expense_shares`. Every balance, suggestion and month total is derived from
 * those rows on read; nothing is cached and nothing resets.
 *
 * **The server computes every split.** A form posts what was typed per person
 * (an amount, a percentage, a number of shares) and `splitAmount` turns it into
 * shares here, in the same transaction that writes them — so `Σ shares =
 * amount` holds for every row no matter what a browser sent (→ #169).
 *
 * **The ledger is read whole.** A household logs a few hundred expenses a year;
 * reading them all once per load is cheaper than a second, filtered query path
 * that the balance — which needs every row anyway — couldn't share. History's
 * search and filters therefore run over that read rather than in SQL, which is
 * also what lets the search match "Billa" inside "Wocheneinkauf · Billa" with
 * the reader's own idea of upper and lower case (→ DECISIONS #172).
 */
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import { isCalendarDate, startOfMonth, type CalendarDate } from '$lib/utils/dates';
import {
	AMOUNT_MAX_MAJOR,
	EXPENSE_DESCRIPTION_MAX,
	isCurrency,
	isDefaultSplitMode,
	isExpenseCategory,
	isSplitMode,
	type DefaultSplitMode,
	type ExpenseCategory,
	type ExpenseKind,
	type SplitMode
} from '$lib/utils/expenses';
import {
	minorDigits,
	netBalances,
	settlePayments,
	splitAmount,
	type Payment,
	type SplitRow
} from '$lib/utils/money';
import { db } from '../db';
import { expenseShares, expenses, households, ledgerPeople, members } from '../db/schema';
import { requireOwner, type Transaction } from './household';

export type ExpenseErrorCode =
	/** Not a positive amount, or more than the app takes. */
	| 'amount'
	/** Empty, or longer than `EXPENSE_DESCRIPTION_MAX`. */
	| 'description'
	/** Not a date, or one in the future. */
	| 'date'
	/** A person id that isn't this household's. */
	| 'person'
	/** The split doesn't add up, or nobody is in it. */
	| 'split'
	/** Paying yourself. */
	| 'same-person'
	/** No such expense here (never was, or another household's). */
	| 'not-found'
	/** Not one of the currencies Settings offers. */
	| 'currency'
	/** The household already has expenses in its currency (→ DECISIONS #170). */
	| 'currency-locked';

/** Expected, user-facing failures — actions map these to inline messages. */
export class ExpenseError extends Error {
	constructor(readonly code: ExpenseErrorCode) {
		super(code);
		this.name = 'ExpenseError';
	}
}

/* ── People ───────────────────────────────────────────────────────────────── */

export type ExpensePerson = {
	id: string;
	/** The member's current name, or the snapshot once they have left. */
	name: string;
	color: string;
	/** Null once the membership has ended ("Former member"). */
	memberId: string | null;
	/** Their part of the default split, when it is `percent` / `shares`. */
	defaultWeight: number | null;
};

/**
 * Everyone the ledger knows, current members first in join order (the order
 * avatars stack in), then former members in the order they first appeared.
 * While someone is a member, their row in `members` is the truth for name and
 * colour; `ledger_people` only holds what was true when they left.
 */
export function listPeople(householdId: string): ExpensePerson[] {
	const rows = db
		.select({
			id: ledgerPeople.id,
			snapshotName: ledgerPeople.name,
			snapshotColor: ledgerPeople.color,
			memberId: ledgerPeople.memberId,
			defaultWeight: ledgerPeople.defaultWeight,
			memberName: members.displayName,
			memberColor: members.color,
			joinedAt: members.joinedAt,
			createdAt: ledgerPeople.createdAt
		})
		.from(ledgerPeople)
		.leftJoin(members, eq(ledgerPeople.memberId, members.id))
		.where(eq(ledgerPeople.householdId, householdId))
		.orderBy(asc(ledgerPeople.createdAt), asc(ledgerPeople.id))
		.all();

	const current = rows
		.filter((row) => row.memberId !== null)
		.sort(
			(a, b) =>
				(a.joinedAt?.getTime() ?? 0) - (b.joinedAt?.getTime() ?? 0) ||
				(a.memberId ?? '').localeCompare(b.memberId ?? '')
		);
	const former = rows.filter((row) => row.memberId === null);

	return [...current, ...former].map((row) => ({
		id: row.id,
		name: row.memberName ?? row.snapshotName,
		color: row.memberColor ?? row.snapshotColor,
		memberId: row.memberId,
		defaultWeight: row.defaultWeight
	}));
}

/** The ledger person a member is. Every membership has exactly one. */
export function personIdFor(householdId: string, memberId: string): string {
	const row = db
		.select({ id: ledgerPeople.id })
		.from(ledgerPeople)
		.where(and(eq(ledgerPeople.householdId, householdId), eq(ledgerPeople.memberId, memberId)))
		.get();
	if (!row) throw new Error(`member ${memberId} has no ledger person`);
	return row.id;
}

function peopleIn(tx: Transaction, householdId: string, ids: string[]): Set<string> {
	if (ids.length === 0) return new Set();
	return new Set(
		tx
			.select({ id: ledgerPeople.id })
			.from(ledgerPeople)
			.where(and(eq(ledgerPeople.householdId, householdId), inArray(ledgerPeople.id, ids)))
			.all()
			.map((row) => row.id)
	);
}

/* ── Reading the ledger ───────────────────────────────────────────────────── */

export type ExpenseShareRow = { personId: string; shareMinor: number; input: number | null };

export type ExpenseItem = {
	id: string;
	kind: ExpenseKind;
	/** Null for payments. */
	description: string | null;
	/** Null for payments. */
	category: ExpenseCategory | null;
	amountMinor: number;
	date: CalendarDate;
	paidById: string;
	splitMode: SplitMode;
	/** In the order of `listPeople`, so a split reads the same everywhere. */
	shares: ExpenseShareRow[];
	/** Display names of who logged it and who changed it last — null once they left. */
	createdBy: string | null;
	updatedBy: string | null;
	/** Changed since it was logged. */
	edited: boolean;
	/** Instants — a payment shows its time [9a], the detail who did what when [9e]. */
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Every live expense and payment, newest first (by date, then by when it was
 * logged). The one read the tab, the balance and History all start from.
 */
export function listLedger(
	householdId: string,
	/** The household's `listPeople`, when the caller has it already — it fixes the shares' order. */
	people: ExpensePerson[] = listPeople(householdId)
): ExpenseItem[] {
	const creator = db
		.select({ id: members.id, name: members.displayName })
		.from(members)
		.where(eq(members.householdId, householdId))
		.all();
	const nameOf = new Map(creator.map((member) => [member.id, member.name]));

	const rows = db
		.select()
		.from(expenses)
		.where(and(eq(expenses.householdId, householdId), isNull(expenses.deletedAt)))
		.orderBy(desc(expenses.date), desc(expenses.createdAt), desc(expenses.id))
		.all();
	if (rows.length === 0) return [];

	const order = new Map(people.map((person, index) => [person.id, index]));
	// Joined on the household rather than listing every id: one fixed query
	// however long the ledger gets.
	const shares = db
		.select({
			expenseId: expenseShares.expenseId,
			personId: expenseShares.personId,
			shareMinor: expenseShares.shareMinor,
			input: expenseShares.input
		})
		.from(expenseShares)
		.innerJoin(expenses, eq(expenseShares.expenseId, expenses.id))
		.where(and(eq(expenses.householdId, householdId), isNull(expenses.deletedAt)))
		.all();

	const sharesOf = new Map<string, ExpenseShareRow[]>();
	for (const share of shares) {
		const list = sharesOf.get(share.expenseId) ?? [];
		list.push({ personId: share.personId, shareMinor: share.shareMinor, input: share.input });
		sharesOf.set(share.expenseId, list);
	}

	return rows.map((row) => ({
		id: row.id,
		kind: row.kind,
		description: row.description,
		category: row.category,
		amountMinor: row.amountMinor,
		date: row.date,
		paidById: row.paidById,
		splitMode: row.splitMode,
		shares: (sharesOf.get(row.id) ?? []).sort(
			(a, b) => (order.get(a.personId) ?? 0) - (order.get(b.personId) ?? 0)
		),
		createdBy: row.createdByMemberId ? (nameOf.get(row.createdByMemberId) ?? null) : null,
		updatedBy: row.updatedByMemberId ? (nameOf.get(row.updatedByMemberId) ?? null) : null,
		edited: row.updatedAt.getTime() - row.createdAt.getTime() > 1000,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	}));
}

export type Balances = {
	/** Person id → net balance in minor units; positive = owed. Every person, zeroes included. */
	byPerson: Record<string, number>;
	/** The simplified payments that settle the house (→ SPEC §11.6). */
	payments: Payment[];
};

export function balancesOf(people: ExpensePerson[], ledger: ExpenseItem[]): Balances {
	const balances = netBalances(
		people.map((person) => person.id),
		ledger
	);
	return {
		byPerson: Object.fromEntries(balances),
		payments: settlePayments(balances)
	};
}

/**
 * Each current member's balance, by member id — what leaving or removing them
 * would leave behind (→ SPEC §11.13). Zero for anyone square.
 */
export function balancesByMember(householdId: string): Record<string, number> {
	const people = listPeople(householdId);
	const { byPerson } = balancesOf(people, listLedger(householdId, people));
	return Object.fromEntries(
		people
			.filter((person) => person.memberId !== null)
			.map((person) => [person.memberId, byPerson[person.id] ?? 0])
	);
}

/**
 * Home's one line (→ SPEC §11.13): the reader's balance and who it is with —
 * the other end of each simplified payment that involves them. Null when they
 * are square, which includes a household with no expenses at all.
 */
export function homeBalance(
	householdId: string,
	memberId: string
): { balanceMinor: number; currency: string; with: string[] } | null {
	const people = listPeople(householdId);
	const me = people.find((person) => person.memberId === memberId);
	if (!me) return null;

	const { byPerson, payments } = balancesOf(people, listLedger(householdId, people));
	const balanceMinor = byPerson[me.id] ?? 0;
	if (balanceMinor === 0) return null;

	const nameOf = new Map(people.map((person) => [person.id, person.name]));
	const other = payments
		.filter((payment) => payment.from === me.id || payment.to === me.id)
		.map((payment) => nameOf.get(payment.from === me.id ? payment.to : payment.from) ?? '');

	return {
		balanceMinor,
		currency: getExpenseSettings(householdId).currency,
		with: other
	};
}

/**
 * Past descriptions to complete "What for?" from [9b-suggest], each with the
 * category it was last logged under — newest use first, one row per wording
 * (case-insensitively), so "Billa" and "billa" don't both appear.
 */
export function descriptionSuggestions(
	ledger: ExpenseItem[]
): { description: string; category: ExpenseCategory }[] {
	const seen = new Set<string>();
	const suggestions: { description: string; category: ExpenseCategory }[] = [];

	for (const item of ledger) {
		if (item.kind !== 'expense' || !item.description || !item.category) continue;
		const key = item.description.toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		suggestions.push({ description: item.description, category: item.category });
	}
	return suggestions;
}

/* ── History [9f] ─────────────────────────────────────────────────────────── */

export type HistoryFilters = {
	query: string;
	category: ExpenseCategory | null;
	/** Paid by them, or in the split. */
	personId: string | null;
	/** Only what involves the reader. */
	mine: boolean;
	/** Only settle-ups. */
	payments: boolean;
};

export function involves(item: ExpenseItem, personId: string): boolean {
	return item.paidById === personId || item.shares.some((share) => share.personId === personId);
}

/**
 * What History shows for these filters: the matching rows from the start of
 * `from`'s month to today, grouped by month, plus the next older month that
 * has a match — so "Show September" always reveals something (→ DECISIONS #76,
 * the task history's paging, which this copies).
 */
export function filterHistory(
	ledger: ExpenseItem[],
	filters: HistoryFilters,
	readerPersonId: string,
	today: CalendarDate,
	from: unknown
): {
	months: { month: CalendarDate; spentMinor: number; items: ExpenseItem[] }[];
	from: CalendarDate;
	older: CalendarDate | null;
} {
	const thisMonth = startOfMonth(today);
	const requested = isCalendarDate(from) && from < thisMonth ? startOfMonth(from) : thisMonth;
	const query = filters.query.trim().toLocaleLowerCase();

	const matching = ledger.filter((item) => {
		if (filters.payments && item.kind !== 'payment') return false;
		if (filters.category && item.category !== filters.category) return false;
		if (filters.personId && !involves(item, filters.personId)) return false;
		if (filters.mine && !involves(item, readerPersonId)) return false;
		if (query && !(item.description ?? '').toLocaleLowerCase().includes(query)) return false;
		return true;
	});

	const months: { month: CalendarDate; spentMinor: number; items: ExpenseItem[] }[] = [];
	for (const item of matching) {
		if (item.date < requested) break;
		const month = startOfMonth(item.date);
		let group = months.at(-1);
		if (!group || group.month !== month) {
			group = { month, spentMinor: 0, items: [] };
			months.push(group);
		}
		group.items.push(item);
		if (item.kind === 'expense') group.spentMinor += item.amountMinor;
	}

	const next = matching.find((item) => item.date < requested);
	return { months, from: requested, older: next ? startOfMonth(next.date) : null };
}

/* ── Writing ──────────────────────────────────────────────────────────────── */

export type ExpenseInput = {
	description: string;
	category: ExpenseCategory;
	amountMinor: number;
	date: CalendarDate;
	paidById: string;
	splitMode: SplitMode;
	/** Everyone in the split, and what was typed for them. */
	rows: SplitRow[];
};

export type PaymentInput = {
	fromId: string;
	toId: string;
	amountMinor: number;
	date: CalendarDate;
};

function currencyOf(tx: Transaction, householdId: string): string {
	const row = tx
		.select({ currency: households.currency })
		.from(households)
		.where(eq(households.id, householdId))
		.get();
	if (!row) throw new ExpenseError('not-found');
	return row.currency;
}

function checkAmount(tx: Transaction, householdId: string, amountMinor: number): void {
	const max = AMOUNT_MAX_MAJOR * 10 ** minorDigits(currencyOf(tx, householdId));
	if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > max) {
		throw new ExpenseError('amount');
	}
}

function checkDate(date: string, today: CalendarDate): void {
	if (!isCalendarDate(date) || date > today) throw new ExpenseError('date');
}

/** The expense row, if it is this household's and not deleted. */
function liveExpense(tx: Transaction, householdId: string, id: string) {
	const row = tx
		.select()
		.from(expenses)
		.where(
			and(eq(expenses.id, id), eq(expenses.householdId, householdId), isNull(expenses.deletedAt))
		)
		.get();
	if (!row) throw new ExpenseError('not-found');
	return row;
}

function writeShares(
	tx: Transaction,
	expenseId: string,
	shares: { id: string; shareMinor: number; input: number | null }[]
): void {
	tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId)).run();
	tx.insert(expenseShares)
		.values(
			shares.map((share) => ({
				expenseId,
				personId: share.id,
				shareMinor: share.shareMinor,
				input: share.input
			}))
		)
		.run();
}

function validExpense(
	tx: Transaction,
	householdId: string,
	input: ExpenseInput,
	today: CalendarDate
) {
	const description = input.description.trim();
	if (!description || description.length > EXPENSE_DESCRIPTION_MAX) {
		throw new ExpenseError('description');
	}
	if (!isExpenseCategory(input.category) || !isSplitMode(input.splitMode)) {
		throw new ExpenseError('split');
	}
	checkAmount(tx, householdId, input.amountMinor);
	checkDate(input.date, today);

	const ids = [input.paidById, ...input.rows.map((row) => row.id)];
	const known = peopleIn(tx, householdId, ids);
	if (ids.some((id) => !known.has(id))) throw new ExpenseError('person');

	const split = splitAmount(input.amountMinor, input.splitMode, input.rows);
	if (!split.ok) throw new ExpenseError('split');

	return { description, shares: split.shares };
}

/**
 * Log an expense (→ SPEC §11.3). Any member may log one for anyone, including
 * one they aren't part of: the household trusts itself, and the detail [9e]
 * says who did it.
 */
export function createExpense(
	householdId: string,
	actorMemberId: string,
	input: ExpenseInput,
	today: CalendarDate
): string {
	return db.transaction((tx) => {
		const { description, shares } = validExpense(tx, householdId, input, today);
		const now = new Date();

		const { id } = tx
			.insert(expenses)
			.values({
				householdId,
				kind: 'expense',
				description,
				category: input.category,
				amountMinor: input.amountMinor,
				date: input.date,
				paidById: input.paidById,
				splitMode: input.splitMode,
				createdByMemberId: actorMemberId,
				updatedByMemberId: actorMemberId,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: expenses.id })
			.get();

		writeShares(tx, id, shares);
		return id;
	});
}

export function updateExpense(
	householdId: string,
	actorMemberId: string,
	id: string,
	input: ExpenseInput,
	today: CalendarDate
): void {
	db.transaction((tx) => {
		const row = liveExpense(tx, householdId, id);
		if (row.kind !== 'expense') throw new ExpenseError('not-found');
		const { description, shares } = validExpense(tx, householdId, input, today);

		tx.update(expenses)
			.set({
				description,
				category: input.category,
				amountMinor: input.amountMinor,
				date: input.date,
				paidById: input.paidById,
				splitMode: input.splitMode,
				updatedByMemberId: actorMemberId,
				updatedAt: new Date()
			})
			.where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)))
			.run();

		writeShares(tx, id, shares);
	});
}

function validPayment(
	tx: Transaction,
	householdId: string,
	input: PaymentInput,
	today: CalendarDate
): void {
	checkAmount(tx, householdId, input.amountMinor);
	checkDate(input.date, today);
	if (input.fromId === input.toId) throw new ExpenseError('same-person');
	const known = peopleIn(tx, householdId, [input.fromId, input.toId]);
	if (!known.has(input.fromId) || !known.has(input.toId)) throw new ExpenseError('person');
}

/**
 * Record that money changed hands outside the app [9d]: a row paid by `from`
 * whose one share is `to`'s (→ DECISIONS #167). The app moves no money.
 */
export function createPayment(
	householdId: string,
	actorMemberId: string,
	input: PaymentInput,
	today: CalendarDate
): string {
	return db.transaction((tx) => {
		validPayment(tx, householdId, input, today);
		const now = new Date();

		const { id } = tx
			.insert(expenses)
			.values({
				householdId,
				kind: 'payment',
				amountMinor: input.amountMinor,
				date: input.date,
				paidById: input.fromId,
				splitMode: 'amounts',
				createdByMemberId: actorMemberId,
				updatedByMemberId: actorMemberId,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: expenses.id })
			.get();

		writeShares(tx, id, [{ id: input.toId, shareMinor: input.amountMinor, input: null }]);
		return id;
	});
}

export function updatePayment(
	householdId: string,
	actorMemberId: string,
	id: string,
	input: PaymentInput,
	today: CalendarDate
): void {
	db.transaction((tx) => {
		const row = liveExpense(tx, householdId, id);
		if (row.kind !== 'payment') throw new ExpenseError('not-found');
		validPayment(tx, householdId, input, today);

		tx.update(expenses)
			.set({
				amountMinor: input.amountMinor,
				date: input.date,
				paidById: input.fromId,
				updatedByMemberId: actorMemberId,
				updatedAt: new Date()
			})
			.where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)))
			.run();

		writeShares(tx, id, [{ id: input.toId, shareMinor: input.amountMinor, input: null }]);
	});
}

/**
 * Delete at once, undo for a while (→ SPEC §11.3): the row is only marked, so
 * the undo bar's restore is exact — shares, who logged it, when — rather than a
 * re-creation from whatever the page still had.
 */
export function deleteExpense(householdId: string, id: string): boolean {
	return (
		db
			.update(expenses)
			.set({ deletedAt: new Date() })
			.where(
				and(eq(expenses.id, id), eq(expenses.householdId, householdId), isNull(expenses.deletedAt))
			)
			.run().changes > 0
	);
}

export function restoreExpense(householdId: string, id: string): boolean {
	return (
		db
			.update(expenses)
			.set({ deletedAt: null })
			.where(
				and(
					eq(expenses.id, id),
					eq(expenses.householdId, householdId),
					isNotNull(expenses.deletedAt)
				)
			)
			.run().changes > 0
	);
}

/**
 * What the tab's undo bar names after the detail screen deleted something
 * (→ SPEC §11.3): the row, only if it is this household's and still waiting
 * for its undo — so an old link or a back button can't raise an Undo that
 * would restore nothing.
 */
export function deletedExpense(
	householdId: string,
	id: string
): { id: string; description: string | null } | null {
	const row = db
		.select({ id: expenses.id, description: expenses.description })
		.from(expenses)
		.where(
			and(eq(expenses.id, id), eq(expenses.householdId, householdId), isNotNull(expenses.deletedAt))
		)
		.get();
	return row ?? null;
}

/** The 03:30 cleanup's part (→ `cron.ts`): deletions older than `before` are final. */
export function purgeDeletedExpenses(householdId: string, before: Date): number {
	return db
		.delete(expenses)
		.where(and(eq(expenses.householdId, householdId), lt(expenses.deletedAt, before)))
		.run().changes;
}

/* ── Settings [9c] · Settings → Expenses ──────────────────────────────────── */

export type SplitDefault = {
	mode: DefaultSplitMode;
	/** Person id → weight, only for those in a `percent` / `shares` default. */
	weights: Record<string, number>;
};

export type ExpenseSettings = {
	currency: string;
	splitDefault: SplitDefault;
	/** Once true, the currency can no longer change (→ DECISIONS #170). */
	hasExpenses: boolean;
};

export function getExpenseSettings(householdId: string): ExpenseSettings {
	const household = db
		.select({ currency: households.currency, mode: households.splitDefaultMode })
		.from(households)
		.where(eq(households.id, householdId))
		.get();
	if (!household) throw new ExpenseError('not-found');

	const weights = db
		.select({ id: ledgerPeople.id, weight: ledgerPeople.defaultWeight })
		.from(ledgerPeople)
		.where(and(eq(ledgerPeople.householdId, householdId), isNotNull(ledgerPeople.defaultWeight)))
		.all();

	const any = db
		.select({ id: expenses.id })
		.from(expenses)
		.where(eq(expenses.householdId, householdId))
		.limit(1)
		.get();

	return {
		currency: household.currency,
		splitDefault: {
			mode: household.mode,
			weights:
				household.mode === 'equal'
					? {}
					: Object.fromEntries(weights.map((row) => [row.id, row.weight ?? 0]))
		},
		hasExpenses: Boolean(any)
	};
}

/**
 * The split a new expense starts from (→ SPEC §11.5). Any member may set it —
 * from the split sheet's link as much as from Settings — because it only
 * pre-fills a form everyone can change.
 *
 * `percent` must add up to 100% and `shares` must be whole shares, checked by
 * splitting a nominal amount the same way an expense would be.
 */
export function setSplitDefault(
	householdId: string,
	mode: DefaultSplitMode,
	weights: { personId: string; weight: number }[]
): void {
	if (!isDefaultSplitMode(mode)) throw new ExpenseError('split');

	db.transaction((tx) => {
		if (mode !== 'equal') {
			// Current members only: a default is about the expenses to come, and
			// someone who has left won't be in any of them.
			const current = new Set(
				tx
					.select({ id: ledgerPeople.id })
					.from(ledgerPeople)
					.where(and(eq(ledgerPeople.householdId, householdId), isNotNull(ledgerPeople.memberId)))
					.all()
					.map((row) => row.id)
			);
			if (weights.some((row) => !current.has(row.personId))) throw new ExpenseError('person');
			const check = splitAmount(
				10_000,
				mode,
				weights.map((row) => ({ id: row.personId, input: row.weight }))
			);
			if (!check.ok) throw new ExpenseError('split');
		}

		tx.update(households)
			.set({ splitDefaultMode: mode })
			.where(eq(households.id, householdId))
			.run();
		tx.update(ledgerPeople)
			.set({ defaultWeight: null })
			.where(eq(ledgerPeople.householdId, householdId))
			.run();
		if (mode === 'equal') return;
		for (const { personId, weight } of weights) {
			tx.update(ledgerPeople)
				.set({ defaultWeight: weight })
				.where(and(eq(ledgerPeople.id, personId), eq(ledgerPeople.householdId, householdId)))
				.run();
		}
	});
}

/**
 * Owner-only (→ DECISIONS #10), and only while the household has no expenses
 * at all — deleted ones included, since the undo bar can bring one back
 * (→ DECISIONS #170).
 */
export function setCurrency(householdId: string, actorMemberId: string, currency: string): void {
	if (!isCurrency(currency)) throw new ExpenseError('currency');

	db.transaction((tx) => {
		requireOwner(tx, householdId, actorMemberId);
		const any = tx
			.select({ id: expenses.id })
			.from(expenses)
			.where(eq(expenses.householdId, householdId))
			.limit(1)
			.get();
		if (any) throw new ExpenseError('currency-locked');
		tx.update(households).set({ currency }).where(eq(households.id, householdId)).run();
	});
}
