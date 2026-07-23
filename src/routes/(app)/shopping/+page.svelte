<!--
	Shopping [03] — the shared list, grouped by store in walking order, with the
	quick-add field pinned above it and the full sheet [3a] behind both the
	sliders button and any row.
-->
<script lang="ts">
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import QuickAdd from '$lib/components/shopping/QuickAdd.svelte';
	import ShoppingItemSheet from '$lib/components/shopping/ShoppingItemSheet.svelte';
	import ShoppingRow from '$lib/components/shopping/ShoppingRow.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import { compareItems } from '$lib/utils/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Plus from '@lucide/svelte/icons/plus';
	import { SvelteMap } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * Checks that have been tapped but not yet confirmed: item id → the
	 * `checkedAt` we're acting as if the server had already written.
	 *
	 * Ticking a box has to feel instant, and it isn't only the circle that
	 * changes — the row strikes through and travels to the end of its group. So
	 * the optimistic value goes through the same comparator the SQL uses, and the
	 * entry is dropped again once the real data lands.
	 */
	const pending = new SvelteMap<string, number | null>();

	const groups = $derived(
		data.list.groups.map((group) => ({
			...group,
			items: group.items
				.map((item) =>
					pending.has(item.id) ? { ...item, checkedAt: pending.get(item.id) ?? null } : item
				)
				.sort(compareItems)
		}))
	);

	const checked = $derived(
		groups.reduce(
			(total, group) => total + group.items.filter((item) => item.checkedAt !== null).length,
			0
		)
	);

	/** The topmost store — where quick-add lands, and the sheet's preselection. */
	const defaultStoreId = $derived(data.stores[0]?.id ?? null);

	/** null = closed. Mounting the sheet per opening is what resets its form. */
	let sheet = $state<{ item: ShoppingListItem | null; name: string } | null>(null);

	/** Lives here rather than in QuickAdd so the sheet can take it over. */
	let quickName = $state('');

	function toggle(item: ShoppingListItem): SubmitFunction {
		return ({ formData }) => {
			pending.set(item.id, formData.get('checked') === 'true' ? Date.now() : null);

			return async ({ update }) => {
				await update({ reset: false });
				pending.delete(item.id);
			};
		};
	}
</script>

<svelte:head>
	<title>Shopping · Choreganized</title>
</svelte:head>

<PageHeader
	title="Shopping"
	meta={data.list.total > 0 ? `${checked} of ${data.list.total} done` : undefined}
>
	{#snippet actions()}
		<a class="stores" href="/shopping/stores" aria-label="Manage stores">
			<MapPin size={18} strokeWidth={1.9} />
		</a>
	{/snippet}
</PageHeader>

<QuickAdd bind:value={quickName} onexpand={() => (sheet = { item: null, name: quickName })} />

{#if data.list.total === 0}
	<div class="empty">
		<EmptyState title="Nothing to buy yet">
			{#snippet icon()}<BasketIcon size={40} strokeWidth={1.6} />{/snippet}
			Add items as you run out — they'll be grouped by store for whoever does the shopping.
			{#snippet action()}
				<div class="cta">
					<Button onclick={() => (sheet = { item: null, name: '' })}>
						<Plus size={17} strokeWidth={2.4} />Add first item
					</Button>
				</div>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	{#each groups as group (group.storeId ?? 'other')}
		<section class="group">
			<h2 class="group-name">
				<MapPin size={13} strokeWidth={2} aria-hidden="true" />{group.name}
			</h2>
			<Card radius="md">
				<ul class="rows">
					{#each group.items as item (item.id)}
						<ShoppingRow
							{item}
							checked={item.checkedAt !== null}
							toggle={toggle(item)}
							onedit={() => (sheet = { item, name: item.name })}
						/>
					{/each}
				</ul>
			</Card>
		</section>
	{/each}
{/if}

{#if sheet}
	<ShoppingItemSheet
		item={sheet.item}
		initialName={sheet.name}
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
