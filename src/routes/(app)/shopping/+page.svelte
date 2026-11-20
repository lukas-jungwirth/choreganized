<!--
	Lists, the overview [L1] [L7] (plan 36, SPEC §3.1): the add field, then one
	card per list with something on it, then "New list".

	A card's header folds it; its corner button opens the list full screen
	(`/shopping/[listId]`). A shopping list with nothing on it is not on screen —
	the field's menu still reaches it. What was ticked off waits at the foot of
	its own card as "{n} bought" until the nightly sweep.

	Checklists (plan 36 step 2) come after the shopping lists, each always one
	row that opens it (→ `ChecklistRow`), empty or not.
-->
<script lang="ts">
	import HolidayNotice from '$lib/components/HolidayNotice.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import ChecklistRow from '$lib/components/shopping/ChecklistRow.svelte';
	import ListCard from '$lib/components/shopping/ListCard.svelte';
	import ListSheet from '$lib/components/shopping/ListSheet.svelte';
	import LiveNotice from '$lib/components/shopping/LiveNotice.svelte';
	import QuickAdd, { type QuickAddList } from '$lib/components/shopping/QuickAdd.svelte';
	import ShoppingItemSheet from '$lib/components/shopping/ShoppingItemSheet.svelte';
	import UndoBar from '$lib/components/shopping/UndoBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { goto } from '$app/navigation';
	import { messages } from '$lib/i18n';
	import { liveShopping } from '$lib/live-shopping.svelte';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import { shoppingTicks } from '$lib/shopping-ticks.svelte';
	import { OTHER_LIST_KEY, foldedCookie } from '$lib/utils/lists';
	import { splitList, suggestionKey } from '$lib/utils/shopping';
	import Plus from '@lucide/svelte/icons/plus';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const ticks = shoppingTicks(() => data.items, {
		checklists: () =>
			data.stores.filter((store) => store.kind === 'checklist').map((store) => store.id),
		me: () => data.currentMember
	});

	const list = $derived(splitList(ticks.items, data.stores));

	/** The shopping lists' cards (and "Other"): what there is to get. */
	const shopping = $derived(list.groups.filter((group) => group.kind === 'buy'));

	/** What is left to get across every shopping list; a settling row counts as got. */
	const toGet = $derived(
		shopping.flatMap((group) => group.items).filter((item) => !ticks.isSettling(item.id)).length
	);

	/** Where the field adds when nothing else says otherwise: the first shopping list. */
	const firstListId = $derived(data.stores.find((store) => store.kind === 'buy')?.id ?? null);

	/** Every list for the field's menu [L2], with what is on it. */
	const menuLists = $derived<QuickAddList[]>(
		data.stores.map((store) => {
			const rows = ticks.items.filter((item) => item.storeId === store.id);
			// A settling row counts as got, as in the header and on its card.
			const left = rows.filter(
				(item) => item.checkedAt === null && !ticks.isSettling(item.id)
			).length;
			return {
				...store,
				status:
					store.kind === 'checklist'
						? m.shopping.lists.ticked(rows.length - left, rows.length)
						: m.shopping.lists.status(left)
			};
		})
	);

	/** What is left to get on "Other", for its entry at the foot of the menu. */
	const otherLeft = $derived(
		shopping
			.find((group) => group.storeId === null)
			?.items.filter((item) => !ticks.isSettling(item.id)).length ?? 0
	);

	/**
	 * The names the field completes from, minus whatever is already waiting to
	 * be bought: offering "Oat milk" while "Oat milk" is three rows below is an
	 * invitation to buy it twice. A name under "{n} bought" stays offered —
	 * taking it puts that row back.
	 */
	const suggestions = $derived.by(() => {
		const onTheList = new Set(
			shopping.flatMap((group) => group.items).map((item) => suggestionKey(item.name))
		);
		return data.suggestions
			.filter((known) => !onTheList.has(suggestionKey(known.name)))
			.map((known) => known.name);
	});

	/* ── Folding ──────────────────────────────────────────────────────────── */

	/** Folded cards, per device: seeded from the cookie, then owned by the taps. */
	const folded = new SvelteSet<string>(untrack(() => data.folded));

	const keyOf = (storeId: string | null) => storeId ?? OTHER_LIST_KEY;

	function fold(storeId: string | null) {
		const key = keyOf(storeId);
		if (folded.has(key)) folded.delete(key);
		else folded.add(key);
		// Only lists that still exist, so a deleted list's key doesn't sit in the
		// cookie for good.
		const live = new Set([OTHER_LIST_KEY, ...data.stores.map((store) => store.id)]);
		document.cookie = foldedCookie([...folded].filter((folded) => live.has(folded)));
	}

	/* ── Where an add landed ──────────────────────────────────────────────── */

	/**
	 * A list something was just added to, while it was folded or not on screen:
	 * its card lights up once (a counter, so a second add replays it).
	 */
	const flashes = new SvelteMap<string, number>();
	let flashNext: string | null = null;

	function adding(storeId: string | null) {
		const key = keyOf(storeId);
		const card = list.groups.find((group) => keyOf(group.storeId) === key);
		// A checklist's row shows no rows of its own, so an add there always flashes.
		flashNext = !card || card.kind === 'checklist' || folded.has(key) ? key : null;
	}

	function added() {
		if (flashNext === null) return;
		flashes.set(flashNext, (flashes.get(flashNext) ?? 0) + 1);
		flashNext = null;
	}

	// A card that leaves the overview forgets its flash, or it would replay the
	// day a housemate's add brings it back.
	$effect(() => {
		const shown = new Set(list.groups.map((group) => keyOf(group.storeId)));
		untrack(() => {
			for (const key of [...flashes.keys()]) if (!shown.has(key)) flashes.delete(key);
		});
	});

	/* ── Sheets ───────────────────────────────────────────────────────────── */

	/** null = closed. Mounting the sheet per opening is what resets its form. */
	let sheet = $state<{ item: ShoppingListItem | null; name: string } | null>(null);
	let newList = $state(false);

	/** Lives here rather than in QuickAdd so the sheet can take it over. */
	let quickName = $state('');

	const live = liveShopping(
		() => data.currentMember.id,
		(tick) => ticks.onRemoteTick(tick)
	);

	$effect(live.start);

	function edit(item: ShoppingListItem) {
		sheet = { item, name: item.name };
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.shopping.title)}</title>
</svelte:head>

<PageHeader
	mascot="shopping"
	title={m.shopping.title}
	meta={toGet > 0 ? m.shopping.lists.thingsToGet(toGet) : m.shopping.lists.nothingToGet}
>
	{#snippet actions()}
		<a class="manage" href="/shopping/stores" aria-label={m.shopping.manageStores}>
			<Settings2 size={19} strokeWidth={1.9} />
		</a>
	{/snippet}
</PageHeader>

<!-- Above the field, not below it: it is context for the whole screen — how much
	 to buy and by when — rather than another thing to add (→ SPEC §3.6). -->
{#if data.holidayNotice}
	<div class="notice">
		<HolidayNotice notice={data.holidayNotice} today={data.today} />
	</div>
{/if}

<QuickAdd
	bind:value={quickName}
	known={data.suggestions}
	offered={suggestions}
	lists={menuLists}
	other={{ status: m.shopping.lists.status(otherLeft) }}
	fallback={firstListId}
	onadding={adding}
	onadded={added}
	onnewlist={() => (newList = true)}
/>

{#if list.groups.length === 0}
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
	<div class="lists">
		{#each list.groups as group (keyOf(group.storeId))}
			{#if group.kind === 'checklist' && group.storeId}
				<ChecklistRow
					{group}
					href="/shopping/{group.storeId}"
					flash={flashes.get(keyOf(group.storeId)) ?? 0}
				/>
			{:else}
				<ListCard
					{group}
					toggle={ticks.toggle}
					onedit={edit}
					settling={ticks.settling}
					folded={folded.has(keyOf(group.storeId))}
					onfold={() => fold(group.storeId)}
					openHref={group.storeId ? `/shopping/${group.storeId}` : null}
					flash={flashes.get(keyOf(group.storeId)) ?? 0}
				/>
			{/if}
		{/each}
	</div>
{/if}

<button type="button" class="new-list" onclick={() => (newList = true)}>
	<Plus size={17} strokeWidth={2.2} />{m.shopping.lists.newList}
</button>

<!-- One slot, and the undo bar owns it whenever it wants it: it is the only one
	 of the two with something to press, and it takes itself away after five
	 seconds. The housemate's row has already ticked itself off on screen either
	 way, so nothing is lost by the notice waiting its turn. -->
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
		initialName={sheet.name}
		{suggestions}
		stores={data.stores}
		defaultStoreId={firstListId}
		onadded={() => (quickName = '')}
		onclose={() => (sheet = null)}
	/>
{/if}

{#if newList}
	<ListSheet
		list={null}
		ondone={(id) => goto(`/shopping/${id}`)}
		onclose={() => (newList = false)}
	/>
{/if}

<style>
	.manage {
		position: relative;
		display: flex;
		/* The header aligns on the baseline; the icon wants its own centre. */
		align-self: center;
		padding: 4px;
		margin: -4px -4px -4px 0;
		color: var(--text-4);
	}

	/* 27px drawn; the target is 44 without moving the header. */
	.manage::after {
		content: '';
		position: absolute;
		inset: -9px;
	}

	/* The header sits tight against the field it introduces; the notice needs the
	   gap a card gets everywhere else in the app. */
	.notice {
		margin-bottom: 14px;
	}

	.lists {
		display: grid;
		gap: 12px;
	}

	.new-list {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 52px;
		margin-top: 14px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-block);
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--text-4);
	}

	.empty {
		/* [7d] floats the basket at 46% of the screen; this lands near it without
		   pinning anything to a viewport height the shell doesn't own. */
		margin: 8vh 0 6vh;
	}

	.cta :global(.button) {
		width: auto;
		margin: 0 auto;
		padding: 13px 22px;
		border-radius: var(--r-input);
		font-size: var(--fs-17);
	}
</style>
