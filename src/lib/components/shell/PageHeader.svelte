<!--
	The title line a tab opens with: "Shopping" + "2 of 9 done" [03],
	"Tasks" [4a]. Baseline-aligned, because the meta is a caption on the title
	rather than a control.

	With a `mascot` the tab's raccoon stands left of the title and the caption
	moves under the title instead of beside it, so the line still fits at 390px.
	Title, caption and actions all sit on the raccoon's feet (→ DECISIONS #211,
	#212).
-->
<script lang="ts">
	import type { MascotName } from '$lib/assets/mascot';
	import Mascot from '$lib/components/ui/Mascot.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		/** Right-hand caption — a count, a month, a status. */
		meta?: string;
		/** Anything richer than a caption (a button, an overflow menu). */
		actions?: Snippet;
		/** The tab's raccoon; decorative. */
		mascot?: MascotName;
	};

	let { title, meta, actions, mascot }: Props = $props();
</script>

{#if mascot}
	<header class="mascot">
		<Mascot name={mascot} height={88} class="art" />
		<div class="titles">
			<h1>{title}</h1>
			{#if meta}<span class="meta">{meta}</span>{/if}
		</div>
		{#if actions}<div class="trailing">{@render actions()}</div>{/if}
	</header>
{:else}
	<header>
		<h1>{title}</h1>
		{#if meta || actions}
			<!-- One trailing group, so a screen with both ("2 of 9 done" + the stores
				 button) doesn't strand the caption in the middle of the line. -->
			<div class="trailing">
				{#if meta}<span class="meta">{meta}</span>{/if}
				{#if actions}{@render actions()}{/if}
			</div>
		{/if}
	</header>
{/if}

<style>
	/* Wraps when the reader's text size leaves no room beside the title: the
	   trailing group drops under it and keeps to the right. */
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 4px 12px;
		padding: 8px 0 16px;
	}

	.trailing {
		display: flex;
		align-items: baseline;
		flex: none;
		gap: 12px;
		margin-left: auto;
	}

	h1 {
		font-size: var(--fs-32);
	}

	.meta {
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--text-4);
	}

	/* The raccoon is the size of the title and its caption together and a
	   half again, so it reads at arm's length; it takes the header's top
	   padding, having air of its own in the art. */
	header.mascot {
		flex-wrap: nowrap;
		align-items: flex-end;
		justify-content: flex-start;
		gap: 12px;
		padding-top: 0;
	}

	header.mascot :global(.art) {
		margin-left: -4px;
	}

	.titles {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	/* One line: a caption can carry a recipe's name ("Today: …"). */
	.titles .meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.titles h1 {
		overflow-wrap: anywhere;
	}

	header.mascot .trailing {
		margin-left: 0;
	}
</style>
