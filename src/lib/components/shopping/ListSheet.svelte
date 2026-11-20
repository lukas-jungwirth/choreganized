<!--
	New list [L6], and the same sheet to edit one (plan 36): a name and an icon
	from the fixed twelve. No explanatory copy.

	Step 1 makes shopping lists only, so the Shopping list | Checklist switch
	the sketch draws arrives with checklists (plan 36 step 2).

	Creating answers with the new list's id and the page opens it, so it can be
	filled straight away. The page mounts this only while it is open, so the
	`$state` initialisers are the form reset.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ListIcon from '$lib/components/shopping/ListIcon.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { DEFAULT_LIST_ICON, LIST_ICONS, listIcon } from '$lib/utils/lists';
	import { STORE_NAME_MAX } from '$lib/utils/shopping';
	import { untrack } from 'svelte';

	type Props = {
		/** The list being edited; null for New list. */
		list: { id: string; name: string; icon: string | null } | null;
		/** Created: the new list's id. Edited: the same id. */
		ondone: (listId: string) => void;
		onclose: () => void;
	};

	let { list, ondone, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let name = $state(untrack(() => list?.name ?? ''));
	let icon = $state<string>(untrack(() => (list ? listIcon(list.icon) : DEFAULT_LIST_ICON)));
	let submitting = $state(false);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});

	const iconsId = $props.id();
</script>

<BottomSheet bind:open title={list ? m.shopping.lists.editTitle : m.shopping.lists.newList}>
	<form
		method="POST"
		action={list ? '?/editList' : '?/createList'}
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === 'failure') {
					await update({ reset: false });
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type !== 'success') return;
				await update({ reset: false });
				const id = typeof result.data?.listId === 'string' ? result.data.listId : list?.id;
				open = false;
				if (id) ondone(id);
			};
		}}
	>
		{#if list}<input type="hidden" name="id" value={list.id} />{/if}
		<input type="hidden" name="icon" value={icon} />

		<TextField
			label={m.shopping.lists.name}
			name="name"
			bind:value={name}
			placeholder={m.shopping.lists.namePlaceholder}
			maxlength={STORE_NAME_MAX}
			autocomplete="off"
			required
			{error}
		/>

		<p class="label" id={iconsId}>{m.shopping.lists.icon}</p>
		<div class="icons" role="radiogroup" aria-labelledby={iconsId}>
			{#each LIST_ICONS as key (key)}
				<button
					type="button"
					class="icon"
					class:on={icon === key}
					role="radio"
					aria-checked={icon === key}
					aria-label={m.shopping.lists.icons[key]}
					onclick={() => (icon = key)}
				>
					<ListIcon icon={key} size={21} />
				</button>
			{/each}
		</div>

		<Button type="submit" disabled={submitting || !name.trim()}>
			{list ? m.common.saveChanges : m.shopping.lists.create}
		</Button>
	</form>
</BottomSheet>

<style>
	.label {
		margin: 18px 0 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.icons {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 8px;
		margin-bottom: 22px;
	}

	.icon {
		display: grid;
		place-items: center;
		aspect-ratio: 1;
		min-height: 44px;
		border-radius: 12px;
		background: var(--field);
		color: var(--text-3);
	}

	.icon.on {
		background: var(--sage-tint);
		color: var(--sage-deep);
		box-shadow: inset 0 0 0 2px var(--sage);
	}
</style>
