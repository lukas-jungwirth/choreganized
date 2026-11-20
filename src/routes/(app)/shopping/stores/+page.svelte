<!--
	Manage lists (was Manage stores [7g]) — the order the overview follows.

	The design says "drag to reorder"; this ships arrow buttons instead
	(→ DECISIONS). They work on touch, on a keyboard and without JavaScript,
	which pointer-drag reordering manages none of without a good deal of code.

	Tapping a list opens its edit sheet (name, kind, icon, delete), the same one
	the ⋯ of an opened list opens; "Add a list" opens it to create one (Lukas
	2026-11-20). When the sheet closes, focus goes back to the row it came from.
-->
<script lang="ts">
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import ListSheet from '$lib/components/shopping/ListSheet.svelte';
	import StoreRow from '$lib/components/shopping/StoreRow.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { invalidateAll } from '$app/navigation';
	import { messages } from '$lib/i18n';
	import type { StoreSummary } from '$lib/server/services/shopping';
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	/** Where quick-add lands: the topmost shopping list, never a checklist. */
	const defaultId = $derived(data.stores.find((store) => store.kind === 'buy')?.id);

	/** The list whose sheet is open; null with `creating` false is no sheet. */
	let editing = $state<StoreSummary | null>(null);
	let creating = $state(false);
	let addButton: HTMLButtonElement | undefined = $state();

	/** Back to what opened the sheet: the row, or "Add a list" (or the list if the row is gone). */
	async function closed(from: string | null) {
		editing = null;
		creating = false;
		await tick();
		const row = from ? document.querySelector<HTMLElement>(`[data-edit="${from}"]`) : null;
		(row ?? addButton)?.focus();
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.shopping.stores.title)}</title>
</svelte:head>

<SubHeader
	title={m.shopping.stores.title}
	subtitle={m.shopping.stores.subtitle}
	back="/shopping"
	backLabel={m.shopping.stores.back}
/>

{#if data.stores.length > 0}
	<Card radius="md">
		<ul class="rows">
			{#each data.stores as store, index (store.id)}
				<StoreRow
					{store}
					first={index === 0}
					last={index === data.stores.length - 1}
					isDefault={store.id === defaultId}
					onedit={() => (editing = store)}
				/>
			{/each}
		</ul>
	</Card>
{/if}

<button bind:this={addButton} type="button" class="add" onclick={() => (creating = true)}>
	<span class="tile" aria-hidden="true"><Plus size={15} strokeWidth={2.4} /></span>
	{m.shopping.stores.add}
</button>

<p class="help">{m.shopping.stores.help}</p>

{#if editing}
	{@const list = editing}
	<ListSheet
		{list}
		ticked={list.checkedCount}
		itemCount={list.itemCount}
		ondone={() => {}}
		ondeleted={() => invalidateAll()}
		onclose={() => closed(list.id)}
	/>
{:else if creating}
	<ListSheet list={null} ondone={() => {}} onclose={() => closed(null)} />
{/if}

<style>
	.rows {
		overflow: hidden;
		border-radius: inherit;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.add {
		display: flex;
		align-items: center;
		gap: 11px;
		width: 100%;
		min-height: 56px;
		margin: 16px 0 22px;
		padding: 13px 14px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-block);
		background: var(--card);
		font-size: var(--fs-17);
		font-weight: 600;
		color: var(--sage);
		text-align: left;
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		background: var(--sage-tint);
		color: var(--sage);
	}

	.help {
		margin: 0;
		padding: 0 6px;
		font-size: var(--fs-14);
		line-height: 1.5;
		color: var(--text-5);
	}
</style>
