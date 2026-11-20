<!--
	RoundButton — a 38px circle on the card surface holding one icon: Expenses'
	••• menu and Home's gear to Settings (→ DECISIONS #264). Renders an <a> when
	`href` is set, like `Button`, so a way to another screen stays a real link.
	It always carries an `aria-label`, since the icon is all there is to see.
	Position it from the parent (`class` + `:global`); the shape lives here.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		href?: string;
		'aria-label': string;
		children: Snippet;
	};

	let { href, children, class: className = '', ...rest }: Props = $props();

	// Button-only attributes (`type`, `aria-expanded`, …) are meaningless next to
	// `href`; callers pass one shape or the other.
	const linkProps = $derived(rest as HTMLAnchorAttributes);
</script>

{#if href}
	<a class="round {className}" {href} {...linkProps}>{@render children()}</a>
{:else}
	<button type="button" class="round {className}" {...rest}>{@render children()}</button>
{/if}

<style>
	.round {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--text-4);
		transition: transform 120ms ease-out;
	}

	.round:active {
		transform: scale(0.97);
	}

	@media (prefers-reduced-motion: reduce) {
		.round {
			transition: none;
		}
		.round:active {
			transform: none;
		}
	}
</style>
