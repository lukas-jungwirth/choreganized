<!--
	One store's slice of the list, drag-to-reorderable (→ SPEC §3.1). The store
	heading, the card, and the rows that are still to buy — "recently bought"
	lives in `BoughtSection`, and it isn't reordered by hand.

	The order the finger leaves has to hold the instant it lands, the same way a
	tick strikes a row before the server answers: `dndzone` reorders the local
	list on every `consider`, and `finalize` posts the result. So this owns a
	small copy of the group's items and reconciles it with the page's — which
	still decides membership (a tick pulls a row out, quick-add appends one) — on
	everything except the drag in hand and the order still saving.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ShoppingRow from '$lib/components/shopping/ShoppingRow.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingGroup, ShoppingListItem } from '$lib/server/services/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { untrack } from 'svelte';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';

	type Props = {
		group: ShoppingGroup;
		/** The page owns the optimistic tick bookkeeping, so it hands in the handler. */
		toggle: (item: ShoppingListItem) => SubmitFunction;
		onedit: (item: ShoppingListItem) => void;
	};

	let { group, toggle, onedit }: Props = $props();

	const m = messages();

	// The list `dndzone` reorders in place, seeded from the page for the first
	// paint (SSR included) and reconciled with `group.items` by the effect below —
	// `untrack` says the seed is deliberately the initial value, not a binding.
	let items = $state<ShoppingListItem[]>(untrack(() => group.items));
	let dragging = $state(false);
	let formEl: HTMLFormElement;
	let idsInput: HTMLInputElement;

	/**
	 * Follow the page's version of the group — but never over a live drag, and
	 * without snapping back the order we just dropped and are still saving. While
	 * the members are the same, our order wins and only the row data is refreshed;
	 * the moment a row joins or leaves, the page's list (order included) is taken
	 * whole. `untrack` keeps this a reaction to the page, not to our own writes.
	 */
	$effect(() => {
		const next = group.items;
		untrack(() => {
			if (dragging) return;
			const byId = new Map(next.map((item) => [item.id, item]));
			const localIds = items.map((item) => item.id);
			const sameMembers =
				localIds.length === next.length && localIds.every((id) => byId.has(id));
			items = sameMembers ? localIds.map((id) => byId.get(id)!) : next;
		});
	});

	function handleConsider(event: CustomEvent<DndEvent<ShoppingListItem>>) {
		dragging = true;
		items = event.detail.items;
	}

	function handleFinalize(event: CustomEvent<DndEvent<ShoppingListItem>>) {
		items = event.detail.items;
		dragging = false;
		// Svelte writes the hidden field on the next tick; `requestSubmit` reads it
		// now, so set the value straight on the node.
		idsInput.value = items.map((item) => item.id).join(',');
		formEl.requestSubmit();
	}
</script>

<section class="group">
	<h2 class="group-name">
		<MapPin size={13} strokeWidth={2} aria-hidden="true" />{group.name ?? m.shopping.other}
	</h2>
	<Card radius="md">
		<ul
			class="rows"
			use:dragHandleZone={{
				items,
				// A type per group (real store id, or a token for "Other") is what keeps
				// a drag inside its own group — no store gets reassigned by dropping.
				type: group.storeId ?? '__other__',
				flipDurationMs: 0,
				dropFromOthersDisabled: true,
				dropTargetStyle: {},
				zoneItemTabIndex: -1
			}}
			onconsider={handleConsider}
			onfinalize={handleFinalize}
		>
			{#each items as item (item.id)}
				<ShoppingRow
					{item}
					reorderable
					checked={false}
					toggle={toggle(item)}
					onedit={() => onedit(item)}
				/>
			{/each}
		</ul>
	</Card>
</section>

<form bind:this={formEl} method="POST" action="?/reorder" use:enhance hidden>
	<input type="hidden" name="storeId" value={group.storeId ?? ''} />
	<input bind:this={idsInput} type="hidden" name="ids" value="" />
</form>

<style>
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
