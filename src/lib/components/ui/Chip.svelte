<!--
	Pill selector — stores [3a], effort and assignee [3b], snooze presets [4c].

	Two palettes. Plain chips select in sage. Give a `color` (a member's) and the
	chip selects in that member's colour instead: tinted fill, coloured hairline,
	darkened label — the design does this for the two member chips, and mixing
	the colour covers the three palette entries it never drew (→ DECISIONS.md).

	Give it an `href` and it is a link drawn as a chip — the recipe library's
	filter row (→ plan 40), where each chip is the address of the next list, so
	the filters work without JavaScript and land in the history. A link has no
	pressed state to announce; `selected` only paints it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		selected?: boolean;
		/** Member colour; omit for the sage selection. */
		color?: string;
		/** Render a link to this address instead of a button. */
		href?: string;
		/** The link's accessible name, when its text alone doesn't say what it does. */
		'aria-label'?: string;
		children: Snippet;
	};

	// `class` is destructured out rather than left in `rest`: spreading it would
	// replace the base class instead of adding to it, silently stripping the
	// pill's padding, border and background (Button.svelte does the same).
	let { selected = false, color, href, children, class: className = '', ...rest }: Props = $props();
</script>

{#if href}
	<a
		{href}
		class="chip {className}"
		class:selected
		aria-label={rest['aria-label']}
		data-sveltekit-noscroll
	>
		{@render children()}
	</a>
{:else}
	<button
		type="button"
		{...rest}
		class="chip {className}"
		class:selected
		class:member={color !== undefined}
		style:--chip-color={color}
		aria-pressed={selected}
	>
		{@render children()}
	</button>
{/if}

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 9px 14px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-chip);
		background: var(--card);
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--text-2);
		white-space: nowrap;
		text-decoration: none;
	}

	.chip:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.selected {
		border-color: var(--sage);
		background: var(--sage);
		color: var(--on-sage);
	}

	/* An avatar inside the chip sits flush with the left edge. */
	.member {
		padding-left: 6px;
	}

	.member.selected {
		border-color: var(--chip-color);
		background: color-mix(in srgb, var(--chip-color) 10%, var(--card));
		color: color-mix(in srgb, var(--chip-color) 55%, var(--ink));
	}
</style>
