<!--
	The one thing the tab is for [9a]: are we square? The card's colour is the
	answer — sage when you are owed, terracotta when you owe, a plain card with a
	quiet check when nobody owes anybody.

	Under the number, the payments that would settle the whole house (→ SPEC
	§11.6), each with its own Settle up. Yours come first; payments between the
	others follow, smaller, because they are context rather than a to-do.
-->
<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpensePerson } from '$lib/server/services/expenses';
	import type { Payment } from '$lib/utils/money';

	type Props = {
		/** The reader's balance; positive = owed. */
		balance: number;
		payments: Payment[];
		people: ExpensePerson[];
		me: string;
		currency: string;
		onsettle: (payment: Payment) => void;
	};

	let { balance, payments, people, me, currency, onsettle }: Props = $props();

	const m = messages();

	const byId = $derived(new Map(people.map((person) => [person.id, person])));
	const name = (id: string) => (id === me ? null : (byId.get(id)?.name ?? '?'));
	const mine = $derived(payments.filter((payment) => payment.from === me || payment.to === me));
	const others = $derived(payments.filter((payment) => payment.from !== me && payment.to !== me));
	const tone = $derived(balance > 0 ? 'owed' : balance < 0 ? 'owe' : 'settled');
</script>

{#snippet line(payment: Payment, small: boolean)}
	{@const from = byId.get(payment.from)}
	{@const to = byId.get(payment.to)}
	{@const amount = m.expenses.money(payment.amountMinor, currency)}
	<li class="line" class:small>
		<span class="pair" aria-hidden="true">
			<Avatar name={from?.name} color={from?.color} size={small ? 20 : 24} />
			<ArrowRight size={small ? 13 : 15} strokeWidth={2.2} />
			<Avatar name={to?.name} color={to?.color} size={small ? 20 : 24} />
		</span>
		<span class="who">
			<span class="names">{m.expenses.balance.line(name(payment.from), name(payment.to))}</span>
			<span class="amount">{amount}</span>
		</span>
		<button
			type="button"
			class="settle"
			aria-label={m.expenses.balance.settleLabel(
				m.expenses.balance.settleUp,
				m.expenses.balance.lineLabel(name(payment.from), name(payment.to), amount)
			)}
			onclick={() => onsettle(payment)}
		>
			{m.expenses.balance.settleUp}
		</button>
	</li>
{/snippet}

{#if tone === 'settled'}
	<section class="card settled" data-testid="balance-card">
		<span class="check" aria-hidden="true"><Check size={18} strokeWidth={2.2} /></span>
		<span>
			<h2 class="settled-title">{m.expenses.balance.settled}</h2>
			<p class="settled-detail">{m.expenses.balance.settledDetail}</p>
		</span>
	</section>
{:else}
	<section class="card {tone}" data-testid="balance-card">
		<p class="label">{tone === 'owed' ? m.expenses.balance.owed : m.expenses.balance.owe}</p>
		<p class="total">{m.expenses.money(Math.abs(balance), currency)}</p>
		{#if payments.length > 0}
			<ul class="lines">
				{#each mine as payment (`${payment.from}-${payment.to}`)}
					{@render line(payment, false)}
				{/each}
				{#each others as payment (`${payment.from}-${payment.to}`)}
					{@render line(payment, true)}
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.card {
		margin-bottom: 26px;
		padding: 20px 18px 10px;
		border-radius: 24px;
	}

	.owed {
		--tone: var(--owed);
		background: var(--owed-tint);
	}

	.owe {
		--tone: var(--owe);
		background: var(--owe-tint);
	}

	.label {
		margin: 0 0 2px;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--tone);
	}

	.total {
		margin: 0 0 10px;
		font-family: var(--font-display);
		font-size: calc(44px * var(--fs));
		font-weight: 600;
		line-height: 1.05;
		color: var(--tone);
		font-variant-numeric: tabular-nums;
	}

	.lines {
		margin: 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid color-mix(in srgb, var(--tone) 14%, transparent);
	}

	.line {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 11px 0;
	}

	.line + .line {
		border-top: 1px dashed color-mix(in srgb, var(--tone) 14%, transparent);
	}

	.pair {
		flex: none;
		display: flex;
		align-items: center;
		gap: 3px;
		color: var(--text-5);
	}

	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.names {
		overflow: hidden;
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.amount {
		font-size: calc(16.5px * var(--fs));
		font-weight: 700;
		line-height: 1.15;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.small .names {
		font-size: calc(12.5px * var(--fs));
		font-weight: 500;
		color: var(--text-3);
	}

	.small .amount {
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		color: var(--text-3);
	}

	.settle {
		flex: none;
		padding: 8px 14px;
		border-radius: var(--r-chip);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: calc(13px * var(--fs));
		font-weight: 700;
		color: var(--tone);
	}

	.small .settle {
		padding: 6px 12px;
		font-size: calc(12px * var(--fs));
	}

	.settled {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 20px 18px;
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.check {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--sunken);
		color: var(--text-3);
	}

	.settled-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(26px * var(--fs));
		font-weight: 600;
		line-height: 1.1;
	}

	.settled-detail {
		margin: 3px 0 0;
		font-size: calc(13px * var(--fs));
		color: var(--text-4);
	}
</style>
