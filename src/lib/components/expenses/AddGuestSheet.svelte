<!--
	Add a guest [G2] (→ SPEC §11.15): a name is all it takes, and the app picks
	the colour. Opened from the split sheet's last row [G1], the payer picker's
	"Someone else…" and Expense settings [G4]; after "Add Jonas" the sheet that
	opened it gets the new person's id, to tick them in or make them the payer.

	Mounted over whichever sheet opened it, and never inside that sheet's form:
	this is a form of its own, and forms don't nest.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { DISPLAY_NAME_MAX } from '$lib/utils/household';

	type Props = {
		/** The guest exists: their person id. The sheet closes itself after. */
		onadded?: (guestId: string) => void;
		/** Closed, added or not. */
		onclose: () => void;
	};

	let { onadded, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let name = $state('');
	let submitting = $state(false);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.expenses.guests.addTitle} subtitle={m.expenses.guests.addSubtitle}>
	<form
		method="POST"
		action="?/addGuest"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				// Reload first, so the guest is in the people the opener ticks them into.
				await update({ reset: false });
				submitting = false;
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success' && typeof result.data?.guestId === 'string') {
					onadded?.(result.data.guestId);
					open = false;
				}
			};
		}}
	>
		<!-- The sheet opens to type the name: the focus is the point. -->
		<!-- svelte-ignore a11y_autofocus -->
		<TextField
			label={m.expenses.guests.name}
			name="name"
			bind:value={name}
			maxlength={DISPLAY_NAME_MAX}
			autocomplete="off"
			autocapitalize="words"
			autofocus
			required
			{error}
		/>
		<p class="caption">{m.expenses.guests.addCaption}</p>
		<Button type="submit" disabled={!name.trim() || submitting}>
			{m.expenses.guests.addNamed(name.trim())}
		</Button>
	</form>
</BottomSheet>

<style>
	form {
		display: flex;
		flex-direction: column;
		--input-surface: var(--field);
	}

	.caption {
		margin: 8px 4px 18px;
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
