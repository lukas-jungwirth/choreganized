<!--
	One line of the ledger [9a] [9f]: what it was and who paid, and on the right
	the reader's own part of it — sage when they lent, terracotta when they
	borrowed, quiet when it isn't theirs. A payment has no part to show: its
	title already says who paid whom.

	A link to the detail [9e], so the row is the tap target and back works.
-->
<script lang="ts">
	import RepeatIcon from '$lib/components/icons/RepeatIcon.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpenseItem } from '$lib/server/services/expenses';
	import CategoryIcon from './CategoryIcon.svelte';
	import { yourPart } from './split-draft';

	type Props = {
		item: ExpenseItem;
		/** The reader's ledger person. */
		me: string;
		/** Person id → name. */
		names: Record<string, string>;
		currency: string;
		/** The payment's second line: a time on the tab, a date in History; null says just "Payment". */
		when: string | null;
	};

	let { item, me, names, currency, when }: Props = $props();

	const m = messages();

	const money = (minor: number) => m.expenses.money(minor, currency);
	// Rows name everyone, the reader included — "Lukas paid €42.10" [9a]: the
	// right-hand column is where "you" is spoken.
	const who = (id: string) => names[id] ?? '?';
	const part = $derived(yourPart(item, me));
	const recipient = $derived(item.shares[0]?.personId ?? '');
</script>

<li>
	<a class="row" href="/expenses/{item.id}" data-testid="expense-row">
		<CategoryIcon category={item.category} />
		<span class="text">
			{#if item.kind === 'payment'}
				<span class="title"
					>{m.expenses.row.payment(
						who(item.paidById),
						who(recipient),
						money(item.amountMinor)
					)}</span
				>
				<span class="meta"
					>{when ? m.expenses.row.paymentMeta(when) : m.expenses.row.paymentPlain}</span
				>
			{:else}
				<span class="title-line">
					<span class="title">{item.description}</span>
					{#if item.repeats}
						<span class="repeats" role="img" aria-label={m.expenses.row.repeats}>
							<RepeatIcon size={13} />
						</span>
					{/if}
				</span>
				<span class="meta">{m.expenses.row.paid(who(item.paidById), money(item.amountMinor))}</span>
			{/if}
		</span>
		{#if item.kind === 'expense'}
			<span class="part {part.kind}">
				{#if part.kind === 'none' || part.kind === 'own'}
					<span class="part-label">
						{part.kind === 'own' ? m.expenses.row.justYou : m.expenses.row.notInvolved}
					</span>
				{:else}
					<span class="part-label"
						>{part.kind === 'lent' ? m.expenses.row.lent : m.expenses.row.borrowed}</span
					>
					<span class="part-amount">{money(part.amountMinor)}</span>
				{/if}
			</span>
		{/if}
	</a>
</li>

<style>
	li {
		border-top: 1px solid var(--divider);
	}

	li:first-child {
		border-top: none;
	}

	/* At a large text size there is no room for the words *and* the share beside
	   them, so the share drops under the words (kept to the right) instead of
	   squeezing "Elisabeth paid" into a column narrower than the name. */
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		padding: 12px 15px;
		color: var(--ink);
	}

	.text {
		flex: 1 1 6em;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title {
		overflow: hidden;
		font-size: var(--fs-16);
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	/* The repeat badge sits right after the words, and the words give way to it. */
	.title-line {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.repeats {
		flex: none;
		display: flex;
		color: var(--text-5);
	}

	.meta {
		font-size: var(--fs-14);
		color: var(--text-4);
		font-variant-numeric: tabular-nums;
	}

	.part {
		flex: none;
		margin-left: auto;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		text-align: right;
	}

	.part-label {
		font-size: var(--fs-13);
		font-weight: 600;
	}

	.part-amount {
		font-size: var(--fs-17);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.lent {
		color: var(--owed);
	}

	.borrowed {
		color: var(--owe);
	}

	.none .part-label,
	.own .part-label {
		font-weight: 500;
		color: var(--text-5);
	}
</style>
