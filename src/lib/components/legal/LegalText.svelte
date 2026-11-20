<!--
	The operator's Impressum or Datenschutz text, as blocks (→ utils/legal-text).
	Every word goes through Svelte's text binding, never `{@html}`: the text is
	shown exactly as written, and nothing in it can become markup.
-->
<script lang="ts">
	import type { Block, Line } from '$lib/utils/legal-text';

	let { blocks }: { blocks: Block[] } = $props();
</script>

{#snippet line(parts: Line)}
	{#each parts as part, index (index)}
		{#if part.kind === 'link'}
			<a
				href={part.href}
				target={part.external ? '_blank' : undefined}
				rel={part.external ? 'noopener noreferrer' : undefined}>{part.text}</a
			>
		{:else}{part.text}{/if}
	{/each}
{/snippet}

{#snippet lines(all: Line[])}
	{#each all as parts, index (index)}
		{#if index > 0}<br />{/if}{@render line(parts)}
	{/each}
{/snippet}

<div class="legal-text">
	{#each blocks as block, index (index)}
		{#if block.kind === 'heading'}
			<h2>{block.text}</h2>
		{:else if block.kind === 'list'}
			<ul>
				{#each block.items as item, at (at)}
					<li>{@render lines(item)}</li>
				{/each}
			</ul>
		{:else}
			<p>{@render lines(block.lines)}</p>
		{/if}
	{/each}
</div>

<style>
	.legal-text {
		display: grid;
		gap: 12px;
		font-size: var(--fs-16);
		line-height: 1.55;
		color: var(--text-2);
		/* An address or a long URL must wrap rather than push the card sideways. */
		overflow-wrap: anywhere;
	}

	h2 {
		margin: 8px 0 -4px;
		font-size: var(--fs-20);
		line-height: 1.25;
		color: var(--ink);
	}

	h2:first-child {
		margin-top: 0;
	}

	p,
	ul {
		margin: 0;
	}

	ul {
		display: grid;
		gap: 6px;
		padding-left: 22px;
	}

	li::marker {
		color: var(--text-5);
	}

	/* The deep green: running text needs more contrast than a button's label. */
	a {
		color: var(--sage-deep);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--border-dashed);
	}
</style>
