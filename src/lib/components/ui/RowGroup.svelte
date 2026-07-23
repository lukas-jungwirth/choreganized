<!--
	The white block a settings-style list sits in: rounded, hairline shadow, and
	a divider between every child. Settings groups its sections this way [6a],
	the members list its people [6b], and the ••• menus their actions [7c].

	Children are the rows — one element each, whether written inline or rendered
	by a component. Padding belongs to the row, like Card, because it differs
	between a 52px preference row and a two-line member row.

	`list` swaps the block for a `<ul>`, for the groups whose rows really are a
	list rather than a set of controls — the history feed [8a], and plan 10's
	members [6b]. Its rows must then be `<li>`s: an `<li>` outside a list element
	is invalid markup, and the browser exposes it as a listitem with nothing to
	belong to.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/**
		 * `sunken` is the in-sheet variant [7c] [3a]: white on white needs a shadow
		 * to read as a block, but a block *inside* a white panel gets its edges
		 * from the tint instead — and `--r-block` is the radius the design draws
		 * those at.
		 */
		surface?: 'card' | 'sunken';
		/** Render a `<ul>` (rows are `<li>`s) instead of the default `<div>`. */
		list?: boolean;
		children: Snippet;
	};

	let { surface = 'card', list = false, children }: Props = $props();
</script>

{#if list}
	<ul class="group {surface}">{@render children()}</ul>
{:else}
	<div class="group {surface}">{@render children()}</div>
{/if}

<style>
	.group {
		/* Clips the first and last row's corners into the block's. */
		overflow: hidden;
		/* Only the `<ul>` carries these; harmless on the `<div>`. */
		margin: 0;
		padding: 0;
		list-style: none;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
		/* White surface, so a field inside one sinks — same as Card. */
		--input-surface: var(--field);
	}

	.sunken {
		border-radius: var(--r-block);
		background: var(--field);
		box-shadow: none;
		--input-surface: var(--card);
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

	.sunken > :global(* + *) {
		border-top-color: var(--divider-sheet);
	}
</style>
