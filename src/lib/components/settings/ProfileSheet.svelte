<!--
	Edit your profile [6a] — the name and colour every avatar, chip and feed row
	in the household paints you with.

	Colours are the household's scarce resource, so the picker greys out the ones
	housemates already wear (the same rule onboarding applies, SPEC §1.5) and the
	service re-checks on submit: somebody could have taken it while this sheet
	was open.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { DISPLAY_NAME_MAX } from '$lib/utils/household';
	import { untrack } from 'svelte';

	type Props = {
		displayName: string;
		color: string;
		/** Colours the housemates wear — everything but your own. */
		takenColors: string[];
		onclose: () => void;
	};

	let { displayName, color, takenColors, onclose }: Props = $props();

	// Seeded once and then owned by the form — a re-render from the page must
	// not overwrite what's being typed.
	let open = $state(true);
	let name = $state(untrack(() => displayName));
	let picked = $state(untrack(() => color));
	let submitting = $state(false);
	/** This form's own rejection, not `$page.form` (as in TaskFormSheet). */
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title="Your profile" eyebrow="Account">
	<form
		method="POST"
		action="?/profile"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				// A taken colour keeps the sheet open with the reason on it.
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<TextField
			label="Display name"
			name="displayName"
			bind:value={name}
			{error}
			maxlength={DISPLAY_NAME_MAX}
			autocomplete="given-name"
			required
		/>

		<p class="label">Your colour</p>
		<div class="colour">
			<Avatar {name} color={picked} size={52} />
			<ColorPicker bind:value={picked} taken={takenColors} />
		</div>

		<Button type="submit" disabled={submitting || !name.trim()}>Save changes</Button>
	</form>
</BottomSheet>

<style>
	.label {
		margin: 22px 0 12px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.colour {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	form :global(.button) {
		margin-top: 26px;
	}
</style>
