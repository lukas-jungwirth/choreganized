<!-- Set up your home [5c] — household name, your profile, your colour. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import StepHeader from '$lib/components/onboarding/StepHeader.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { MEMBER_COLORS } from '$lib/member-colors';
	import { DISPLAY_NAME_MAX, HOUSEHOLD_NAME_MAX } from '$lib/utils/household';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

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
	<title>{m.common.pageTitle(m.onboarding.create.title)}</title>
</svelte:head>

<Screen>
	<StepHeader step={1} back="/onboarding" backLabel={m.onboarding.backToStart} />

	<h1>{m.onboarding.create.title}</h1>

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
			label={m.onboarding.create.householdName}
			name="householdName"
			bind:value={householdName}
			error={form?.errors.householdName}
			placeholder={m.onboarding.create.householdPlaceholder}
			maxlength={HOUSEHOLD_NAME_MAX}
			autocomplete="off"
			required
		/>

		<TextField
			label={m.onboarding.create.displayName}
			name="displayName"
			bind:value={displayName}
			error={form?.errors.displayName}
			maxlength={DISPLAY_NAME_MAX}
			autocomplete="given-name"
			required
		/>

		<div class="colour">
			<p class="label">{m.ui.yourColour}</p>
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
			<Button type="submit" disabled={submitting}>{m.onboarding.start.continue}</Button>
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
