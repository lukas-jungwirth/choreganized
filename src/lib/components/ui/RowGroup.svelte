<!--
	The white block a settings-style list sits in: rounded, hairline shadow, and
	a divider between every child. Settings groups its sections this way [6a],
	the members list its people [6b], and the ••• menus their actions [7c].

	Children are the rows — one element each, whether written inline or rendered
	by a component. Padding belongs to the row, like Card, because it differs
	between a 52px preference row and a two-line member row.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
	};

	let { children }: Props = $props();
</script>

<div class="group">{@render children()}</div>

<style>
	.group {
		/* Clips the first and last row's corners into the block's. */
		overflow: hidden;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
		/* White surface, so a field inside one sinks — same as Card. */
		--input-surface: var(--field);
	}

	/*
		One hairline between rows, wherever they come from. `:global` because a row
		is often a component (EnablePush, plan 10's toggles), and scoped CSS stops
		at that boundary; `> * + *` keeps it to direct children, so a component
		that renders several rows draws its own internal dividers.
	*/
	.group > :global(* + *) {
		border-top: 1px solid var(--divider);
	}
</style>
