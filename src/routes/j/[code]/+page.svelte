<!-- Public invite landing: "{inviter} invited you to {household}" → sign in → join. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import logoMark from '$lib/assets/logo-mark.svg';
	import InvitePreviewCard from '$lib/components/onboarding/InvitePreviewCard.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const heading = $derived(
		data.preview ? m.onboarding.landing.invited : m.onboarding.landing.notFound
	);
</script>

<svelte:head>
	<title>{m.common.pageTitle(heading)}</title>
</svelte:head>

<Screen>
	<header>
		<span class="mark"><img src={logoMark} alt="" width="34" height="34" /></span>
		<h1>{heading}</h1>
	</header>

	{#if data.preview}
		<InvitePreviewCard householdName={data.preview.householdName} inviter={data.preview.inviter} />

		<p class="copy">{m.onboarding.landing.copy}</p>

		<form method="POST" use:enhance>
			<Button type="submit">{m.onboarding.landing.accept}</Button>
		</form>
	{:else}
		<p class="copy">{m.onboarding.landing.gone}</p>

		<div class="cta">
			<Button href="/login" variant="secondary">{m.onboarding.landing.goToSignIn}</Button>
		</div>
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
