<!--
	The ingredients peek [7b] — the whole list, with the current step's picked out
	in amber so a glance answers "how much of that was it again?".

	A dark `BottomSheet` rather than a second sheet component: the focus trap,
	Escape, the scrim and the scroll lock are the same problem on any background
	(→ `ui/BottomSheet` `tone`).

	Grouped by the recipe's parts, each row with its note under the name
	(→ plan 43); a recipe without parts is one list, as before.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeIngredientRow } from '$lib/server/services/recipes';
	import { groupByPart } from '$lib/utils/recipes';

	type Props = {
		ingredients: RecipeIngredientRow[];
		servings: number | null;
		/**
		 * The ones this step uses — highlighted, not filtered. A row here carries
		 * the *step's* amount, which is the whole row's unless the recipe says the
		 * step takes a share of it (→ SPEC §4.4).
		 */
		used: RecipeIngredientRow[];
		onclose: () => void;
	};

	let { ingredients, servings, used, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});

	const highlighted = $derived(new Map(used.map((ingredient) => [ingredient.id, ingredient])));
	const parts = $derived(groupByPart(ingredients));
	const title = $derived(
		servings ? m.cooking.cook.peekTitleServes(servings) : m.cooking.cook.peekTitle
	);
</script>

<BottomSheet bind:open {title} tone="dark">
	{#if ingredients.length === 0}
		<p class="empty">{m.cooking.cook.peekEmpty}</p>
	{:else}
		{#each parts as part, at (at)}
			{#if part.section}<p class="part">{part.section}</p>{/if}
			<ul class="list">
				{#each part.rows as ingredient (ingredient.id)}
					{@const step = highlighted.get(ingredient.id)}
					{@const amount = m.units.amount((step ?? ingredient).quantity, ingredient.unit)}
					<!-- "1 tbsp of 3 tbsp": the step's share in amber, what the row holds
					 behind it, so the answer to "how much of that was it again?" is the
					 amount for *now* without losing the total. -->
					{@const total =
						step && step.quantity !== ingredient.quantity
							? m.units.amount(ingredient.quantity, ingredient.unit)
							: ''}
					<li class:here={step !== undefined}>
						<span class="dot" aria-hidden="true"></span>
						<span class="name"
							>{ingredient.name}{#if ingredient.note}<span class="note">{ingredient.note}</span
								>{/if}</span
						>
						{#if amount}
							<span class="amount">
								{amount}{#if total}<span class="of">{m.cooking.cook.peekShare(total)}</span>{/if}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/each}
	{/if}
</BottomSheet>

<style>
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 11px 0;
	}

	.list li + li {
		border-top: 1px solid var(--cook-divider);
	}

	/* Bleeds past the sheet's padding so the tint reads as a row, not a label. */
	.here {
		margin: 0 -12px;
		padding-right: 12px;
		padding-left: 12px;
		border-radius: 8px;
		background: var(--cook-amber-tint);
	}

	.here + li,
	.list li + .here {
		border-top-color: transparent;
	}

	.dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--cook-faint);
	}

	.here .dot {
		background: var(--cook-amber);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-17);
		color: var(--cook-text-2);
		overflow-wrap: anywhere;
	}

	/* Typed as "250 g mushrooms", read back as "Mushrooms · 250 g" [7b]. */
	.name::first-letter {
		text-transform: uppercase;
	}

	/* What the line said besides the name (→ plan 43). */
	.note {
		display: block;
		margin-top: 2px;
		font-size: var(--fs-14);
		font-weight: 400;
		line-height: 1.35;
		color: var(--cook-muted);
	}

	/* A part of the dish over its rows, the sheet's own small label. */
	.part {
		margin: 16px 0 4px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cook-muted);
	}

	.part:first-child {
		margin-top: 0;
	}

	.here .name {
		font-weight: 600;
		color: var(--cook-text);
	}

	.amount {
		flex: none;
		font-size: var(--fs-16);
		color: var(--cook-muted);
	}

	.here .amount {
		font-weight: 600;
		color: var(--cook-amber);
	}

	/* The row's total, behind the step's share — quiet, and never bold with it. */
	.of {
		margin-left: 5px;
		font-weight: 400;
		color: var(--cook-muted);
	}

	.empty {
		margin: 0;
		font-size: var(--fs-16);
		line-height: 1.5;
		color: var(--cook-muted);
	}
</style>
