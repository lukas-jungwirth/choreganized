<!--
	New list [L6], and the same sheet to edit one (plan 36): a name, the switch
	"Shopping list | Checklist", and an icon from the fixed twelve. No
	explanatory copy: the kind can be changed later, here, which is what makes
	the missing explanation safe.

	Changing the kind of a list with ticked rows asks first, and says what
	happens to them: a shopping list's bought rows stay ticked on a checklist;
	a checklist's ticked rows go under "{n} bought" and are swept overnight.

	Editing ends in **Delete list** (Lukas 2026-11-20, as the item sheet [3a]
	ends in its delete), behind the confirm Manage lists used to raise: a
	shopping list's items move to "Other", a checklist's rows go with it, and it
	says how many. The page decides where to go after a delete.

	Creating answers with the new list's id and the page opens it, so it can be
	filled straight away. The page mounts this only while it is open, so the
	`$state` initialisers are the form reset.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ListIcon from '$lib/components/shopping/ListIcon.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { DEFAULT_LIST_ICON, LIST_ICONS, listIcon, type ListKind } from '$lib/utils/lists';
	import { STORE_NAME_MAX } from '$lib/utils/shopping';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { untrack } from 'svelte';

	type Props = {
		/** The list being edited; null for New list. */
		list: { id: string; name: string; icon: string | null; kind: ListKind } | null;
		/** Editing: how many of its rows are ticked (bought), which a kind change moves. */
		ticked?: number;
		/** Editing: everything on it, for the delete confirm. */
		itemCount?: number;
		/** Deleted: the page decides where to go (an opened list goes back to the overview). */
		ondeleted?: () => void;
		/** Created: the new list's id. Edited: the same id. */
		ondone: (listId: string) => void;
		onclose: () => void;
	};

	let { list, ticked = 0, itemCount = 0, ondone, ondeleted, onclose }: Props = $props();

	let deleting = $state(false);

	const m = messages();

	let open = $state(true);
	let name = $state(untrack(() => list?.name ?? ''));
	let icon = $state<string>(untrack(() => (list ? listIcon(list.icon) : DEFAULT_LIST_ICON)));
	let kind = $state<ListKind>(untrack(() => list?.kind ?? 'buy'));
	let submitting = $state(false);
	let error = $state<string | undefined>();
	let form: HTMLFormElement | undefined = $state();

	/** A kind change that moves ticked rows is asked about first. */
	const asks = $derived(list !== null && kind !== list.kind && ticked > 0);
	let confirming = $state(false);

	const kinds = $derived([
		{ value: 'buy', label: m.shopping.lists.kinds.buy, icon: ShoppingBasket },
		{ value: 'checklist', label: m.shopping.lists.kinds.checklist, icon: ListChecks }
	]);

	$effect(() => {
		if (!open) onclose();
	});

	const iconsId = $props.id();
</script>

<BottomSheet bind:open title={list ? m.shopping.lists.editTitle : m.shopping.lists.newList}>
	<form
		bind:this={form}
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
		<input type="hidden" name="kind" value={kind} />

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

		<div class="kinds">
			<SegmentedControl options={kinds} bind:value={kind} label={m.shopping.lists.kinds.label} />
		</div>

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

		<Button
			type={asks ? 'button' : 'submit'}
			disabled={submitting || !name.trim()}
			onclick={asks ? () => (confirming = true) : undefined}
		>
			{list ? m.common.saveChanges : m.shopping.lists.create}
		</Button>
	</form>

	{#if list}
		<button type="button" class="delete" onclick={() => (deleting = true)}>
			<Trash2 size={19} strokeWidth={1.9} aria-hidden="true" />
			<span>{m.shopping.stores.deleteLabel}</span>
		</button>
	{/if}
</BottomSheet>

{#if list}
	<CenterModal bind:open={deleting} label={m.shopping.stores.deleteLabel} dismissible={false}>
		<div class="bin" aria-hidden="true"><Trash2 size={26} strokeWidth={1.9} /></div>
		<h2>{m.shopping.stores.deleteConfirm(list.name)}</h2>
		<p class="copy">
			{#if itemCount > 0 && list.kind === 'checklist'}
				{m.shopping.stores.deleteChecklist(itemCount)}
			{:else if itemCount > 0}
				{m.shopping.stores.deleteMoves(itemCount)}
			{:else}
				{m.shopping.stores.deleteEmpty}
			{/if}
		</p>
		<form
			method="POST"
			action="?/deleteList"
			use:enhance={() =>
				async ({ result }) => {
					// No `update` here: on an opened list the page's own load would 404
					// before the page could leave. The page refreshes or navigates.
					if (result.type !== 'success') return;
					deleting = false;
					open = false;
					ondeleted?.();
				}}
		>
			<input type="hidden" name="id" value={list.id} />
			<Button type="submit" variant="danger">{m.shopping.stores.deleteLabel}</Button>
		</form>
		<button type="button" class="cancel" onclick={() => (deleting = false)}>
			{m.common.cancel}
		</button>
	</CenterModal>
{/if}

{#if list}
	{@const change =
		kind === 'checklist' ? m.shopping.lists.toChecklist : m.shopping.lists.toShopping}
	<CenterModal bind:open={confirming} label={change.title(list.name)} dismissible={false}>
		<h2>{change.title(list.name)}</h2>
		<p class="copy">{change.copy(ticked)}</p>
		<Button
			onclick={() => {
				confirming = false;
				form?.requestSubmit();
			}}
		>
			{change.confirm}
		</Button>
		<button type="button" class="cancel" onclick={() => (confirming = false)}>
			{m.common.cancel}
		</button>
	</CenterModal>
{/if}

<style>
	.kinds {
		margin-top: 16px;
	}

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

	/* Below the save button, like the item sheet's delete [3a]. */
	.delete {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		min-height: 44px;
		margin-top: 8px;
		padding: 13px 4px;
		font-size: var(--fs-17);
		font-weight: 500;
		color: var(--danger);
	}

	.bin {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 60px;
		margin: 0 auto 18px;
		border-radius: 50%;
		background: var(--danger-tint);
		color: var(--danger);
	}

	/* The confirm a kind change raises, set like the other confirms ([7g]). */
	h2 {
		margin-bottom: 10px;
		font-size: var(--fs-24);
		overflow-wrap: anywhere;
	}

	.copy {
		margin: 0 0 24px;
		font-size: var(--fs-16);
		line-height: 1.5;
		color: var(--text-4);
	}

	.cancel {
		width: 100%;
		padding: 13px;
		font-size: var(--fs-17);
		font-weight: 700;
		color: var(--text-2);
	}

	.icon.on {
		background: var(--sage-tint);
		color: var(--sage-deep);
		box-shadow: inset 0 0 0 2px var(--sage);
	}
</style>
