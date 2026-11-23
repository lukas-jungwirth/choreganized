<!--
	One ingredient as the recipe shows it [7a] [V1] (→ plan 43): a dot, the name
	(what you buy) with its note in a smaller line under it, the amount at the
	right. The recipe view and the import's review [R1] [R2] (→ plan 45) both
	draw it, so the review shows the recipe as it will look and the two cannot
	drift apart.

	In the review a row is a button (tapping it edits that one ingredient), and
	what the import asks about it stands under the row (`children`). Goes in a
	`<ul>`; the divider between rows is its own.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		name: string;
		note?: string | null;
		/** The amount as printed ("500 g", "2 Zehen"); empty for none. */
		amount: string;
		/** Tapping the row edits it (the review); absent: plain text (the recipe). */
		onclick?: () => void;
		/** The button's name for a screen reader, when the row is one. */
		label?: string;
		/** What stands under the row: the review's question about it. */
		children?: Snippet;
	};

	let { name, note = null, amount, onclick, label, children }: Props = $props();
</script>

<li>
	{#if onclick}
		<button type="button" class="row" aria-label={label} {onclick}>{@render body()}</button>
	{:else}
		<div class="row">{@render body()}</div>
	{/if}
	{@render children?.()}
</li>

{#snippet body()}
	<span class="dot" aria-hidden="true"></span>
	<span class="ingredient-name"
		>{name}{#if note}<span class="ingredient-note">{note}</span>{/if}</span
	>
	{#if amount}<span class="amount">{amount}</span>{/if}
{/snippet}

<style>
	li {
		padding: 13px 16px;
	}

	li:not(:first-child) {
		border-top: 1px solid var(--divider);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		text-align: left;
	}

	.dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--border-dashed);
	}

	.ingredient-name {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-16);
		overflow-wrap: anywhere;
	}

	/* Typed as "400 g pasta", read back as "Pasta · 400 g" [7a]. */
	.ingredient-name::first-letter {
		text-transform: uppercase;
	}

	/* Everything the line said besides what you buy (→ plan 43, [V1]). */
	.ingredient-note {
		display: block;
		margin-top: 2px;
		font-size: var(--fs-14);
		line-height: 1.35;
		color: var(--text-4);
	}

	.amount {
		flex: none;
		font-size: var(--fs-15);
		color: var(--text-4);
	}
</style>
