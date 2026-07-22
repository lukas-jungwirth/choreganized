<!--
	Join a household [5e]. Step 1 is the six-box code; once it resolves, the same
	screen shows who invited you and asks for your name and colour (SPEC §1.5).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import logoMark from '$lib/assets/logo-mark.svg';
	import CodeInput from '$lib/components/onboarding/CodeInput.svelte';
	import InvitePreviewCard from '$lib/components/onboarding/InvitePreviewCard.svelte';
	import StepHeader from '$lib/components/onboarding/StepHeader.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { firstFreeColor } from '$lib/member-colors';
	import { INVITE_CODE_LENGTH } from '$lib/utils/invite-code';
	import { untrack } from 'svelte';
	import type { PageProps, SubmitFunction } from './$types';

	let { data, form }: PageProps = $props();

	// Seeded once — see the note on the create screen.
	let code = $state(untrack(() => form?.code ?? data.code));
	let displayName = $state(untrack(() => data.firstName));
	let submitting = $state(false);

	/**
	 * Both steps live on this route, so the component isn't remounted when the
	 * code resolves — a plain `$state` default would still hold the colour picked
	 * before the household (and its taken colours) was known. Default from the
	 * data, override once the user chooses, and fall back again if that choice
	 * turns out to be taken (the other housemate joined while you were typing).
	 */
	let pickedColor = $state<string | null>(null);
	const color = $derived.by(() => {
		const taken = data.preview?.takenColors ?? [];
		return pickedColor && !taken.includes(pickedColor) ? pickedColor : firstFreeColor(taken);
	});

	const error = $derived(form?.error ?? data.error);

	const trackSubmit: SubmitFunction = () => {
		submitting = true;
		return async ({ update }) => {
			// Keep what they typed when validation sends the form back.
			await update({ reset: false });
			submitting = false;
		};
	};
</script>

<svelte:head>
	<title>Join a household · Choreganized</title>
</svelte:head>

<Screen>
	{#if data.preview}
		<!-- `?code=` beats the cookie, so this really does go back a step. -->
		<StepHeader step={2} back="/onboarding/join?code=" backLabel="Enter a different code" />

		<h1 class="title">Set up your profile</h1>

		<InvitePreviewCard householdName={data.preview.householdName} inviter={data.preview.inviter} />

		<form method="POST" action="?/join" use:enhance={trackSubmit}>
			<input type="hidden" name="code" value={data.preview.code} />

			<TextField
				label="Your display name"
				name="displayName"
				bind:value={displayName}
				maxlength={40}
				autocomplete="given-name"
				required
			/>

			<div class="colour">
				<p class="label">Your colour</p>
				<div class="row">
					<Avatar name={displayName} {color} size={52} />
					<ColorPicker
						bind:value={() => color, (next) => (pickedColor = next)}
						taken={data.preview.takenColors}
					/>
				</div>
			</div>

			{#if error}<p class="error" role="alert">{error}</p>{/if}

			<div class="cta">
				<Button type="submit" disabled={submitting}>Join household</Button>
			</div>
		</form>
	{:else}
		<StepHeader step={1} back="/onboarding" backLabel="Back to the start" />

		<header class="centered">
			<span class="mark"><img src={logoMark} alt="" width="34" height="34" /></span>
			<h1>Join a household</h1>
		</header>

		<form method="POST" action="?/verify" use:enhance={trackSubmit}>
			<p class="label centered">Invite code</p>
			<CodeInput bind:value={code} autofocus />

			{#if error}<p class="error centered" role="alert">{error}</p>{/if}

			<div class="cta">
				<Button type="submit" disabled={submitting || code.length < INVITE_CODE_LENGTH}>
					Continue
				</Button>
			</div>
		</form>
	{/if}
</Screen>

<style>
	.centered {
		text-align: center;
	}

	header {
		margin: 14px 0 26px;
	}

	.mark {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		margin: 0 auto 14px;
		border-radius: var(--r-input);
		background: var(--sage);
		box-shadow: var(--shadow-button);
	}

	.mark img {
		display: block;
	}

	h1 {
		font-size: 26px;
	}

	h1.title {
		margin: 14px 0 22px;
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		flex: 1;
		gap: 22px;
		margin-top: 24px;
	}

	.label {
		margin: 0 0 10px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.colour .row {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.error {
		margin: -8px 0 0;
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--danger-deep);
	}

	.cta {
		margin-top: auto;
		padding-top: 18px;
	}
</style>
