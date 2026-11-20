<!--
	One list in Manage lists [7g]: its icon, its name, how much is filed under
	it, and the arrows that move it. The row itself opens the edit sheet (name,
	kind, icon, delete → `ListSheet`), with a chevron that says so (Lukas
	2026-11-20). It used to be an inline text field squeezed between the icon,
	the count and the buttons, with the icon unchangeable and the bin beside it.

	The arrows stay on the row and keep working without JavaScript; editing a
	list needs it, like the item sheet [3a].
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ListIcon from '$lib/components/shopping/ListIcon.svelte';
	import { messages } from '$lib/i18n';
	import type { StoreSummary } from '$lib/server/services/shopping';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';

	type Props = {
		store: StoreSummary;
		/** Can't move up. */
		first: boolean;
		last: boolean;
		/** Where quick-add lands, the topmost shopping list: the design tints it sage. */
		isDefault?: boolean;
		onedit: () => void;
	};

	let { store, first, last, isDefault = false, onedit }: Props = $props();

	const m = messages();
</script>

<li class="row">
	<button
		type="button"
		class="open"
		data-edit={store.id}
		aria-label={m.shopping.lists.edit(store.name)}
		onclick={onedit}
	>
		<span
			class="tile"
			class:default={isDefault}
			class:check={store.kind === 'checklist'}
			aria-hidden="true"
		>
			<ListIcon icon={store.icon} size={16} />
		</span>
		<span class="titles">
			<span class="name">{store.name}</span>
			<span class="count">{m.shopping.stores.items(store.itemCount)}</span>
		</span>
		<span class="go" aria-hidden="true"><ChevronRight size={17} strokeWidth={2.2} /></span>
	</button>

	<form class="move" method="POST" action="?/move" use:enhance>
		<input type="hidden" name="id" value={store.id} />
		<button
			type="submit"
			name="direction"
			value="up"
			disabled={first}
			aria-label={m.shopping.stores.moveUp(store.name)}
		>
			<ChevronUp size={17} strokeWidth={2.2} />
		</button>
		<button
			type="submit"
			name="direction"
			value="down"
			disabled={last}
			aria-label={m.shopping.stores.moveDown(store.name)}
		>
			<ChevronDown size={17} strokeWidth={2.2} />
		</button>
	</form>
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

	/* The whole row but the arrows: one target, at least 44px tall. */
	.open {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 10px;
		min-width: 0;
		min-height: 56px;
		padding: 10px 10px 10px 14px;
		text-align: left;
		color: inherit;
	}

	.open:active {
		background: var(--field);
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 9px;
		background: var(--divider);
		color: var(--text-4);
	}

	/* A checklist wears terracotta here too, as on the overview (plan 36). */
	.check {
		background: var(--terracotta-tint);
		color: var(--terracotta-deep);
	}

	.default {
		background: var(--sage-tint);
		color: var(--sage);
	}

	.titles {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	/* Wraps rather than truncating: at 200% a long name takes two lines. */
	.name {
		font-size: var(--fs-17);
		font-weight: 600;
		overflow-wrap: anywhere;
		color: var(--ink);
	}

	.count {
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.go {
		display: flex;
		flex: none;
		color: var(--text-5);
	}

	/* A hairline between "open" and "move": three chevrons side by side would
	   read as one control. */
	.move {
		display: flex;
		flex: none;
		align-items: center;
		margin: 12px 0;
		padding: 0 8px 0 6px;
		border-left: 1px solid var(--divider);
	}

	.move button {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 36px;
		height: 44px;
		border-radius: 10px;
		color: var(--text-4);
	}

	.move button:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.move button:active:not(:disabled) {
		background: var(--field);
	}
</style>
