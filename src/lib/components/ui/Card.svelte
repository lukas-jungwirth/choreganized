<!--
	The white surface everything on a screen sits on: radius, hairline shadow, and
	nothing else. Padding varies card by card in the mockups, so it stays with the
	caller. Renders an <a> when `href` is set — most cards are tappable.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		href?: string;
		/** `lg` = 22px (dashboard cards), `md` = 20px (list & tile cards). */
		radius?: 'lg' | 'md';
		children: Snippet;
	};

	let { href, radius = 'lg', children }: Props = $props();
</script>

{#if href}
	<a class="card {radius}" {href}>{@render children()}</a>
{:else}
	<div class="card {radius}">{@render children()}</div>
{/if}

<style>
	.card {
		display: block;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: inherit;
		/* White surface, so a field inside one sinks — same as in a sheet. */
		--input-surface: var(--field);
	}

	.lg {
		border-radius: var(--r-card-lg);
	}

	.md {
		border-radius: var(--r-card);
	}

	a.card {
		transition: transform 120ms ease-out;
	}

	a.card:active {
		transform: scale(0.99);
	}

	@media (prefers-reduced-motion: reduce) {
		a.card {
			transition: none;
		}
		a.card:active {
			transform: none;
		}
	}
</style>
