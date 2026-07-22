<!--
	Button — primary (sage), secondary (white + hairline), dark ("Start cook
	mode"), danger (confirm dialogs). Full-width by default, like every CTA in
	the mockups; pass `class` to override. Renders an <a> when `href` is set so
	navigational CTAs stay real links.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		variant?: 'primary' | 'secondary' | 'dark' | 'danger';
		href?: string;
		children: Snippet;
	};

	let { variant = 'primary', href, children, class: className = '', ...rest }: Props = $props();

	// Button-only attributes (`type`, `formaction`, …) are meaningless next to
	// `href`; callers pass one shape or the other.
	const linkProps = $derived(rest as HTMLAnchorAttributes);
</script>

{#if href}
	<a class="button {variant} {className}" {href} {...linkProps}>{@render children()}</a>
{:else}
	<button class="button {variant} {className}" {...rest}>{@render children()}</button>
{/if}

<style>
	.button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		width: 100%;
		padding: 16px;
		border: 1.5px solid transparent;
		border-radius: var(--r-button);
		font-size: 16px;
		font-weight: 700;
		text-align: center;
		transition: transform 120ms ease-out;
	}

	.button:active:not(:disabled) {
		transform: scale(0.99);
	}

	.button:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.primary {
		background: var(--sage);
		color: var(--on-sage);
		box-shadow: var(--shadow-button);
	}

	.secondary {
		background: var(--card);
		border-color: var(--border);
		color: var(--ink);
	}

	.dark {
		background: var(--ink);
		color: var(--card);
	}

	.danger {
		background: var(--danger);
		color: var(--on-sage);
	}

	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
		.button:active:not(:disabled) {
			transform: none;
		}
	}
</style>
