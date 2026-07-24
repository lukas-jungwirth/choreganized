<!--
	Manage stores [7g] — the walking order the shopping list follows.

	The design says "drag to reorder"; this ships arrow buttons instead
	(→ DECISIONS). They work on touch, on a keyboard and without JavaScript,
	which pointer-drag reordering manages none of without a good deal of code.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import StoreRow from '$lib/components/shopping/StoreRow.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import { messages } from '$lib/i18n';
	import type { StoreSummary } from '$lib/server/services/shopping';
	import { STORE_NAME_MAX } from '$lib/utils/shopping';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	let newStore = $state('');
	let confirming = $state<StoreSummary | null>(null);
	let confirmOpen = $state(false);

	const error = $derived(form && 'error' in form ? form.error : undefined);

	function askDelete(store: StoreSummary) {
		confirming = store;
		confirmOpen = true;
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
					ondelete={() => askDelete(store)}
				/>
			{/each}
		</ul>
	</Card>
{/if}

<form
	class="add"
	method="POST"
	action="?/create"
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') newStore = '';
		}}
>
	<span class="tile" aria-hidden="true"><Plus size={15} strokeWidth={2.4} /></span>
	<input
		class="field"
		type="text"
		name="name"
		bind:value={newStore}
		placeholder={m.shopping.stores.add}
		aria-label={m.shopping.stores.add}
		maxlength={STORE_NAME_MAX}
		autocomplete="off"
		required
	/>
	{#if newStore.trim()}
		<button type="submit" class="save">{m.shopping.stores.addButton}</button>
	{/if}
</form>

{#if error}
	<p class="error">{error}</p>
{/if}

<p class="help">{m.shopping.stores.help}</p>

<CenterModal bind:open={confirmOpen} label={m.shopping.stores.deleteLabel} dismissible={false}>
	{#if confirming}
		<div class="well" aria-hidden="true"><Trash2 size={26} strokeWidth={1.9} /></div>
		<h2>{m.shopping.stores.deleteConfirm(confirming.name)}</h2>
		<p class="copy">
			{#if confirming.itemCount > 0}
				{m.shopping.stores.deleteMoves(confirming.itemCount)}
			{:else}
				{m.shopping.stores.deleteEmpty}
			{/if}
		</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					// A rejected delete keeps the question on screen with the error
					// behind it, rather than closing as if it had worked.
					if (result.type === 'success') confirmOpen = false;
				}}
		>
			<input type="hidden" name="id" value={confirming.id} />
			<Button type="submit" variant="danger">{m.shopping.stores.deleteLabel}</Button>
		</form>
		<button type="button" class="cancel" onclick={() => (confirmOpen = false)}>
			{m.common.cancel}
		</button>
	{/if}
</CenterModal>

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
		margin: 16px 0 22px;
		padding: 13px 14px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-block);
		background: var(--card);
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

	.field {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
	}

	.field:focus {
		outline: none;
	}

	/* The design draws this row as a sage "Add a store" label; empty, that's
	   exactly what the placeholder is. */
	.field::placeholder {
		color: var(--sage);
		font-weight: 600;
	}

	.save {
		flex: none;
		padding: 7px 14px;
		border-radius: var(--r-chip);
		background: var(--sage);
		color: var(--on-sage);
		font-size: 13px;
		font-weight: 700;
	}

	.error {
		margin: -14px 0 18px;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.help {
		margin: 0;
		padding: 0 6px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-5);
	}

	.well {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 60px;
		margin: 0 auto 18px;
		border-radius: 50%;
		background: var(--danger-tint);
		color: var(--danger);
	}

	h2 {
		margin-bottom: 10px;
		font-size: 22px;
		overflow-wrap: anywhere;
	}

	.copy {
		margin: 0 0 24px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.cancel {
		width: 100%;
		padding: 13px;
		font-size: 15px;
		font-weight: 700;
		color: var(--text-2);
	}
</style>
