<!--
	The header a screen below a tab opens with — "‹ Stores / Group your shopping
	list by shop" [7g], "‹ Members / Sonnengasse 12" [6b]. Smaller than
	PageHeader's 30px title, because you're a level down and the chevron is the
	first thing to read.
-->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** Where the chevron goes — the tab this screen hangs off. */
		back: string;
		backLabel?: string;
		subtitle?: string;
		/** Trailing controls, e.g. an overflow button. */
		actions?: Snippet;
	};

	let { title, back, backLabel = 'Back', subtitle, actions }: Props = $props();
</script>

<header>
	<a class="back" href={back} aria-label={backLabel}>
		<ChevronLeft size={20} strokeWidth={2.4} />
	</a>
	<div class="titles">
		<h1>{title}</h1>
		{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 4px 0 16px;
	}

	.back {
		display: grid;
		place-items: center;
		flex: none;
		/* Pulled left so the chevron's *glyph* lines up with the page gutter. */
		width: 28px;
		height: 28px;
		margin-left: -7px;
		color: var(--ink);
	}

	/* Long household names and store lists both live here — let them wrap
	   rather than push the page sideways at 390px. */
	.titles {
		min-width: 0;
	}

	h1 {
		font-size: 20px;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.subtitle {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--text-4);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-left: auto;
	}
</style>
