<!--
	The raccoon album's progress card (→ plan 35): a ring with the share found,
	"17 of 39 found", the rare and legendary ones still out there, and a plain
	sage bar.
-->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
	import { messages } from '$lib/i18n';

	type Props = {
		found: number;
		total: number;
		/** Unmet ★★ Rare and ★★★ Legendary raccoons. */
		rare: number;
		legendary: number;
	};

	let { found, total, rare, legendary }: Props = $props();

	const m = messages();

	const share = $derived(total > 0 ? found / total : 0);
	/** The ring's circumference at r = 23. */
	const RING = 2 * Math.PI * 23;
	const missing = $derived(m.album.missing(rare, legendary));
</script>

<Card radius="md">
	<div class="progress">
		<svg class="ring" viewBox="0 0 56 56" aria-hidden="true">
			<circle class="track" cx="28" cy="28" r="23" />
			<circle
				class="fill"
				cx="28"
				cy="28"
				r="23"
				stroke-dasharray="{share * RING} {RING}"
				transform="rotate(-90 28 28)"
			/>
			<text x="28" y="33" text-anchor="middle">{Math.round(share * 100)}%</text>
		</svg>
		<div class="text">
			<p class="found">{m.album.found(found, total)}</p>
			<p class="missing">{missing ?? m.album.complete}</p>
			<ProgressBar value={share} label={m.album.progress(found, total)} />
		</div>
	</div>
</Card>

<style>
	.progress {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px;
	}

	.ring {
		flex: none;
		width: 56px;
		height: 56px;
	}

	.ring circle {
		fill: none;
		stroke-width: 7;
	}

	.track {
		stroke: var(--track);
	}

	.fill {
		stroke: var(--sage);
		stroke-linecap: round;
	}

	/* In a 56px ring that can't grow, so it stops short of the scale's 200%. */
	.ring text {
		font-family: var(--font-body);
		font-size: min(var(--fs-14), 15px);
		font-weight: 800;
		fill: var(--ink);
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.found {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-24);
		font-weight: 600;
		line-height: 1.1;
	}

	.missing {
		margin: 2px 0 10px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}
</style>
