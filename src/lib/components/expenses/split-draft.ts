/**
 * The split as it is being typed [9b] [9c] — and everything the screens derive
 * from a ledger row — kept apart from the components so the add sheet, the
 * split sheet and Settings read one set of rules.
 *
 * A draft holds **text**, exactly as typed ("20,00", "33,3"), because a field
 * that reformats itself under a thumb is worse than one that is briefly
 * invalid. `draftRows` turns it into what the form posts; the server splits it
 * again on its own (→ DECISIONS #169), and the preview here uses the same
 * `splitAmount`, so what the sheet shows is what gets saved.
 */
import type { ExpenseItem, ExpensePerson, SplitDefault } from '$lib/server/services/expenses';
import type { CalendarDate } from '$lib/utils/dates';
import { PERCENT_TOTAL, type SplitMode } from '$lib/utils/expenses';
import {
	formatAmountInput,
	formatPercent,
	parseAmount,
	parsePercent,
	splitAmount,
	type SplitResult,
	type SplitRow
} from '$lib/utils/money';

export type SplitDraft = {
	mode: SplitMode;
	/** Who is in, in roster order. */
	inIds: string[];
	/** Person id → what is typed in their field, per mode that has fields. */
	inputs: Record<string, string>;
};

/** People a new expense can name: current members, plus anyone still owed or owing. */
export function pickablePeople(
	people: ExpensePerson[],
	balances: Record<string, number>
): ExpensePerson[] {
	return people.filter((person) => person.memberId !== null || (balances[person.id] ?? 0) !== 0);
}

/** Where a new expense starts (→ SPEC §11.5). */
export function draftFromDefault(
	people: ExpensePerson[],
	splitDefault: SplitDefault,
	decimalComma: boolean
): SplitDraft {
	const members = people.filter((person) => person.memberId !== null);
	if (splitDefault.mode === 'equal') {
		return { mode: 'equal', inIds: members.map((person) => person.id), inputs: {} };
	}

	const inIds = members
		.filter((person) => splitDefault.weights[person.id] !== undefined)
		.map((person) => person.id);
	// A default nobody in the house is part of any more starts equal instead.
	if (inIds.length === 0) {
		return { mode: 'equal', inIds: members.map((person) => person.id), inputs: {} };
	}
	return {
		mode: splitDefault.mode,
		inIds,
		inputs: Object.fromEntries(
			inIds.map((id) => [
				id,
				splitDefault.mode === 'percent'
					? formatPercent(splitDefault.weights[id], decimalComma)
					: String(splitDefault.weights[id])
			])
		)
	};
}

/** An existing expense, back into fields [9b-edit]. */
export function draftFromItem(
	item: ExpenseItem,
	currency: string,
	decimalComma: boolean
): SplitDraft {
	return {
		mode: item.splitMode,
		inIds: item.shares.map((share) => share.personId),
		inputs: Object.fromEntries(
			item.shares.map((share) => {
				if (share.input === null) return [share.personId, ''];
				if (item.splitMode === 'amounts') {
					return [share.personId, formatAmountInput(share.input, currency, decimalComma)];
				}
				if (item.splitMode === 'percent') {
					return [share.personId, formatPercent(share.input, decimalComma)];
				}
				return [share.personId, String(share.input)];
			})
		)
	};
}

/** "0", "0,00" — a person who is in for nothing, which `parseAmount` (rightly) refuses. */
const ZERO = /^\s*0+(?:[.,]0*)?\s*$/;

/**
 * What one field is worth in the mode's own unit, or null when it isn't
 * readable yet. An empty field counts as nothing.
 */
function readInput(mode: SplitMode, text: string | undefined, currency: string): number | null {
	const raw = (text ?? '').trim();
	if (mode === 'equal') return null;
	if (raw === '' || ZERO.test(raw)) return mode === 'shares' && raw === '' ? 1 : 0;
	if (mode === 'amounts') return parseAmount(raw, currency);
	if (mode === 'percent') return parsePercent(raw);
	return /^\d{1,2}$/.test(raw) ? Number(raw) : null;
}

/** What the form posts: everyone in, and the number behind their field. */
export function draftRows(draft: SplitDraft, currency: string): SplitRow[] | null {
	const rows: SplitRow[] = [];
	for (const id of draft.inIds) {
		const input = readInput(draft.mode, draft.inputs[id], currency);
		if (draft.mode !== 'equal' && input === null) return null;
		rows.push({ id, input });
	}
	return rows;
}

export type SplitPreview = {
	result: SplitResult | null;
	/** Person id → the money their row shows, whether or not it adds up yet. */
	amounts: Record<string, number>;
	/** What has been assigned so far, in the mode's unit (minor units or percent ×100). */
	assigned: number;
};

/** The sheet's live numbers [9c]: every row shows money, whatever the mode. */
export function previewSplit(
	draft: SplitDraft,
	amountMinor: number,
	currency: string
): SplitPreview {
	const rows = draftRows(draft, currency);
	const amounts: Record<string, number> = {};
	if (!rows) return { result: null, amounts, assigned: 0 };

	const result = splitAmount(amountMinor, draft.mode, rows);
	if (result.ok) {
		for (const share of result.shares) amounts[share.id] = share.shareMinor;
	} else if (draft.mode === 'amounts') {
		for (const row of rows) amounts[row.id] = row.input ?? 0;
	} else if (draft.mode === 'percent') {
		for (const row of rows) {
			amounts[row.id] = Math.floor((amountMinor * (row.input ?? 0)) / PERCENT_TOTAL);
		}
	}

	const assigned =
		draft.mode === 'amounts' || draft.mode === 'percent'
			? rows.reduce((sum, row) => sum + (row.input ?? 0), 0)
			: amountMinor;
	return { result, amounts, assigned };
}

/**
 * "you lent €21.05" / "you borrowed €15.90" / "not involved" [9a] — or, for
 * something you paid that was only yours, "just you": it is not nothing to do
 * with you, it just moves no money.
 */
export function yourPart(
	item: ExpenseItem,
	me: string
): { kind: 'lent' | 'borrowed' | 'own' | 'none'; amountMinor: number } {
	const own = item.shares.find((share) => share.personId === me)?.shareMinor ?? 0;
	if (item.paidById === me) {
		const lent = item.amountMinor - own;
		return lent > 0 ? { kind: 'lent', amountMinor: lent } : { kind: 'own', amountMinor: 0 };
	}
	return own > 0 ? { kind: 'borrowed', amountMinor: own } : { kind: 'none', amountMinor: 0 };
}

/** Rows grouped by the day they fell on, newest first — the order the ledger already has. */
export function groupByDay(items: ExpenseItem[]): { date: CalendarDate; items: ExpenseItem[] }[] {
	const days: { date: CalendarDate; items: ExpenseItem[] }[] = [];
	for (const item of items) {
		const day = days.at(-1);
		if (day && day.date === item.date) day.items.push(item);
		else days.push({ date: item.date, items: [item] });
	}
	return days;
}
