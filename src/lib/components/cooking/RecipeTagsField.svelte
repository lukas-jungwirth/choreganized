<!--
	The recipe form's Tags block [3c] (→ plan 40, sketch phone 4): the tag
	questions (`RecipeTagChips`) in a card.

	**Folded while empty** (Lukas, 2026-11-22): a recipe typed in by hand gets
	one quiet row, "Tags · meal, kind, diet", rather than four questions on top
	of everything else. Anything set — or suggested by an import (→ plan 41) —
	opens it, so an edit or an import always shows what is there. A native
	<details>, so the fold needs no state of its own.

	An import's suggestions open ticked and dotted, with a line saying where
	they came from.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { RecipeDiet, RecipeTag } from '$lib/utils/recipe-tags';
	import type { TagSuggestion } from '$lib/utils/recipes';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Tag from '@lucide/svelte/icons/tag';
	import { untrack } from 'svelte';
	import RecipeTagChips from './RecipeTagChips.svelte';

	type Props = {
		tags: RecipeTag[];
		diet: RecipeDiet | null;
		/** What an import suggests; it replaces `tags`/`diet` as the starting point. */
		suggested?: TagSuggestion | null;
	};

	let props: Props = $props();

	const m = messages();

	const start = untrack(() => props.suggested ?? { tags: props.tags, diet: props.diet });
	let tags = $state<RecipeTag[]>([...start.tags]);
	let diet = $state<RecipeDiet | null>(start.diet);
	const dots = untrack(() =>
		props.suggested
			? [...props.suggested.tags, ...(props.suggested.diet ? [`diet:${props.suggested.diet}`] : [])]
			: []
	);
	/** Open on arrival when anything is set; after that it's the reader's. */
	const startOpen = start.tags.length > 0 || start.diet !== null;

	const from = untrack(() => props.suggested?.from ?? null);
</script>

<details class="tags" open={startOpen}>
	<summary>
		<Tag size={17} strokeWidth={2} aria-hidden="true" />
		<span class="title">{m.cooking.tags.label}</span>
		<span class="hint">{m.cooking.tags.folded}</span>
		<ChevronDown size={18} strokeWidth={2.2} aria-hidden="true" class="chevron" />
	</summary>

	<div class="body">
		<RecipeTagChips bind:tags bind:diet suggested={dots} />
		{#if from}
			<p class="from">
				<span class="dot" aria-hidden="true"></span>{m.cooking.tags.suggestedFrom[from]}
			</p>
		{/if}
	</div>
</details>

<style>
	.tags {
		margin-top: 22px;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	summary {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 14px 16px;
		list-style: none;
		cursor: pointer;
		color: var(--text-2);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.title {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.hint {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	summary :global(.chevron) {
		flex: none;
		color: var(--text-4);
		transition: transform 0.15s;
	}

	.tags[open] summary :global(.chevron) {
		transform: rotate(180deg);
	}

	.body {
		padding: 0 16px 6px;
	}

	.from {
		display: flex;
		align-items: baseline;
		gap: 9px;
		margin: 0 0 10px;
		padding: 10px 12px;
		border-radius: var(--r-input);
		background: var(--sunken);
		font-size: var(--fs-14);
		color: var(--text-2);
	}

	.from .dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--gold);
	}

	@media (prefers-reduced-motion: reduce) {
		summary :global(.chevron) {
			transition: none;
		}
	}
</style>
