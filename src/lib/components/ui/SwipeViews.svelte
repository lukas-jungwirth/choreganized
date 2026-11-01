<!--
	The area under a navigating SegmentedControl that pages under a sideways
	swipe (→ `$lib/swipe`, DECISIONS #206–#208). Hand it the switch's own
	options and value: leftwards follows the next option's link, rightwards the
	one before, past either end nothing. A shortcut only — the switch stays.

	`fill` stretches the area down to the tab bar, so a short page (History's two
	cards, a short to-do list) swipes anywhere on screen, not just over its
	content. Leave it off where something that doesn't page sits below (Cooking's
	library). It works because the app shell turns into a column for it.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { neighbour, swipe, type SwipeDirection } from '$lib/swipe';
	import type { Snippet } from 'svelte';

	type Props = {
		/** The switch's options; only those with an `href` can be paged to. */
		options: { value: string; href?: string }[];
		/** The view on screen. */
		value: string;
		/** Stretch to the bottom of the screen. */
		fill?: boolean;
		/** Keep the scroll position, as the switch's links do with `data-sveltekit-noscroll`. */
		noScroll?: boolean;
		children: Snippet;
	};

	let { options, value, fill = false, noScroll = false, children }: Props = $props();

	function page(direction: SwipeDirection) {
		const target = neighbour(options, value, direction);
		if (target?.href) goto(target.href, { noScroll });
	}
</script>

<div class="swipe-views" data-swipe-fill={fill || undefined} use:swipe={page}>
	{@render children()}
</div>

<style>
	.swipe-views[data-swipe-fill] {
		flex: 1;
	}
</style>
