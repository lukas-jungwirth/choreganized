<!--
	The phone shell every tab sits in: one column, max 480px, tab-bar-aware
	bottom padding (→ DESIGN-SYSTEM.md "Layout rules").

	Cook mode is the one route inside `(app)` that opts out — it's full-bleed,
	dark and hands-free, so it gets the viewport to itself and no tab bar. It is
	also the one route with no timer dock, because there the ring is right there.
-->
<script lang="ts">
	import { page } from '$app/state';
	import TimerDock from '$lib/components/cooking/TimerDock.svelte';
	import TabBar from '$lib/components/shell/TabBar.svelte';
	import { cookTimers } from '$lib/cook-timer.svelte';
	import { messages } from '$lib/i18n';
	import { refetchOnFocus } from '$lib/refetch';
	import { untrack } from 'svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const cookMode = $derived(page.route.id?.endsWith('/cook') ?? false);

	// The timers are a module singleton, so on a server they are shared between
	// requests: `ready` is a no-op outside the browser, and `sync` only ever runs
	// from an effect, which never runs during SSR (→ DECISIONS #103).
	cookTimers.ready(messages());

	// `untrack` is load-bearing: `sync` reads `phase` and `remainingMs`, both of
	// which the 200ms ticker writes. Tracked, this effect would re-run five times
	// a second against a stale `data.timers` and drop live timers on the floor.
	$effect(() => {
		const timers = data.timers;
		const fetchedAt = data.timersFetchedAt;
		untrack(() => cookTimers.sync(timers, fetchedAt));
	});

	// Freshness without SSE: a housemate's changes are on screen by the time you
	// look at the phone again (→ docs/ARCHITECTURE.md).
	$effect(refetchOnFocus);
</script>

{#if cookMode}
	{@render children()}
{:else}
	<!-- <main>, like Screen.svelte outside the group: every screen in the app
		 should expose the same landmark to assistive tech.

		 The dock is fixed, so the shell has to make room for it: a bar that covers
		 the last row of a list is worse than no bar. The FAB is rendered inside
		 the page, so it inherits the same variable through the DOM. -->
	<main
		class="app-shell"
		style:--timer-dock-h={cookTimers.any ? 'var(--timer-dock-open-h)' : '0px'}
	>
		{@render children()}
	</main>
	<TimerDock />
	<TabBar overdueCount={data.overdue.length} />
{/if}

<style>
	.app-shell {
		max-width: 480px;
		min-height: 100dvh;
		margin: 0 auto;
		/* Installed as a PWA there's a status bar above us, hence the inset. */
		padding: calc(8px + env(safe-area-inset-top)) var(--page-pad)
			calc(var(--tabbar-h) + var(--timer-dock-h) + 24px + env(safe-area-inset-bottom));
	}
</style>
