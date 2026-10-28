/**
 * Expense notifications (→ SPEC §11.11, plan 30): the people an expense is
 * about hear about it, in their own language — and nobody else, and never the
 * one who did it.
 *
 *   added      "Elisabeth added Weekly shop · €42.10 · your share €21.05"
 *   changed    "Elisabeth changed Weekly shop · your share is now €18.00"
 *   paid       "Lukas paid you €24.50"
 *   repeated   "Rent was added · your share €450.00"
 *   reminder   "A nudge from Lukas · you owe €24.50"
 *
 * Split in two on purpose. `expenseNotices` answers "who is told what?" from
 * the committed rows, synchronously, and is what the integration tests read;
 * `notifyExpense` hands that list to `push.ts` and never throws. Called by the
 * services after their transaction commits (`services/expenses.ts`,
 * `services/expense-recurrences.ts`), fire-and-forget like every other
 * event-driven push (→ docs/ARCHITECTURE.md "Notifications").
 *
 * No digest and no automatic "you still owe" nagging: the balance card is the
 * reminder. The one exception is a nudge somebody sends by hand from it
 * (`reminderNotices`) — a person asking, not the app.
 */
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../db';
import { expenseShares, expenses, households, ledgerPeople, members } from '../db/schema';
import { hasDevice, sendToUser, type PayloadFor } from '../push';
import type { Payment } from '$lib/utils/money';

export type ExpenseEvent =
	/** Someone logged an expense by hand [9b]. */
	| { kind: 'added'; expenseId: string; actorMemberId: string }
	/** Someone edited one; `before` is each person's share until then, in minor units. */
	| {
			kind: 'changed';
			expenseId: string;
			actorMemberId: string;
			before: Record<string, number>;
	  }
	/** Someone recorded a settle-up [9d]. */
	| { kind: 'paid'; expenseId: string; actorMemberId: string }
	/** The 06:00 sweep logged an occurrence of a series — nobody did this one. */
	| { kind: 'repeated'; expenseId: string };

export type ExpenseNotice = {
	memberId: string;
	userId: string;
	payload: PayloadFor;
};

/**
 * Who hears about `event`, and what each of them reads. Empty when the expense
 * has gone (deleted between the save and this read), when it involves nobody
 * but the actor, or when everyone in it switched expense notifications off.
 *
 * Only current members can be told: a former member's ledger person has no
 * account behind it any more.
 */
export function expenseNotices(householdId: string, event: ExpenseEvent): ExpenseNotice[] {
	const expense = db
		.select({
			id: expenses.id,
			kind: expenses.kind,
			description: expenses.description,
			amountMinor: expenses.amountMinor,
			paidById: expenses.paidById,
			currency: households.currency
		})
		.from(expenses)
		.innerJoin(households, eq(households.id, expenses.householdId))
		.where(
			and(
				eq(expenses.id, event.expenseId),
				eq(expenses.householdId, householdId),
				isNull(expenses.deletedAt)
			)
		)
		.get();
	// A payment is only ever announced as one, and an expense never as a payment.
	if (!expense || expense.kind !== (event.kind === 'paid' ? 'payment' : 'expense')) return [];

	const shares = new Map(Object.entries(sharesOf(expense.id)));

	// Each person this event is news to, with the share their sentence names.
	const told = new Map<string, number>();
	switch (event.kind) {
		case 'added':
		case 'repeated':
			for (const [personId, shareMinor] of shares)
				if (shareMinor > 0) told.set(personId, shareMinor);
			break;
		case 'changed':
			// Only those whose own money moved — taken out of it ("is now €0.00")
			// and newly put in count, a new description doesn't.
			for (const personId of new Set([...shares.keys(), ...Object.keys(event.before)])) {
				const now = shares.get(personId) ?? 0;
				if (now !== (event.before[personId] ?? 0)) told.set(personId, now);
			}
			break;
		case 'paid':
			// A payment's one share is its recipient's (→ DECISIONS #167).
			for (const [personId, shareMinor] of shares) told.set(personId, shareMinor);
			break;
	}
	if (told.size === 0) return [];

	const people = reachable(householdId);

	const actorId = event.kind === 'repeated' ? null : event.actorMemberId;
	const actor = people.find((person) => person.memberId === actorId);
	// A payment is announced by who paid, which needn't be who recorded it.
	const payerName =
		people.find((person) => person.personId === expense.paidById)?.name ??
		db
			.select({ name: ledgerPeople.name })
			.from(ledgerPeople)
			.where(eq(ledgerPeople.id, expense.paidById))
			.get()?.name ??
		'';

	const recipients = people.filter(
		(person) => told.has(person.personId) && person.memberId !== actorId && person.notify
	);

	const description = expense.description ?? '';
	const tag = `expense-${expense.id}`;
	const url = `/expenses/${expense.id}`;

	return recipients.map((person) => {
		const shareMinor = told.get(person.personId) ?? 0;
		const payload: PayloadFor = (m) => {
			const money = (minor: number) => m.expenses.money(minor, expense.currency);
			switch (event.kind) {
				case 'added':
					return {
						title: m.push.expenseAdded(
							actor?.name ?? '',
							description,
							money(expense.amountMinor),
							money(shareMinor)
						),
						tag,
						url
					};
				case 'changed':
					// Replaces the "added" on the lock screen, so buzz again.
					return {
						title: m.push.expenseChanged(actor?.name ?? '', description, money(shareMinor)),
						tag,
						url,
						renotify: true
					};
				case 'paid':
					return { title: m.push.paidYou(payerName, money(expense.amountMinor)), tag, url };
				case 'repeated':
					return { title: m.push.expenseRepeated(description, money(shareMinor)), tag, url };
			}
		};
		return { memberId: person.memberId, userId: person.userId, payload };
	});
}

/**
 * Send `event`'s notices. Never throws and never rejects — a push service
 * having a bad afternoon must not fail a save that has already committed.
 *
 * @returns how many devices took one; 0 is a normal answer
 */
export async function notifyExpense(householdId: string, event: ExpenseEvent): Promise<number> {
	try {
		return await sendNotices(expenseNotices(householdId, event));
	} catch (error) {
		console.error('[push] expense notification failed:', error);
		return 0;
	}
}

/**
 * The people a notice can reach: current members, each with their ledger
 * person and whether they take expense notifications. A former member's ledger
 * person has no account behind it any more.
 */
function reachable(householdId: string) {
	return db
		.select({
			personId: ledgerPeople.id,
			memberId: members.id,
			userId: members.userId,
			name: members.displayName,
			notify: members.notifyExpenses
		})
		.from(ledgerPeople)
		.innerJoin(members, eq(members.id, ledgerPeople.memberId))
		.where(and(eq(ledgerPeople.householdId, householdId), isNotNull(ledgerPeople.memberId)))
		.all();
}

/** A reminder knows whose ledger person it is for — the card marks them "Reminded". */
export type ReminderNotice = ExpenseNotice & { personId: string };

/**
 * The Remind on the balance card [10a] (→ SPEC §11.2, §11.11): each person who
 * owes the reminder's sender, by the simplified payments the card shows, hears
 * "A nudge from Lukas · you owe €24.50" — the amount their own card shows them.
 * `only` narrows it to one of them; null is "Remind everyone".
 *
 * Gentle by construction: one tag per sender, so a second nudge replaces the
 * first on a lock screen instead of stacking up, without buzzing again. Only
 * current members can hear one: with expense notifications on, and a device
 * to hear it on. `owing` counts who was meant, heard or not — zero means the
 * card the tap came from was out of date, not that anybody is muted.
 */
export function reminderNotices(
	householdId: string,
	actorMemberId: string,
	payments: Payment[],
	only: string | null
): { owing: number; notices: ReminderNotice[] } {
	const household = db
		.select({ currency: households.currency })
		.from(households)
		.where(eq(households.id, householdId))
		.get();
	const people = reachable(householdId);
	const actor = people.find((person) => person.memberId === actorMemberId);
	if (!household || !actor) return { owing: 0, notices: [] };

	const owed = payments.filter(
		(payment) => payment.to === actor.personId && (only === null || payment.from === only)
	);
	const notices = owed.flatMap((payment) => {
		const person = people.find((candidate) => candidate.personId === payment.from);
		if (!person?.notify || !hasDevice(person.userId)) return [];
		const payload: PayloadFor = (m) => ({
			title: m.push.reminder(actor.name, m.expenses.money(payment.amountMinor, household.currency)),
			tag: `expense-reminder-${actor.personId}`,
			url: '/expenses'
		});
		return [
			{ personId: person.personId, memberId: person.memberId, userId: person.userId, payload }
		];
	});
	return { owing: owed.length, notices };
}

/**
 * Send what `expenseNotices` / `reminderNotices` decided.
 *
 * @returns how many devices took one; 0 is a normal answer
 */
export async function sendNotices(notices: ExpenseNotice[]): Promise<number> {
	const delivered = await Promise.all(
		notices.map((notice) => sendToUser(notice.userId, notice.payload))
	);
	return delivered.reduce((total, count) => total + count, 0);
}

/** Each person's share of an expense, for the `changed` event's `before`. */
export function sharesOf(expenseId: string): Record<string, number> {
	return Object.fromEntries(
		db
			.select({ personId: expenseShares.personId, shareMinor: expenseShares.shareMinor })
			.from(expenseShares)
			.where(eq(expenseShares.expenseId, expenseId))
			.all()
			.map((row) => [row.personId, row.shareMinor])
	);
}
