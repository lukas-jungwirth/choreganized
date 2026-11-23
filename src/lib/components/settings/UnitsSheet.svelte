<!--
	Settings → Units (→ plan 46, DECISIONS #321): the words the household added
	to the unit list from a recipe's unit panel, each with a way to remove it.
	Adding happens in the panel only ("Add your own"), where the word is needed.
	A removed word leaves the recipes that use it as they are: a row keeps its
	unit (→ `services/recipes.ts` `storedUnit`), the panel just stops offering it.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { messages } from '$lib/i18n';
	import X from '@lucide/svelte/icons/x';

	type Props = {
		units: { id: string; word: string }[];
		onclose: () => void;
	};

	let { units, onclose }: Props = $props();

	const m = messages();
	const t = m.settings.units;

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open eyebrow={m.settings.household} title={t.title} subtitle={t.subtitle}>
	{#if units.length}
		<ul class="list">
			{#each units as unit (unit.id)}
				<li>
					<span class="word">{unit.word}</span>
					<form method="POST" action="?/removeUnit" use:enhance>
						<input type="hidden" name="id" value={unit.id} />
						<button type="submit" class="remove" aria-label={t.remove(unit.word)}>
							<X size={18} strokeWidth={2.2} aria-hidden="true" />
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">{t.empty}</p>
	{/if}
</BottomSheet>

<style>
	.list {
		margin: 0;
		padding: 0;
		overflow: hidden;
		border-radius: var(--r-block);
		background: var(--field);
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 52px;
		padding: 0 4px 0 16px;
		border-top: 1px solid var(--divider-sheet);
	}

	li:first-child {
		border-top: 0;
	}

	.word {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-17);
		font-weight: 500;
		overflow-wrap: anywhere;
	}

	.remove {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		color: var(--text-4);
	}

	.empty {
		margin: 0;
		font-size: var(--fs-16);
		color: var(--text-4);
	}
</style>
