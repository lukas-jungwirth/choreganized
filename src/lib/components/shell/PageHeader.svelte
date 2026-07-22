<!--
	The title line a tab opens with: "Shopping" + "2 of 9 done" [03],
	"Tasks" [4a]. Baseline-aligned, because the meta is a caption on the title
	rather than a control.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** Right-hand caption — a count, a month, a status. */
		meta?: string;
		/** Anything richer than a caption (a button, an overflow menu). */
		actions?: Snippet;
	};

	let { title, meta, actions }: Props = $props();
</script>

<header>
	<h1>{title}</h1>
	{#if meta}<span class="meta">{meta}</span>{/if}
	{#if actions}{@render actions()}{/if}
</header>

<style>
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 0 16px;
	}

	h1 {
		font-size: 30px;
	}

	.meta {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-4);
	}
</style>
