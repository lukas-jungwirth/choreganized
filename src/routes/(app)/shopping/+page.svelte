<!--
	Shopping [03] — the shared list, grouped by store in walking order, with the
	quick-add field pinned above it, everything already bought folded into one
	section underneath, and the full sheet [3a] behind both the sliders button
	and any row.
-->
<script lang="ts">
	import HolidayNotice from '$lib/components/HolidayNotice.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import BoughtSection from '$lib/components/shopping/BoughtSection.svelte';
	import LiveNotice from '$lib/components/shopping/LiveNotice.svelte';
	import QuickAdd from '$lib/components/shopping/QuickAdd.svelte';
	import ShoppingGroup from '$lib/components/shopping/ShoppingGroup.svelte';
	import ShoppingItemSheet from '$lib/components/shopping/ShoppingItemSheet.svelte';
	import UndoBar from '$lib/components/shopping/UndoBar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { messages } from '$lib/i18n';
	import { liveShopping, type RemoteTick } from '$lib/live-shopping.svelte';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import { splitList, suggestionKey } from '$lib/utils/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	/**
	 * How long a tick plays out where it stands before the row goes
	 * (→ SPEC §3.1). Long enough to read the name you just ticked — or the one a
	 * housemate did — and short enough that nobody waits for it.
	 */
	const SETTLE_MS = 1400;

	/** With the motion gone there is only the state to take in, so: less of it. */
	const SETTLE_REDUCED_MS = 700;

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

	/**
	 * Ticks playing out in place: item id → the colour to draw them in. Sage when
	 * it was you, the housemate's own colour when it wasn't.
	 *
	 * This is the other half of `pending`. A settling row is held at
	 * `checkedAt: null` so `splitList` leaves it exactly where it is, and *this*
	 * is what tells the row to look ticked anyway. When the entry goes, the real
	 * data — which arrived long ago — applies, and the row leaves for "recently
	 * bought" (→ DECISIONS #135).
	 */
	const settling = new SvelteMap<string, string>();

	/**
	 * The bookkeeping behind each settling row, and the ids whose beat is up.
	 *
	 * A settle ends on **two** conditions, not one: its time is up *and* the
	 * server's list agrees the item is checked. The beat alone isn't enough —
	 * on a slow connection (a shop basement, which is exactly where this runs)
	 * the action can still be in flight at 1.4 s, and releasing then would snap
	 * the row back to un-ticked while the undo bar said it was checked off.
	 * Holding costs nothing: the row already looks the way it will end up.
	 */
	const settleMeta = new Map<
		string,
		{ item: ShoppingListItem; undoable: boolean; timer: ReturnType<typeof setTimeout> }
	>();

	const elapsed = new SvelteSet<string>();

	const list = $derived(splitList(items, data.stores));

	/**
	 * The header counts a settling row as done. It has a ✓ on it and a line
	 * through it; a count that still called it "to buy" would be arguing with
	 * what is on the screen.
	 */
	const doneCount = $derived(list.bought.length + settling.size);

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

	/** Stop holding a row, whether it finished or was tapped again. */
	function clearSettle(itemId: string) {
		const meta = settleMeta.get(itemId);
		if (meta) clearTimeout(meta.timer);
		settleMeta.delete(itemId);
		elapsed.delete(itemId);
		settling.delete(itemId);
		pending.delete(itemId);
	}

	/**
	 * Hold a row where it stands while its tick plays out, then let it go.
	 *
	 * `pending` at null is what does the holding: the server has the item down as
	 * checked, and until this ends we act as though it hadn't — so `splitList`
	 * leaves the row in its store group and `settling` tells it to look ticked
	 * anyway. The write is never delayed, only the departure, so the other phone
	 * hears about it at once either way.
	 *
	 * `undoable` is the one difference between your tick and a housemate's: the
	 * bar that comes up at the end offers to put something back, and theirs was
	 * never yours to take away.
	 */
	function startSettle(item: ShoppingListItem, color: string, undoable: boolean) {
		clearSettle(item.id);
		pending.set(item.id, null);
		settling.set(item.id, color);

		const reduced =
			typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

		const timer = setTimeout(() => elapsed.add(item.id), reduced ? SETTLE_REDUCED_MS : SETTLE_MS);
		settleMeta.set(item.id, { item, undoable, timer });
	}

	/**
	 * Let go of the rows whose beat is up and whose server row has caught up.
	 *
	 * Re-runs on both halves of that: `elapsed` when a beat ends, `data.items`
	 * when a load lands. A row that has vanished from the list altogether — a
	 * housemate deleted it, the nightly sweep took it — has nothing left to hold
	 * either, so it counts as caught up.
	 */
	$effect(() => {
		const rows = data.items;
		const ready = [...elapsed];

		untrack(() => {
			for (const id of ready) {
				const row = rows.find((candidate) => candidate.id === id);
				if (row && row.checkedAt === null) continue;

				const meta = settleMeta.get(id);
				clearSettle(id);
				// The row is gone from its group *now*, which is the moment it becomes
				// hard to find again — so this is when the way back appears, rather
				// than a second and a half before there was anything to undo.
				if (meta?.undoable) ticked = { item: meta.item };
			}
		});
	});

	function toggle(item: ShoppingListItem): SubmitFunction {
		return ({ formData }) => {
			const checked = formData.get('checked') === 'true';

			if (checked) {
				// Yours is sage — the list's own accent. Only a housemate's tick wears
				// a colour, because only then is *who* part of the news.
				startSettle(item, 'var(--sage)', true);
			} else {
				// Unchecking answers at once: there is nothing to watch, and "put it
				// back" is a correction, which wants to look immediate.
				clearSettle(item.id);
				pending.set(item.id, null);
			}

			return async ({ update, result }) => {
				await update({ reset: false });
				if (checked) {
					// A tick that didn't happen must not go on being held, and must not
					// grow an undo bar for it either.
					if (result.type !== 'success') clearSettle(item.id);
				} else {
					pending.delete(item.id);
				}
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

	/**
	 * A housemate ticked something. It plays out in their colour, in the row's own
	 * place in the walking order — the same settle your own tap gets, minus the
	 * undo bar at the end of it, because it wasn't yours to undo.
	 */
	function onRemoteTick({ itemId, actor }: RemoteTick) {
		const item = items.find((row) => row.id === itemId);
		// Only a row that is still open here has a tick to play. An event for one
		// this client already shows as bought — a late echo, a refetch that landed
		// first — must not haul it back out of "recently bought".
		if (!item || item.checkedAt !== null) return;
		// Already playing — most likely we both tapped the same row. Whoever
		// started it keeps it; restarting would only stutter the animation.
		if (settling.has(itemId)) return;

		startSettle(item, actor.color, false);
	}

	const live = liveShopping(
		() => data.currentMember.id,
		(tick) => onRemoteTick(tick)
	);

	$effect(live.start);

	// Leaving the screen mid-settle would otherwise leave a timer holding a row
	// that no longer exists.
	$effect(() => () => {
		for (const { timer } of settleMeta.values()) clearTimeout(timer);
		settleMeta.clear();
	});

	function edit(item: ShoppingListItem) {
		sheet = { item, name: item.name };
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.shopping.title)}</title>
</svelte:head>

<PageHeader
	title={m.shopping.title}
	meta={items.length > 0 ? m.shopping.progress(doneCount, items.length) : undefined}
>
	{#snippet actions()}
		<a class="stores" href="/shopping/stores" aria-label={m.shopping.manageStores}>
			<MapPin size={18} strokeWidth={1.9} />
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
		<ShoppingGroup {group} {toggle} onedit={edit} settling={(id) => settling.get(id)} />
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

<!-- One slot, and the undo bar owns it whenever it wants it: it is the only one
	 of the two with something to press, and it takes itself away after five
	 seconds. The housemate's row has already ticked itself off on screen either
	 way, so nothing is lost by the notice waiting its turn. -->
{#if ticked}
	{#key ticked}
		<UndoBar item={ticked.item} undo={undo(ticked.item)} onclose={() => (ticked = null)} />
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

	/* The header sits tight against the field it introduces; the notice needs the
	   gap a card gets everywhere else in the app. */
	.notice {
		margin-bottom: 14px;
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
		font-size: calc(15px * var(--fs));
	}
</style>
