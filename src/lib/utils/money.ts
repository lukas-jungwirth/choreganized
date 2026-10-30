/**
 * Money arithmetic for the expenses ledger (→ SPEC §11, DECISIONS #169).
 *
 * Every amount is an integer of the currency's **minor unit** (cents for EUR,
 * whole yen for JPY), and nothing in here ever holds one in a float: a split
 * that is computed in floats and rounded at the end is how €10 / 3 becomes
 * €10.01. Pure functions only, so the browser (the split sheet's live totals)
 * and the server (which recomputes every split it is sent) run the same code.
 */
import type { SplitMode } from './expenses';
import { AMOUNT_MAX_MAJOR, PERCENT_TOTAL, SHARES_MAX } from './expenses';

/** How many minor-unit digits a currency has: 2 for EUR, 0 for JPY. */
export function minorDigits(currency: string): number {
	return (
		new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
			.maximumFractionDigits ?? 2
	);
}

/** "€24.50" / "24,50 €" — the currency's own symbol, the reader's own number format. */
export function formatMoney(minor: number, currency: string, intlLocale: string): string {
	const digits = minorDigits(currency);
	return new Intl.NumberFormat(intlLocale, {
		style: 'currency',
		currency,
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	}).format(minor / 10 ** digits);
}

/** "€", "CHF", "£" — the mark the amount field sits beside [9b]. */
export function currencySymbol(currency: string, intlLocale: string): string {
	return (
		new Intl.NumberFormat(intlLocale, { style: 'currency', currency })
			.formatToParts(0)
			.find((part) => part.type === 'currency')?.value ?? currency
	);
}

/**
 * Whether the mark follows the number: "12,50 €" (de-DE) rather than "€12.50"
 * (en-US) or "€ 12,50" (de-AT). The amount field puts it where the reader's own
 * formatting does, so the field reads like every amount around it.
 */
export function currencyAfter(currency: string, intlLocale: string): boolean {
	const types = new Intl.NumberFormat(intlLocale, { style: 'currency', currency })
		.formatToParts(1)
		.map((part) => part.type);
	return types.indexOf('currency') > types.indexOf('integer');
}

/**
 * The amount as a person types it back into a field: "24.50" or "24,50", no
 * symbol, no thousands separator. The inverse of `parseAmount`.
 */
export function formatAmountInput(minor: number, currency: string, decimalComma: boolean): string {
	const digits = minorDigits(currency);
	const sign = minor < 0 ? '-' : '';
	const abs = Math.abs(minor);
	const major = Math.floor(abs / 10 ** digits);
	if (digits === 0) return `${sign}${major}`;
	const fraction = String(abs % 10 ** digits).padStart(digits, '0');
	return `${sign}${major}${decimalComma ? ',' : '.'}${fraction}`;
}

/**
 * What was typed, in minor units — or null when it isn't an amount.
 *
 * Either separator works in either language (→ SPEC §11.3): a phone's decimal
 * keypad offers whichever one its locale has, and people paste. The rule that
 * makes that unambiguous: the **last** separator is the decimal point when one
 * or two digits follow it; every other separator groups thousands. So `12,5`,
 * `12.50`, `1.234,50`, `1,234.50` and `1.234.567` all read the way they were
 * meant.
 *
 * A single mark with three digits after it is refused: `12,345` is twelve
 * thousand in one reading and three decimals in the other, and a typo that
 * costs a thousandfold is worse than asking again (→ DECISIONS #203). So is a
 * group that can't open a number, `0,005` or `01.234`.
 *
 * Refuses zero, negatives, more decimals than the currency has, and anything
 * over `AMOUNT_MAX_MAJOR`.
 */
export function parseAmount(text: string, currency: string): number | null {
	const digits = minorDigits(currency);
	const cleaned = text.replace(/[\s\u00a0\u202f]/g, '').replace(/^[^\d.,-]+|[^\d.,-]+$/g, '');
	if (!/^[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return null;

	const last = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
	let whole = cleaned;
	let fraction = '';
	if (last !== -1) {
		const tail = cleaned.slice(last + 1);
		if (tail.length >= 1 && tail.length <= 2) {
			whole = cleaned.slice(0, last);
			fraction = tail;
			// One mark can't be both the decimal point and the thousands group: "12,345,6".
			if (whole.includes(cleaned[last])) return null;
		}
	}

	// Thousands groups are three digits; "1.23.4" is a typo, not a number.
	const groups = whole.split(/[.,]/);
	if (groups.length > 1) {
		if (groups.slice(1).some((group) => group.length !== 3)) return null;
		if (!/^[1-9]\d{0,2}$/.test(groups[0])) return null;
		if (groups.length === 2 && fraction === '') return null;
	}
	whole = groups.join('');
	if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null;
	if (fraction.length > digits) return null;

	const minor = Number(whole || '0') * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0');
	if (!Number.isSafeInteger(minor) || minor <= 0) return null;
	if (minor > AMOUNT_MAX_MAJOR * 10 ** digits) return null;
	return minor;
}

/**
 * A percentage as typed — "30", "33.3", "33,3" — stored ×100 (`PERCENT_SCALE`),
 * so 30% is 3000. Null when it isn't one between 0 and 100 with at most one
 * decimal.
 */
export function parsePercent(text: string): number | null {
	const cleaned = text.trim().replace('%', '').trim().replace(',', '.');
	if (!/^\d{1,3}(\.\d)?$/.test(cleaned)) return null;
	const [whole, fraction = '0'] = cleaned.split('.');
	const scaled = Number(whole) * 100 + Number(fraction) * 10;
	return scaled <= PERCENT_TOTAL ? scaled : null;
}

/** 3000 → "30", 3330 → "33.3" (or "33,3"). */
export function formatPercent(scaled: number, decimalComma = false): string {
	const whole = Math.floor(scaled / 100);
	const tenth = Math.round((scaled % 100) / 10);
	if (tenth === 0) return String(whole);
	return `${whole}${decimalComma ? ',' : '.'}${tenth}`;
}

export type SplitRow = {
	/** The person's ledger id. */
	id: string;
	/**
	 * What was typed for them: minor units (`amounts`), a percentage ×100
	 * (`percent`) or a count (`shares`). Ignored for `equal`.
	 */
	input: number | null;
};

export type SplitResult =
	| { ok: true; shares: { id: string; shareMinor: number; input: number | null }[] }
	| {
			ok: false;
			/**
			 * `empty`: nobody is in. `invalid`: an input that can't be (negative, a
			 * fraction of a share). `remainder`: the inputs don't add up — `missing`
			 * says by how much, positive when something is still to assign, in the
			 * mode's own unit (minor units, or a percentage ×100).
			 */
			reason: 'empty' | 'invalid' | 'remainder';
			missing?: number;
	  };

/**
 * Turns an amount and what was typed per person into each person's share, in
 * minor units, summing **exactly** to the amount (→ DECISIONS #169).
 *
 * Equal, percent and shares are all weights: each share's exact value is
 * `amount × weight / Σ weights`. Each gets the floor of that, and the cents the
 * floors leave over go one each to the largest remainders — ties to whoever is
 * earlier in `rows`, so the same split always rounds the same way. €10 three
 * ways is 3.34 / 3.33 / 3.33, never 3.33 × 3 = 9.99.
 *
 * Amounts are taken as typed and only checked to add up.
 */
export function splitAmount(amountMinor: number, mode: SplitMode, rows: SplitRow[]): SplitResult {
	if (rows.length === 0) return { ok: false, reason: 'empty' };
	if (new Set(rows.map((row) => row.id)).size !== rows.length)
		return { ok: false, reason: 'invalid' };

	if (mode === 'amounts') {
		const inputs = rows.map((row) => row.input ?? 0);
		if (inputs.some((input) => !Number.isSafeInteger(input) || input < 0)) {
			return { ok: false, reason: 'invalid' };
		}
		const total = inputs.reduce((sum, input) => sum + input, 0);
		if (total !== amountMinor)
			return { ok: false, reason: 'remainder', missing: amountMinor - total };
		return {
			ok: true,
			shares: rows.map((row, index) => ({
				id: row.id,
				shareMinor: inputs[index],
				input: inputs[index]
			}))
		};
	}

	const weights = rows.map((row) => (mode === 'equal' ? 1 : (row.input ?? 0)));
	if (weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
		return { ok: false, reason: 'invalid' };
	}
	if (mode === 'shares' && weights.some((weight) => weight < 1 || weight > SHARES_MAX)) {
		return { ok: false, reason: 'invalid' };
	}

	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	if (mode === 'percent' && totalWeight !== PERCENT_TOTAL) {
		return { ok: false, reason: 'remainder', missing: PERCENT_TOTAL - totalWeight };
	}
	if (totalWeight === 0) return { ok: false, reason: 'invalid' };

	return {
		ok: true,
		shares: distribute(amountMinor, weights).map((shareMinor, index) => ({
			id: rows[index].id,
			shareMinor,
			input: mode === 'equal' ? null : rows[index].input
		}))
	};
}

/** Largest-remainder apportionment of `amount` over integer `weights`. */
function distribute(amount: number, weights: number[]): number[] {
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	// Integer arithmetic throughout: amount × weight stays far below 2^53 for
	// any amount the app accepts (10^8 minor units × 10^4).
	const floors = weights.map((weight) => Math.floor((amount * weight) / total));
	const remainders = weights.map((weight, index) => amount * weight - floors[index] * total);

	let left = amount - floors.reduce((sum, floor) => sum + floor, 0);
	const order = weights
		.map((_, index) => index)
		.sort((a, b) => remainders[b] - remainders[a] || a - b);

	for (const index of order) {
		if (left === 0) break;
		floors[index] += 1;
		left -= 1;
	}
	return floors;
}

/** One person's money in or out of the ledger: what they paid, what was theirs. */
export type LedgerEntry = {
	paidById: string;
	amountMinor: number;
	shares: { personId: string; shareMinor: number }[];
};

/**
 * Each person's balance: everything they paid minus their share of everything
 * (→ SPEC §11.6). Positive means they are owed. The balances always sum to
 * zero, because every entry adds its amount once and takes it away once.
 *
 * `people` fixes the order and makes sure someone with no entries still reads 0.
 */
export function netBalances(people: string[], entries: LedgerEntry[]): Map<string, number> {
	const balances = new Map(people.map((id) => [id, 0]));
	const add = (id: string, delta: number) => balances.set(id, (balances.get(id) ?? 0) + delta);

	for (const entry of entries) {
		add(entry.paidById, entry.amountMinor);
		for (const share of entry.shares) add(share.personId, -share.shareMinor);
	}
	return balances;
}

export type Payment = { from: string; to: string; amountMinor: number };

/**
 * The fewest-ish payments that bring every balance to zero (→ SPEC §11.6,
 * DECISIONS #167): the largest debt is paid to the largest credit, then again,
 * until nothing is left. At most n − 1 payments; two people get exactly one or
 * none. Ties follow the order of `balances`, so the suggestion is stable from
 * one load to the next instead of reshuffling who pays whom.
 */
export function settlePayments(balances: Map<string, number>): Payment[] {
	const order = [...balances.keys()];
	const rank = (id: string) => order.indexOf(id);
	const debtors = order
		.filter((id) => (balances.get(id) ?? 0) < 0)
		.map((id) => ({ id, left: -(balances.get(id) ?? 0) }));
	const creditors = order
		.filter((id) => (balances.get(id) ?? 0) > 0)
		.map((id) => ({ id, left: balances.get(id) ?? 0 }));

	const payments: Payment[] = [];
	const byLargest = (a: { id: string; left: number }, b: { id: string; left: number }) =>
		b.left - a.left || rank(a.id) - rank(b.id);

	while (debtors.length > 0 && creditors.length > 0) {
		debtors.sort(byLargest);
		creditors.sort(byLargest);
		const debtor = debtors[0];
		const creditor = creditors[0];
		const amountMinor = Math.min(debtor.left, creditor.left);

		payments.push({ from: debtor.id, to: creditor.id, amountMinor });
		debtor.left -= amountMinor;
		creditor.left -= amountMinor;
		if (debtor.left === 0) debtors.shift();
		if (creditor.left === 0) creditors.shift();
	}
	return payments;
}
