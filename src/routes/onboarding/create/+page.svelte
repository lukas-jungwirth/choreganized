<!-- Set up your home [5c] — household name, your profile, your colour. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import StepHeader from '$lib/components/onboarding/StepHeader.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { MEMBER_COLORS } from '$lib/member-colors';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Seeded once: after a failed submit the fields still hold what was typed, so
	// re-syncing them from `form` would fight the user (`untrack` says so).
	let householdName = $state(untrack(() => form?.values.householdName ?? ''));
	let displayName = $state(untrack(() => form?.values.displayName ?? data.firstName));
	let color = $state(untrack(() => form?.values.color || MEMBER_COLORS[0].value));
	let timezone = $state('');
	let submitting = $state(false);

	// Browser-only, so the household's clock is the creator's clock.
	$effect(() => {
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});
</script>

<svelte:head>
	<title>Set up your home · Choreganized</title>
</svelte:head>

<Screen>
	<StepHeader step={1} back="/onboarding" backLabel="Back to the start" />

	<h1>Set up your home</h1>

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				// Keep what they typed when validation sends the form back.
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<TextField
			label="Household name"
			name="householdName"
			bind:value={householdName}
			error={form?.errors.householdName}
			placeholder="Sonnengasse 12"
			maxlength={60}
			autocomplete="off"
			required
		/>

		<TextField
			label="Your display name"
			name="displayName"
			bind:value={displayName}
			error={form?.errors.displayName}
			maxlength={40}
			autocomplete="given-name"
			required
		/>

		<div class="colour">
			<p class="label">Your colour</p>
			<div class="row">
				<Avatar name={displayName} {color} size={52} />
				<ColorPicker bind:value={color} />
			</div>
			{#if form?.errors.color}
				<p class="error">{form.errors.color}</p>
			{/if}
		</div>

		<input type="hidden" name="timezone" value={timezone} />

		<div class="cta">
			<Button type="submit" disabled={submitting}>Continue</Button>
		</div>
	</form>
</Screen>

<style>
	h1 {
		margin: 14px 0 26px;
		font-size: 28px;
		line-height: 1.1;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 22px;
		flex: 1;
	}

	.colour .row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.label {
		margin: 0 0 12px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.error {
		margin: 8px 0 0;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.cta {
		margin-top: auto;
		padding-top: 18px;
	}
</style>
