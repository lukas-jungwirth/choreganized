<!--
	One line of the list [03]: check circle, name, compact quantity, and the
	mini avatar of whoever put it there.

	Two targets, one row (→ SPEC §3.1): the circle checks the item off, the rest
	of the row opens the edit sheet. They're siblings rather than nested buttons,
	which HTML doesn't allow and screen readers can't announce.

	Checked, the row goes quiet the way the design draws it: the quantity folds
	into the struck name and the avatar drops away — bought is bought, who wanted
	it stops mattering.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';

	type Props = {
		item: ShoppingListItem;
		/** Includes a tap that hasn't reached the server yet — the page decides. */
		checked: boolean;
		/** The page owns the optimistic bookkeeping, so it hands in the handler. */
		toggle: SubmitFunction;
		onedit: () => void;
	};

	let { item, checked, toggle, onedit }: Props = $props();

	const m = messages();

	const quantity = $derived(m.units.quantity(item.quantity, item.unit));
</script>

<li class="row">
	<form method="POST" action="?/toggle" use:enhance={toggle}>
		<input type="hidden" name="id" value={item.id} />
		<input type="hidden" name="checked" value={checked ? 'false' : 'true'} />
		<button
			type="submit"
			class="tick"
			aria-pressed={checked}
			aria-label={checked ? m.shopping.row.uncheck(item.name) : m.shopping.row.check(item.name)}
		>
			<CheckCircle {checked} />
		</button>
	</form>

	<button type="button" class="body" onclick={onedit} aria-label={m.shopping.row.edit(item.name)}>
		<span class="name" class:done={checked}>
			{checked && quantity ? `${item.name} ${quantity}` : item.name}
		</span>
		{#if !checked}
			{#if quantity}<span class="qty">{quantity}</span>{/if}
			{#if item.addedBy}
				<Avatar name={item.addedBy.displayName} color={item.addedBy.color} size={20} />
			{/if}
		{/if}
	</button>
</li>

<style>
	.row {
		display: flex;
		align-items: stretch;
		border-top: 1px solid var(--divider);
	}

	.row:first-child {
		border-top: none;
	}

	/* Both halves run the full height of the row, so the 44px target is real
	   even though the design's padding is 13px. */
	.tick {
		display: flex;
		align-items: center;
		padding: 13px 12px 13px 16px;
	}

	.body {
		display: flex;
		align-items: center;
		flex: 1;
		gap: 12px;
		min-width: 0;
		padding: 13px 16px 13px 0;
		text-align: left;
	}

	.body:active {
		background: var(--sage-row);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-weight: 500;
		/* "Sonnenblumenkerne (geschält)" has nowhere to break. */
		overflow-wrap: anywhere;
	}

	.done {
		color: var(--text-disabled);
		text-decoration: line-through;
	}

	.qty {
		flex: none;
		font-size: 13px;
		color: var(--text-4);
	}
</style>
