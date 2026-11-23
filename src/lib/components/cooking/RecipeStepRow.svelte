<!--
	One step as the recipe shows it [7a] [V2] (→ plan 43): its number, its text
	with the words a stored link names underlined and the amounts rewritten for
	the count being read for (`viewRuns`), and its own timer. The recipe view and
	the import's review [R1] [R2] (→ plan 45) both draw it, so the two cannot
	drift apart.

	In the review the step is a button (tapping it edits that one step), and
	what the import asks about it stands under the text (`children`). Goes in an
	`<ol>`.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { ViewRun } from '$lib/utils/step-links';
	import Timer from '@lucide/svelte/icons/timer';
	import type { Snippet } from 'svelte';

	type Props = {
		number: number;
		runs: ViewRun[];
		/** The step's own timer as its chip reads ("Nudeln · 10:00"); null for none. */
		timer?: string | null;
		/** Tapping the text edits the step (the review); absent: plain text (the recipe). */
		onclick?: () => void;
		/** The button's name for a screen reader, when the text is one. */
		label?: string;
		children?: Snippet;
	};

	let { number, runs, timer = null, onclick, label, children }: Props = $props();

	const m = messages();
</script>

<li>
	<span class="number" aria-hidden="true">{number}</span>
	<div class="body">
		{#if onclick}
			<button type="button" class="text" aria-label={label} {onclick}>{@render text()}</button>
		{:else}
			{@render text()}
		{/if}
		<!-- The step's own timer (→ plan 21), so it is no surprise in cook mode. -->
		{#if timer}
			<span class="timer">
				<Timer size={13} strokeWidth={2.2} aria-hidden="true" />
				{timer}
			</span>
		{/if}
		{@render children?.()}
	</div>
</li>

<!-- No line breaks inside: whitespace here would be text (→ CookStepText). -->
{#snippet text()}
	<span class="step-text"
		>{#each runs as run, at (at)}{#if run.scaledFrom}<span class="scaled"
					>{run.text}<span class="said">{m.cooking.cook.scaledFrom(run.scaledFrom)}</span></span
				>{:else if run.linked}<span class="linked">{run.text}</span
				>{:else}{run.text}{/if}{/each}</span
	>
{/snippet}

<style>
	li {
		display: flex;
		gap: 13px;
		margin-bottom: 16px;
	}

	.number {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--sage);
		font-size: var(--fs-15);
		font-weight: 700;
		color: var(--on-sage);
	}

	.body {
		flex: 1;
		min-width: 0;
		padding-top: 2px;
	}

	.text {
		display: block;
		width: 100%;
		text-align: left;
	}

	.step-text {
		display: block;
		font-size: var(--fs-16);
		line-height: 1.5;
		color: var(--ink);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	/* A word a stored link names (→ plan 43): cook mode's underline, quieter. */
	.linked {
		text-decoration: underline;
		text-decoration-color: var(--gold);
		text-decoration-thickness: 2px;
		text-underline-offset: 4px;
	}

	/* An amount rewritten for the count being read for (→ plan 23). */
	.scaled {
		font-weight: 600;
		color: var(--sage-deep);
	}

	/* What the recipe itself says there, for a screen reader. */
	.said {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.timer {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-top: 6px;
		padding: 3px 10px;
		border-radius: var(--r-chip);
		background: var(--sage-tint);
		font-size: var(--fs-14);
		font-weight: 600;
		color: var(--sage-deep);
		font-variant-numeric: tabular-nums;
	}
</style>
