<!--
	Rename the household [6a] — owner only, which is why the row that opens this
	is a chevron for them and plain text for everyone else. The service checks
	the role again; this sheet is the affordance, not the guard.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { HOUSEHOLD_NAME_MAX } from '$lib/utils/household';
	import { untrack } from 'svelte';

	type Props = {
		householdName: string;
		onclose: () => void;
	};

	let { householdName, onclose }: Props = $props();

	let open = $state(true);
	let name = $state(untrack(() => householdName));
	let submitting = $state(false);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title="Household name" eyebrow="Household">
	<form
		method="POST"
		action="?/renameHousehold"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<TextField
			label="Name"
			name="name"
			bind:value={name}
			{error}
			placeholder="Sonnengasse 12"
			maxlength={HOUSEHOLD_NAME_MAX}
			autocomplete="off"
			required
		/>

		<p class="note">Everyone in the house sees this name.</p>

		<Button type="submit" disabled={submitting || !name.trim()}>Save changes</Button>
	</form>
</BottomSheet>

<style>
	.note {
		margin: 12px 2px 22px;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
