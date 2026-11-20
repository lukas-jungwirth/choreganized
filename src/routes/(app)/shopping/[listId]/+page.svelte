<!--
	A list, opened [L5] (plan 36, SPEC §3.1): "‹ Lists" and ⋯, the list's icon
	and name, "4 to get · 2 bought", the add field that adds here and nowhere
	else, and the same card body as on the overview with "{n} bought" unfolded.

	For walking one shop, or filling a list you just made. Ticks, the undo bar,
	drag and a housemate's live ticks behave exactly as on the overview — the
	bookkeeping is the same module (→ `lib/shopping-ticks.svelte.ts`).
-->
<script lang="ts">
	import ListCard from '$lib/components/shopping/ListCard.svelte';
	import ListIcon from '$lib/components/shopping/ListIcon.svelte';
	import ListSheet from '$lib/components/shopping/ListSheet.svelte';
	import LiveNotice from '$lib/components/shopping/LiveNotice.svelte';
	import QuickAdd from '$lib/components/shopping/QuickAdd.svelte';
	import ShoppingItemSheet from '$lib/components/shopping/ShoppingItemSheet.svelte';
	import UndoBar from '$lib/components/shopping/UndoBar.svelte';
	import { messages } from '$lib/i18n';
	import { liveShopping } from '$lib/live-shopping.svelte';
	import { preloadData } from '$lib/preload';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import { shoppingTicks } from '$lib/shopping-ticks.svelte';
	import { splitList, suggestionKey } from '$lib/utils/shopping';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const ticks = shoppingTicks(() => data.items);

	/** This list's card: always there on its own screen, even with nothing on it. */
	const group = $derived(
		splitList(ticks.items, [data.list]).groups[0] ?? {
			storeId: data.list.id,
			name: data.list.name,
			icon: data.list.icon,
			items: [],
			bought: []
		}
	);

	const left = $derived(group.items.filter((item) => !ticks.isSettling(item.id)).length);
	const bought = $derived(group.bought.length + (group.items.length - left));

	const subtitle = $derived(
		bought > 0
			? m.shopping.lists.openedStatus(left, bought)
			: left > 0
				? m.shopping.lists.toGet(left)
				: m.shopping.lists.nothingToGet
	);

	/** As on the overview: a name waiting on this list isn't offered again. */
	const suggestions = $derived.by(() => {
		const onTheList = new Set(group.items.map((item) => suggestionKey(item.name)));
		return data.suggestions
			.filter((known) => !onTheList.has(suggestionKey(known.name)))
			.map((known) => known.name);
	});

	let sheet = $state<{ item: ShoppingListItem } | null>(null);
	let editing = $state(false);

	const live = liveShopping(
		() => data.currentMember.id,
		(tick) => ticks.onRemoteTick(tick)
	);

	$effect(live.start);
</script>

<svelte:head>
	<title>{m.common.pageTitle(data.list.name)}</title>
</svelte:head>

<div class="bar">
	<a class="back" href="/shopping" data-sveltekit-preload-data={preloadData('/shopping')}>
		<ChevronLeft size={20} strokeWidth={2.4} />{m.shopping.title}
	</a>
	<button
		type="button"
		class="more"
		aria-label={m.shopping.lists.edit(data.list.name)}
		onclick={() => (editing = true)}
	>
		<Ellipsis size={20} strokeWidth={1.9} />
	</button>
</div>

<header class="title">
	<span class="well" aria-hidden="true"><ListIcon icon={data.list.icon} size={25} /></span>
	<div class="titles">
		<h1>{data.list.name}</h1>
		<p class="sub">{subtitle}</p>
	</div>
</header>

<QuickAdd offered={suggestions} lists={[]} fallback={data.list.id} fixed={data.list} />

<ListCard
	{group}
	header={false}
	boughtOpen
	toggle={ticks.toggle}
	onedit={(item) => (sheet = { item })}
	settling={ticks.settling}
/>

{#if ticks.ticked}
	{#key ticks.ticked}
		<UndoBar
			item={ticks.ticked.item}
			undo={ticks.undo(ticks.ticked.item)}
			onclose={ticks.dismissUndo}
		/>
	{/key}
{:else if live.notice}
	{#key live.notice}
		<LiveNotice notice={live.notice} />
	{/key}
{/if}

{#if sheet}
	<ShoppingItemSheet
		item={sheet.item}
		{suggestions}
		stores={data.stores}
		defaultStoreId={data.list.id}
		onclose={() => (sheet = null)}
	/>
{/if}

{#if editing}
	<ListSheet list={data.list} ondone={() => {}} onclose={() => (editing = false)} />
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 0 0 10px;
	}

	.back {
		display: flex;
		align-items: center;
		gap: 2px;
		min-height: 44px;
		margin-left: -6px;
		padding-right: 10px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--sage-deep);
	}

	.more {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin-right: -10px;
		color: var(--text-4);
	}

	.title {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
	}

	.well {
		display: grid;
		flex: none;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: 17px;
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.titles {
		min-width: 0;
	}

	h1 {
		margin: 0;
		overflow-wrap: anywhere;
		font-family: var(--font-display);
		font-size: var(--fs-30);
		font-weight: 600;
		line-height: 1.1;
		color: var(--ink);
	}

	.sub {
		margin: 2px 0 0;
		font-size: var(--fs-15);
		font-weight: 500;
		color: var(--text-4);
	}
</style>
