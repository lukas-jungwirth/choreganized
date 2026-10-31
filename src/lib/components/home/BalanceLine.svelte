<!--
	Home's one line about money [8b · expenses] (→ SPEC §11.13): "You're owed
	€24.50 · Elisabeth" or "You owe Elisabeth €12.00", linking to the tab. The
	page shows it only while the reader isn't square, so Home doesn't grow a
	tile for a ledger that is at rest.
-->
<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ReceiptIcon from '$lib/components/icons/ReceiptIcon.svelte';
	import { messages } from '$lib/i18n';

	type Props = {
		balance: { balanceMinor: number; currency: string; with: string[] };
	};

	let { balance }: Props = $props();

	const m = messages();

	const amount = $derived(m.expenses.money(Math.abs(balance.balanceMinor), balance.currency));
	const names = $derived(balance.with.join(', '));
	const owed = $derived(balance.balanceMinor > 0);
</script>

<a class="line" href="/expenses" data-testid="home-balance">
	<span class="icon" aria-hidden="true"><ReceiptIcon size={19} strokeWidth={1.8} /></span>
	<span class="text">
		{#each owed ? m.expenses.home.owed(amount, names) : m.expenses.home.owe(names, amount) as part}{#if part.strong}<b
					class:owed
					class:owe={!owed}>{part.text}</b
				>{:else}{part.text}{/if}{/each}
	</span>
	<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
</a>

<style>
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--text-5);
	}

	.icon {
		display: flex;
		color: var(--text-3);
	}

	.text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.owed {
		color: var(--owed);
	}

	.owe {
		color: var(--owe);
	}
</style>
