<!--
	The phone shell every full-page screen sits in: one column, max 480px, the
	design's 28px gutters and a safe-area-aware bottom (→ DESIGN-SYSTEM.md
	"Layout rules"). Pages fill it with flex — `margin-top: auto` on a footer
	block pins it to the bottom, as the mockups do.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<main class="screen">
	{@render children()}
</main>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		/* Not `100dvh`: in an installed PWA on Android (seen on a Pixel 9a) that
		   counts the status bar the page doesn't get, so the footer — Continue on
		   the onboarding chooser — ended a status bar below the screen. `100%` is
		   the page's real height, carried down from `html, body` (→ app.css). */
		min-height: 100%;
		max-width: 480px;
		margin: 0 auto;
		padding: 14px 28px calc(34px + env(safe-area-inset-bottom));
	}
</style>
