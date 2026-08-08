<!--
	History → "How chores are split" [8a] (→ SPEC §5.8). Not history: it reads the
	current recurring plan and shows each person's share of it, by design — the
	rota on paper, before anyone lifts a finger. The stacked bar is the split; the
	legend names it. Percentages are rounded, so they can read 99 or 101 together —
	the bar widths stay exact.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { ChoreShare } from '$lib/server/services/tasks';

	let { shares }: { shares: ChoreShare[] } = $props();

	const m = messages();

	/** Only slices with something in them get a bar segment; the legend keeps everyone. */
	const segments = $derived(shares.filter((slice) => slice.share > 0));
	const hasLoad = $derived(segments.length > 0);

	const pct = (share: number) => Math.round(share * 100);
</script>

<Card radius="lg">
	<div class="split">
		<h2>{m.tasks.split.title}</h2>
		<p class="subtitle">{m.tasks.split.subtitle}</p>

		{#if hasLoad}
			<div class="bar" aria-hidden="true">
				{#each segments as slice (slice.memberId)}
					<span class="seg" style:flex-grow={slice.share} style:background={slice.color}></span>
				{/each}
			</div>

			<ul class="legend">
				{#each shares as slice (slice.memberId)}
					<li>
						<Avatar name={slice.displayName} color={slice.color} size={26} />
						<span class="sr-only">{slice.displayName}</span>
						<span class="pct">{pct(slice.share)}%</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">{m.tasks.split.empty}</p>
		{/if}
	</div>
</Card>

<style>
	.split {
		padding: 20px 22px 22px;
	}

	h2 {
		margin: 0 0 4px;
		font-size: calc(18px * var(--fs));
	}

	.subtitle {
		margin: 0 0 18px;
		font-size: calc(13.5px * var(--fs));
		line-height: 1.45;
		color: var(--text-4);
	}

	.bar {
		display: flex;
		gap: 4px;
		margin-bottom: 16px;
	}

	.seg {
		height: 12px;
		/* A hair of width so the smallest share still reads as a segment. */
		min-width: 10px;
		border-radius: 6px;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pct {
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--text-2);
	}

	.empty {
		margin: 0;
		font-size: calc(13.5px * var(--fs));
		color: var(--text-4);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
