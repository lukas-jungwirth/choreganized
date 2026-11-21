<!--
	A link that no longer works [G8] (→ SPEC §11.15): unknown, replaced by "Make
	a new link", or its guest removed. One page for all three, status 404, and
	it names nobody: whoever holds an old link learns nothing from it. Any other
	error (the server down, say) says so instead of sending the guest off to ask
	for a new link that would fail the same way.
-->
<script lang="ts">
	import { page } from '$app/state';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import Unlink from '@lucide/svelte/icons/unlink';
	import GuestBrand from '$lib/components/expenses/GuestBrand.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import { messages } from '$lib/i18n';

	const m = messages();
	const g = m.expenses.guestPage;
	const dead = $derived(page.status === 404);
	const title = $derived(dead ? g.deadTitle : g.brokenTitle);
</script>

<svelte:head>
	<title>{m.common.pageTitle(title)}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Screen>
	<GuestBrand />
	<div class="gone">
		<span class="well" aria-hidden="true">
			{#if dead}<Unlink size={26} strokeWidth={1.9} />{:else}<CloudOff
					size={26}
					strokeWidth={1.9}
				/>{/if}
		</span>
		<h1>{title}</h1>
		<p>{dead ? g.deadCopy : g.brokenCopy}</p>
	</div>
</Screen>

<style>
	.gone {
		display: grid;
		justify-items: center;
		gap: 8px;
		margin: auto 0;
		padding: 0 16px;
		text-align: center;
	}

	.well {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 18px;
		background: var(--sunken);
		color: var(--text-3);
	}

	h1 {
		margin: 0;
		font-size: var(--fs-24);
		overflow-wrap: anywhere;
	}

	p {
		margin: 0;
		font-size: var(--fs-16);
		line-height: 1.45;
		color: var(--text-4);
	}
</style>
