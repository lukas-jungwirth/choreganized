<!--
	A link that no longer works [G8] (→ SPEC §11.15): unknown, replaced by "Make
	a new link", or its guest removed. One page for all three, status 404, and
	it names nobody: whoever holds an old link learns nothing from it.
-->
<script lang="ts">
	import Unlink from '@lucide/svelte/icons/unlink';
	import Screen from '$lib/components/shell/Screen.svelte';
	import { messages } from '$lib/i18n';

	const m = messages();
	const g = m.expenses.guestPage;
</script>

<svelte:head>
	<title>{m.common.pageTitle(g.deadTitle)}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Screen>
	<p class="brand"><span class="mark" aria-hidden="true"></span>{m.common.appName}</p>
	<div class="gone">
		<span class="well" aria-hidden="true"><Unlink size={26} strokeWidth={1.9} /></span>
		<h1>{g.deadTitle}</h1>
		<p>{g.deadCopy}</p>
	</div>
</Screen>

<style>
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 6px 0 22px;
		font-size: var(--fs-14);
		font-weight: 700;
		color: var(--text-3);
	}

	.mark {
		width: 22px;
		height: 22px;
		border-radius: 7px;
		background: var(--sage);
	}

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
