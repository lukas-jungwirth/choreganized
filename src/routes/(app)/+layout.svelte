<!--
	The phone shell every tab sits in: one column, max 480px, tab-bar-aware
	bottom padding (→ DESIGN-SYSTEM.md "Layout rules").

	Cook mode is the one route inside `(app)` that opts out — it's full-bleed,
	dark and hands-free, so it gets the viewport to itself and no tab bar.
-->
<script lang="ts">
	import { page } from '$app/state';
	import TabBar from '$lib/components/shell/TabBar.svelte';
	import { refetchOnFocus } from '$lib/refetch';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const cookMode = $derived(page.route.id?.endsWith('/cook') ?? false);

	// Freshness without SSE: a housemate's changes are on screen by the time you
	// look at the phone again (→ docs/ARCHITECTURE.md).
	$effect(refetchOnFocus);
</script>

{#if cookMode}
	{@render children()}
{:else}
	<!-- <main>, like Screen.svelte outside the group: every screen in the app
		 should expose the same landmark to assistive tech. -->
	<main class="app-shell">
		{@render children()}
	</main>
	<TabBar overdueCount={data.overdue.length} />
{/if}

<style>
	.app-shell {
		max-width: 480px;
		min-height: 100dvh;
		margin: 0 auto;
		/* Installed as a PWA there's a status bar above us, hence the inset. */
		padding: calc(8px + env(safe-area-inset-top)) var(--page-pad)
			calc(var(--tabbar-h) + 24px + env(safe-area-inset-bottom));
	}
</style>
