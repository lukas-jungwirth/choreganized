<!--
	The end of every list's header on the overview (Lukas 2026-11-20): one pill
	that says what is on the list and opens it full screen, "4 ›". It replaced
	the count beside a boxed two-arrows button, two unrelated things side by
	side.

	On a shopping list's card it is the link (`href`), with its own accessible
	name ("Open Grocery, 4 to get"); the rest of the header still folds the
	card. In a checklist's row the whole row is already the link, so the pill is
	drawn without one.

	Drawn at 34px on the sunken fill; the ::after grows a link's target to 44.
	It never shrinks: at 200% text the list's name truncates instead.
-->
<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Snippet } from 'svelte';

	type Props = {
		/** Where it opens; leave it out inside something that is already a link. */
		href?: string;
		/** The link's accessible name. */
		label?: string;
		/** The list is complete: the content turns sage. */
		done?: boolean;
		children: Snippet;
	};

	let { href, label, done = false, children }: Props = $props();
</script>

{#if href}
	<a class="pill" class:done {href} aria-label={label}>
		{@render children()}
		<span class="go" aria-hidden="true"><ChevronRight size={15} strokeWidth={2.4} /></span>
	</a>
{:else}
	<span class="pill" class:done>
		{@render children()}
		<span class="go" aria-hidden="true"><ChevronRight size={15} strokeWidth={2.4} /></span>
	</span>
{/if}

<style>
	.pill {
		position: relative;
		display: flex;
		flex: none;
		align-items: center;
		align-self: center;
		gap: 5px;
		min-height: 34px;
		padding: 0 7px 0 12px;
		border-radius: var(--r-chip);
		background: var(--sunken);
		font-size: var(--fs-15);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--text-3);
		text-decoration: none;
	}

	a.pill::after {
		content: '';
		position: absolute;
		inset: -5px -2px;
	}

	.pill.done {
		color: var(--sage-deep);
	}

	.go {
		display: flex;
		color: var(--text-5);
	}
</style>
