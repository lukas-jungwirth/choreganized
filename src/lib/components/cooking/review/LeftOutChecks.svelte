<!--
	A saved recipe's tidy (→ plan 48, DECISIONS #340): the sentences the model
	left out of the household's own steps, open at the end of the steps rather
	than folded, each a question in the gold of the other checks: "The AI left
	this out. It is removed when you save." with Put back and Leave it out.
	Answered with Leave it out, it gives way to a quiet line and Put back stays.
	An import keeps its folded list (`FoldList`): the page is still there.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { ReviewLeftOut } from '$lib/utils/recipe-review';
	import Check from '@lucide/svelte/icons/check';

	type Props = {
		entries: ReviewLeftOut[];
		onback: (id: string) => void;
		onleave: (id: string) => void;
	};

	let { entries, onback, onleave }: Props = $props();

	const m = messages();
	const t = m.cooking.import.review;
</script>

<ul class="left">
	{#each entries as entry (entry.id)}
		<li
			class="check"
			class:answered={entry.dropped}
			data-open-check={entry.dropped ? undefined : ''}
		>
			<q>{entry.text}</q>
			{#if entry.dropped}
				<p class="done">
					<Check size={15} strokeWidth={2.4} aria-hidden="true" />{t.leftOutRemoved}
				</p>
			{:else}
				<p>{t.leftOutLine}</p>
			{/if}
			<div class="opts">
				<button type="button" class="opt" onclick={() => onback(entry.id)}>{t.putBack}</button>
				{#if !entry.dropped}
					<button type="button" class="opt" onclick={() => onleave(entry.id)}>{t.leaveOut}</button>
				{/if}
			</div>
		</li>
	{/each}
</ul>

<style>
	.left {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.check {
		display: grid;
		gap: 8px;
		padding: 10px 12px;
		border-radius: var(--r-input);
		background: var(--gold-tint);
	}

	.check.answered {
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	q {
		font-size: var(--fs-16);
		line-height: 1.45;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	p {
		margin: 0;
		font-size: var(--fs-15);
		line-height: 1.4;
		color: var(--gold-deep);
	}

	.done {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.opt {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 6px 14px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: var(--fs-15);
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
	}

	.answered .opt {
		background: var(--sunken);
		box-shadow: none;
	}
</style>
