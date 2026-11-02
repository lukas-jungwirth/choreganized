<!-- Public invite landing: "{inviter} invited you to {household}" → sign in → join. -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import InvitePreviewCard from '$lib/components/onboarding/InvitePreviewCard.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Mascot from '$lib/components/ui/Mascot.svelte';
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
		<Mascot name="head" height={70} class="mark" />
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

	header :global(.mark) {
		margin: 0 auto 12px;
	}

	h1 {
		font-size: var(--fs-28);
	}

	.copy {
		margin: 20px 0 0;
		text-align: center;
		font-size: var(--fs-16);
		line-height: 1.5;
		color: var(--text-4);
	}

	form,
	.cta {
		margin-top: auto;
		padding-top: 22px;
	}
</style>
