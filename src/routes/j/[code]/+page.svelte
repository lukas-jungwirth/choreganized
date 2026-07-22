<!-- Public invite landing: "{inviter} invited you to {household}" → sign in → join. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import logoMark from '$lib/assets/logo-mark.svg';
	import InvitePreviewCard from '$lib/components/onboarding/InvitePreviewCard.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.preview ? "You're invited" : 'Invite not found'} · Choreganized</title>
</svelte:head>

<Screen>
	<header>
		<span class="mark"><img src={logoMark} alt="" width="34" height="34" /></span>
		<h1>{data.preview ? "You're invited" : 'Invite not found'}</h1>
	</header>

	{#if data.preview}
		<InvitePreviewCard householdName={data.preview.householdName} inviter={data.preview.inviter} />

		<p class="copy">
			You'll share the shopping list, meal plan and tasks with them. Sign in with Google to join.
		</p>

		<form method="POST" use:enhance>
			<Button type="submit">Accept invitation</Button>
		</form>
	{:else}
		<p class="copy">
			This invite link isn't valid any more — the code may have been replaced or revoked. Ask your
			housemate for a fresh one.
		</p>

		<div class="cta"><Button href="/login" variant="secondary">Go to sign in</Button></div>
	{/if}
</Screen>

<style>
	header {
		margin: 14px 0 26px;
		text-align: center;
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

	.copy {
		margin: 20px 0 0;
		text-align: center;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}

	form,
	.cta {
		margin-top: auto;
		padding-top: 22px;
	}
</style>
