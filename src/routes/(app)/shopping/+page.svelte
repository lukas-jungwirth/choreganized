<!--
	Shopping [03] — the shared list, grouped by store in walking order, with the
	quick-add field pinned above it, everything already bought folded into one
	section underneath, and the full sheet [3a] behind both the sliders button
	and any row.
-->
<script lang="ts">
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import BoughtSection from '$lib/components/shopping/BoughtSection.svelte';
	import QuickAdd from '$lib/components/shopping/QuickAdd.svelte';
	import ShoppingItemSheet from '$lib/components/shopping/ShoppingItemSheet.svelte';
	import ShoppingRow from '$lib/components/shopping/ShoppingRow.svelte';
	import UndoBar from '$lib/components/shopping/UndoBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import { splitList, suggestionKey } from '$lib/utils/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Plus from '@lucide/svelte/icons/plus';
	import { SvelteMap } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	/**
	 * Checks that have been tapped but not yet confirmed: item id → the
	 * `checkedAt` we're acting as if the server had already written.
	 *
	 * Ticking a box has to feel instant, and it isn't only the circle that
	 * changes — the row strikes through and leaves its store for "recently
	 * bought" (and takes the store's heading with it, if it was the last thing
	 * left to buy there). So the optimistic value goes through the same split
	 * the server used, and the entry is dropped again once the real data lands.
	 */
	const pending = new SvelteMap<string, number | null>();

	const items = $derived(
		data.items.map((item) =>
			pending.has(item.id) ? { ...item, checkedAt: pending.get(item.id) ?? null } : item
		)
	);

	const list = $derived(splitList(items, data.stores));

	/** The topmost store — where quick-add lands, and the sheet's preselection. */
	const defaultStoreId = $derived(data.stores[0]?.id ?? null);

	/**
	 * The names both fields complete from, minus whatever is already waiting to
	 * be bought: offering "Oat milk" while "Oat milk" is three rows below is an
	 * invitation to buy it twice.
	 */
	const suggestions = $derived.by(() => {
		const onTheList = new Set(
			list.groups.flatMap((group) => group.items).map((item) => suggestionKey(item.name))
		);
		return data.suggestions.filter((name) => !onTheList.has(suggestionKey(name)));
	});

	/** null = closed. Mounting the sheet per opening is what resets its form. */
	let sheet = $state<{ item: ShoppingListItem | null; name: string } | null>(null);

	/** Lives here rather than in QuickAdd so the sheet can take it over. */
	let quickName = $state('');

	/**
	 * The item the undo bar is currently offering to put back, or null.
	 *
	 * A fresh object per tick, which is what the `{#key}` below keys on: ticking
	 * a second item replaces the bar rather than letting the new name inherit
	 * what was left of the old one's few seconds.
	 */
	let ticked = $state<{ item: ShoppingListItem } | null>(null);

	function toggle(item: ShoppingListItem): SubmitFunction {
		return ({ formData }) => {
			const checked = formData.get('checked') === 'true';
			pending.set(item.id, checked ? Date.now() : null);
			// Offered the instant the row moves, for the same reason the row moves
			// before the server answers — but taken away again if the tick turns
			// out not to have happened, so the bar never offers to undo nothing.
			if (checked) ticked = { item };

			return async ({ update, result }) => {
				await update({ reset: false });
				pending.delete(item.id);
				if (result.type !== 'success' && ticked?.item.id === item.id) ticked = null;
			};
		};
	}

	/** Undoing is a tick in reverse, plus taking the bar away. */
	function undo(item: ShoppingListItem): SubmitFunction {
		const submit = toggle(item);

		return (input) => {
			const done = submit(input);
			ticked = null;
			return done;
		};
	}

	function edit(item: ShoppingListItem) {
		sheet = { item, name: item.name };
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.shopping.title)}</title>
</svelte:head>

<PageHeader
	title={m.shopping.title}
	meta={items.length > 0 ? m.shopping.progress(list.bought.length, items.length) : undefined}
>
	{#snippet actions()}
		<a class="stores" href="/shopping/stores" aria-label={m.shopping.manageStores}>
			<MapPin size={18} strokeWidth={1.9} />
		</a>
	{/snippet}
</PageHeader>

<QuickAdd
	bind:value={quickName}
	{suggestions}
	onexpand={() => (sheet = { item: null, name: quickName })}
/>

{#if items.length === 0}
	<div class="empty">
		<EmptyState title={m.shopping.empty.title}>
			{#snippet icon()}<BasketIcon size={40} strokeWidth={1.6} />{/snippet}
			{m.shopping.empty.copy}
			{#snippet action()}
				<div class="cta">
					<Button onclick={() => (sheet = { item: null, name: '' })}>
						<Plus size={17} strokeWidth={2.4} />{m.shopping.empty.cta}
					</Button>
				</div>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	{#each list.groups as group (group.storeId ?? 'other')}
		<section class="group">
			<h2 class="group-name">
				<MapPin size={13} strokeWidth={2} aria-hidden="true" />{group.name ?? m.shopping.other}
			</h2>
			<Card radius="md">
				<ul class="rows">
					{#each group.items as item (item.id)}
						<ShoppingRow {item} checked={false} toggle={toggle(item)} onedit={() => edit(item)} />
					{/each}
				</ul>
			</Card>
		</section>
	{/each}

	{#if list.bought.length > 0}
		<BoughtSection
			items={list.bought}
			startOpen={list.groups.length === 0}
			{toggle}
			onedit={edit}
		/>
	{/if}
{/if}

{#if ticked}
	{#key ticked}
		<UndoBar item={ticked.item} undo={undo(ticked.item)} onclose={() => (ticked = null)} />
	{/key}
{/if}

{#if sheet}
	<ShoppingItemSheet
		item={sheet.item}
		initialName={sheet.name}
		{suggestions}
		stores={data.stores}
		{defaultStoreId}
		onadded={() => (quickName = '')}
		onclose={() => (sheet = null)}
	/>
{/if}

<style>
	.stores {
		display: flex;
		/* The header aligns on the baseline; the icon wants its own centre. */
		align-self: center;
		padding: 4px;
		margin: -4px -4px -4px 0;
		color: var(--text-4);
	}

	.empty {
		/* [7d] floats the basket at 46% of the screen; this lands near it without
		   pinning anything to a viewport height the shell doesn't own. */
		margin-top: 12vh;
	}

	.cta :global(.button) {
		width: auto;
		margin: 0 auto;
		padding: 13px 22px;
		border-radius: var(--r-input);
		font-size: 15px;
	}

	.group {
		margin-bottom: 18px;
	}

	.group-name {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0 4px 8px;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.rows {
		/* Keeps a pressed row's tint inside the card's corners. */
		overflow: hidden;
		border-radius: inherit;
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
