<!--
	The ingredients peek [7b] — the whole list, with the current step's picked out
	in amber so a glance answers "how much of that was it again?".

	A dark `BottomSheet` rather than a second sheet component: the focus trap,
	Escape, the scrim and the scroll lock are the same problem on any background
	(→ `ui/BottomSheet` `tone`).
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import type { RecipeIngredientRow } from '$lib/server/services/recipes';
	import { formatAmount } from '$lib/utils/ingredients';

	type Props = {
		ingredients: RecipeIngredientRow[];
		servings: number | null;
		/** The ones this step names — highlighted, not filtered. */
		used: RecipeIngredientRow[];
		onclose: () => void;
	};

	let { ingredients, servings, used, onclose }: Props = $props();

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});

	const highlighted = $derived(new Set(used.map((ingredient) => ingredient.id)));
	const title = $derived(servings ? `Ingredients · serves ${servings}` : 'Ingredients');
</script>

<BottomSheet bind:open {title} tone="dark">
	{#if ingredients.length === 0}
		<p class="empty">This recipe doesn't list any ingredients.</p>
	{:else}
		<ul class="list">
			{#each ingredients as ingredient (ingredient.id)}
				{@const here = highlighted.has(ingredient.id)}
				<li class:here>
					<span class="dot" aria-hidden="true"></span>
					<span class="name">{ingredient.name}</span>
					{#if formatAmount(ingredient.quantity, ingredient.unit)}
						<span class="amount">{formatAmount(ingredient.quantity, ingredient.unit)}</span>
					{/if}
				</li>
			{/each}
		</ul>
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
		font-size: 15px;
		color: var(--cook-text-2);
		overflow-wrap: anywhere;
	}

	/* Typed as "250 g mushrooms", read back as "Mushrooms · 250 g" [7b]. */
	.name::first-letter {
		text-transform: uppercase;
	}

	.here .name {
		font-weight: 600;
		color: var(--cook-text);
	}

	.amount {
		flex: none;
		font-size: 14px;
		color: var(--cook-muted);
	}

	.here .amount {
		font-weight: 600;
		color: var(--cook-amber);
	}

	.empty {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--cook-muted);
	}
</style>
