<!--
	What this step needs [C2, C3] (→ plan 47): the step's ingredients under its
	text, one row each, the amount in amber, the name, the note in a smaller line
	under it, and "of 500 g" under the amount where the step takes only a share.

	It replaces the 13 px "This step uses…" line, and unlike that line it stays
	while a timer runs: "what goes in now, and how much?" is the question a
	running timer does not answer.

	Cook mode's own rows rather than the recipe view's `RecipeIngredientRow`:
	that one is a light card row with the amount on the right; here the amount
	leads, in amber, on the dark screen, and amount-less ingredients share a line
	("Salz · Pfeffer").
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { StepIngredientLine } from '$lib/utils/cook';

	type Props = {
		lines: StepIngredientLine[];
		/** Tighter rows under a long step, so the two fit one screen (→ `compactList`). */
		compact?: boolean;
	};

	let { lines, compact = false }: Props = $props();

	const m = messages();
</script>

{#if lines.length > 0}
	<ul class="needs" class:compact aria-label={m.cooking.cook.stepNeeds}>
		{#each lines as line (line.key)}
			{@const amount = m.units.amount(line.quantity, line.unit)}
			<li>
				<span class="amount"
					>{amount}{#if line.total}<span class="of"
							>{m.cooking.cook.peekShare(
								m.units.amount(line.total.quantity, line.total.unit)
							)}</span
						>{/if}</span
				>
				<span class="name"
					>{line.names.join(' · ')}{#if line.note}<span class="note">{line.note}</span>{/if}</span
				>
			</li>
		{/each}
	</ul>
{/if}

<style>
	/* One grid for the whole list, so every name starts at the same edge however
	   long the amounts are; capped, so "2 Packungen" at twice the text size
	   cannot squeeze the names into a column of letters. */
	.needs {
		display: grid;
		grid-template-columns: fit-content(45%) 1fr;
		column-gap: 14px;
		margin: 22px 0 0;
		padding: 0;
		border-top: 1px solid var(--cook-divider);
		list-style: none;
	}

	.needs li {
		display: grid;
		grid-column: 1 / -1;
		/* A browser without subgrid (Chrome before 117, Safari before 16) keeps
		   the two columns per row instead of stacking the amount over the name. */
		grid-template-columns: fit-content(45%) 1fr;
		grid-template-columns: subgrid;
		align-items: baseline;
		padding: 11px 0;
		border-bottom: 1px solid var(--cook-divider);
		font-size: var(--fs-20);
		line-height: 1.3;
	}

	.compact {
		margin-top: 12px;
	}

	.compact li {
		padding: 6px 0;
		font-size: var(--fs-18);
		line-height: 1.2;
	}

	.compact .of,
	.compact .note {
		margin-top: 0;
		font-size: var(--fs-15);
	}

	/* "20 g of 40 g" on one line, a line saved per share. */
	.compact .of {
		display: inline;
		margin-left: 5px;
	}

	.amount {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--cook-amber);
		overflow-wrap: anywhere;
	}

	/* The row's total, behind the step's share: quiet, under it. */
	.of {
		display: block;
		font-size: var(--fs-16);
		font-weight: 500;
		color: var(--cook-muted);
	}

	.name {
		min-width: 0;
		color: var(--cook-text);
		overflow-wrap: anywhere;
	}

	.name::first-letter {
		text-transform: uppercase;
	}

	.note {
		display: block;
		margin-top: 2px;
		font-size: var(--fs-16);
		color: var(--cook-muted);
	}
</style>
