<!--
	The red "Delete expense" / "Delete payment" at the foot of the edit sheets
	[9b-edit] [9d]: one form, one rule for what happens after it.

	The screen that asked for the delete may move on by itself (the detail goes
	back to the tab, which offers the undo); reloading it first would load a row
	that is gone. Anywhere else the page refreshes as usual.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { messages } from '$lib/i18n';

	type Props = {
		id: string;
		label: string;
		/** The delete went through; the screen moves on. Without it, the page reloads. */
		ondeleted?: (id: string) => void;
		/** Close the sheet this sits in. */
		ondone: () => void;
	};

	let { id, label, ondeleted, ondone }: Props = $props();

	const m = messages();
	let deleting = $state(false);
	let error = $state<string | undefined>();
</script>

<form
	method="POST"
	action="?/delete"
	use:enhance={() => {
		deleting = true;
		error = undefined;
		return async ({ result, update }) => {
			const gone = result.type === 'success' && Boolean(result.data?.deleted);
			if (!gone || !ondeleted) await update({ reset: false });
			deleting = false;
			// Answered, but nothing went: someone else deleted it in the meantime.
			if (result.type === 'success' && !gone) error = m.expenses.errors.notFound;
			if (!gone) return;
			ondeleted?.(id);
			ondone();
		};
	}}
>
	<input type="hidden" name="id" value={id} />
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<button type="submit" disabled={deleting}>
		<Trash size={15} strokeWidth={2} aria-hidden="true" />
		{label}
	</button>
</form>

<style>
	button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		margin-top: 8px;
		padding: 12px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--danger);
	}

	.error {
		margin-top: 12px;
		font-size: var(--fs-14);
		text-align: center;
		color: var(--danger);
	}
</style>
