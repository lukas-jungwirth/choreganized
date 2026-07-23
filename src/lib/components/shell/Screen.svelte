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
		min-height: 100dvh;
		max-width: 480px;
		margin: 0 auto;
		padding: 14px 28px calc(34px + env(safe-area-inset-bottom));
	}
</style>
