<!--
	The one floating action per screen — "new task" [4a], "new recipe".
	Pinned above the tab bar and to the shell's right edge, so it stays inside
	the 480px column on a desktop window instead of drifting to the viewport edge.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/** Announced to screen readers; the button itself is icon-only. */
		label: string;
		href?: string;
		onclick?: () => void;
		children: Snippet;
	};

	let { label, href, onclick, children }: Props = $props();
</script>

{#if href}
	<a class="fab" {href} aria-label={label}>{@render children()}</a>
{:else}
	<button type="button" class="fab" aria-label={label} {onclick}>{@render children()}</button>
{/if}

<style>
	.fab {
		position: fixed;
		right: max(22px, calc(50% - 240px + 22px));
		bottom: calc(var(--tabbar-h) + 16px + env(safe-area-inset-bottom));
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: var(--sage);
		color: var(--on-sage);
		box-shadow: var(--shadow-fab);
		transition: transform 120ms ease-out;
	}

	.fab:active {
		transform: scale(0.94);
	}

	@media (prefers-reduced-motion: reduce) {
		.fab {
			transition: none;
		}
		.fab:active {
			transform: none;
		}
	}
</style>
