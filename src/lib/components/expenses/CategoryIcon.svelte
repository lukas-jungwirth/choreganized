<!--
	A ledger row's icon well [9a]: the category's glyph on a sunken tile, or —
	for a payment, which has no category — the two arrows on a sage disc.
-->
<script lang="ts">
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plane from '@lucide/svelte/icons/plane';
	import ReceiptText from '@lucide/svelte/icons/receipt-text';
	import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
	import Sofa from '@lucide/svelte/icons/sofa';
	import Ticket from '@lucide/svelte/icons/ticket';
	import TramFront from '@lucide/svelte/icons/tram-front';
	import Utensils from '@lucide/svelte/icons/utensils';
	import type { ExpenseCategory } from '$lib/utils/expenses';
	import type { Component } from 'svelte';

	type Props = {
		/** Null is a payment. */
		category: ExpenseCategory | null;
		/** The well's edge; the glyph is half of it. */
		size?: number;
		/** Just the glyph, for a chip [9b]. */
		bare?: boolean;
	};

	let { category, size = 36, bare = false }: Props = $props();

	const ICONS: Record<ExpenseCategory, Component<{ size?: number; strokeWidth?: number }>> = {
		groceries: ShoppingBasket,
		household: Sofa,
		bills: ReceiptText,
		eatingOut: Utensils,
		transport: TramFront,
		leisure: Ticket,
		travel: Plane,
		other: Ellipsis
	};

	const Icon = $derived(category ? ICONS[category] : ArrowLeftRight);
</script>

{#if bare}
	<Icon {size} strokeWidth={1.9} aria-hidden="true" />
{:else}
	<span
		class="well"
		class:payment={category === null}
		style="width: {size}px; height: {size}px"
		aria-hidden="true"
	>
		<Icon size={Math.round(size / 2)} strokeWidth={category ? 1.8 : 2} />
	</span>
{/if}

<style>
	.well {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		background: var(--sunken);
		color: var(--text-3);
	}

	.payment {
		border-radius: 50%;
		background: var(--owed-tint);
		color: var(--sage);
	}
</style>
