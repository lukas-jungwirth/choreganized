<!--
	One store in [7g]: pin tile, its name (editable in place), how much is filed
	under it, and the controls that move or remove it.

	The name is a live text field rather than a tap-to-edit mode — one less
	state, and it renames without JavaScript, since Enter submits a single-field
	form on its own. Blur is what saves; Escape puts the old name back.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { StoreSummary } from '$lib/server/services/shopping';
	import { STORE_NAME_MAX } from '$lib/utils/shopping';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type Props = {
		store: StoreSummary;
		/** The topmost store is where quick-add lands — the design tints it sage. */
		first: boolean;
		last: boolean;
		ondelete: () => void;
	};

	let { store, first, last, ondelete }: Props = $props();

	function save(event: FocusEvent & { currentTarget: HTMLInputElement }) {
		const field = event.currentTarget;
		const next = field.value.trim();

		// Nothing typed, or nothing changed: no POST, and an emptied field gets
		// its name back rather than being left blank on screen.
		if (!next || next === store.name) {
			field.value = store.name;
			return;
		}

		field.form?.requestSubmit();
	}

	function onkeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (event.key === 'Enter') {
			// Let blur be the one path that saves, and drop the phone keyboard.
			event.preventDefault();
			event.currentTarget.blur();
		} else if (event.key === 'Escape') {
			event.currentTarget.value = store.name;
			event.currentTarget.blur();
		}
	}
</script>

<li class="row">
	<span class="tile" class:default={first} aria-hidden="true">
		<MapPin size={16} strokeWidth={1.9} />
	</span>

	<form class="rename" method="POST" action="?/rename" use:enhance>
		<input type="hidden" name="id" value={store.id} />
		<input
			class="name"
			type="text"
			name="name"
			value={store.name}
			aria-label="Rename {store.name}"
			maxlength={STORE_NAME_MAX}
			autocomplete="off"
			required
			onblur={save}
			{onkeydown}
		/>
		<span class="count">{store.itemCount} {store.itemCount === 1 ? 'item' : 'items'}</span>
	</form>

	<form class="move" method="POST" action="?/move" use:enhance>
		<input type="hidden" name="id" value={store.id} />
		<button
			type="submit"
			name="direction"
			value="up"
			disabled={first}
			aria-label="Move {store.name} up"
		>
			<ChevronUp size={17} strokeWidth={2.2} />
		</button>
		<button
			type="submit"
			name="direction"
			value="down"
			disabled={last}
			aria-label="Move {store.name} down"
		>
			<ChevronDown size={17} strokeWidth={2.2} />
		</button>
	</form>

	<button type="button" class="delete" onclick={ondelete} aria-label="Delete {store.name}">
		<Trash2 size={17} strokeWidth={1.9} />
	</button>
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px 10px 14px;
		border-top: 1px solid var(--divider);
	}

	.row:first-child {
		border-top: none;
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

	.default {
		background: var(--sage-tint);
		color: var(--sage);
	}

	.rename {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	/* Reads as the row's title until you touch it. */
	.name {
		width: 100%;
		padding: 3px 6px;
		margin-left: -6px;
		border: 1.5px solid transparent;
		border-radius: 9px;
		background: none;
		font-family: inherit;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
		text-overflow: ellipsis;
	}

	.name:focus {
		outline: none;
		border-color: var(--sage);
		background: var(--field);
	}

	.count {
		margin-left: -1px;
		font-size: 12px;
		color: var(--text-4);
	}

	.move {
		display: flex;
		flex: none;
	}

	.move button,
	.delete {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 32px;
		height: 40px;
		border-radius: 10px;
		color: var(--text-4);
	}

	.move button:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.move button:active:not(:disabled),
	.delete:active {
		background: var(--field);
	}

	/* Same weight as the arrows: three red bins would be the loudest thing on a
	   screen the design draws entirely in greys. The confirm carries the danger. */
	.delete {
		margin-left: 2px;
	}
</style>
