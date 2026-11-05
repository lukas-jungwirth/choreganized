<!--
	One raccoon in the album grid (→ plan 35): on its frame colour with its
	number once you've met it, a dark silhouette and a "?" until then. No hint
	and no stars on a locked one: what it is, and how rare, is the surprise.
	In admin mode an unmet one is shown anyway, faded inside a dashed edge and
	named "not met yet", so the grid still tells met from shown (→ DECISIONS #240).
-->
<script lang="ts">
	import Mascot from '$lib/components/ui/Mascot.svelte';
	import Silhouette from './Silhouette.svelte';
	import { messages } from '$lib/i18n';
	import { albumNumber, cardView, frameFill, type AlbumEntry } from '$lib/utils/raccoon-album';

	type Props = {
		entry: AlbumEntry;
		met: boolean;
		/** Admin mode: show it even unmet (→ `cardView`). */
		reveal?: boolean;
		/** Met since the album was last opened. */
		isNew: boolean;
		onopen: () => void;
	};

	let { entry, met, reveal = false, isNew, onopen }: Props = $props();

	const view = $derived(cardView(met, reveal));

	const m = messages();

	const number = $derived(albumNumber(entry.number));
</script>

<button
	type="button"
	class="tile"
	class:locked={view === 'locked'}
	class:revealed={view === 'revealed'}
	style:background={view === 'locked' ? undefined : frameFill(entry.frame)}
	aria-label={m.album.tile(
		number,
		view === 'locked' ? null : m.raccoons[entry.name].name,
		met && isNew,
		view === 'revealed'
	)}
	onclick={onopen}
>
	{#if view !== 'locked'}
		<Mascot name={entry.name} height={96} class="tile-art" />
	{:else}
		<Silhouette name={entry.name} height={96} class="tile-art" />
		<span class="unknown" aria-hidden="true">?</span>
	{/if}
	{#if met && isNew}<span class="new" aria-hidden="true">{m.album.newBadge}</span>{/if}
	<span class="number" aria-hidden="true">{number}</span>
</button>

<style>
	.tile {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		width: 100%;
		aspect-ratio: 3 / 4;
		padding: 6px 4px;
		border-radius: 14px;
		box-shadow: var(--shadow-card);
		overflow: hidden;
		transition: transform 120ms ease-out;
	}

	.tile:active {
		transform: scale(0.96);
	}

	.tile :global(.tile-art) {
		position: absolute;
		top: 8px;
		left: 50%;
		width: auto;
		max-width: 88%;
		height: 68%;
		object-fit: contain;
		transform: translateX(-50%);
	}

	.locked {
		background: var(--sunken);
		box-shadow: none;
	}

	/* Shown in admin mode, not met: faded, inside a dashed edge. */
	.revealed {
		box-shadow: none;
		outline: 1.5px dashed var(--text-5);
		outline-offset: -4px;
	}

	.revealed :global(.tile-art) {
		opacity: 0.55;
	}

	/* In a tile that can't grow, so these stop short of the scale's 200%. */
	.unknown {
		position: absolute;
		top: 34%;
		font-family: var(--font-display);
		font-size: min(var(--fs-24), 30px);
		font-weight: 600;
		line-height: 1;
		color: var(--text-5);
	}

	.new {
		position: absolute;
		top: 5px;
		right: 5px;
		padding: 2px 6px;
		border-radius: var(--r-chip);
		background: var(--new-badge);
		color: var(--on-new-badge);
		font-size: min(var(--fs-12), 13px);
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.number {
		position: relative;
		font-size: min(var(--fs-13), 16px);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-4);
	}

	@media (prefers-reduced-motion: reduce) {
		.tile {
			transition: none;
		}
		.tile:active {
			transform: none;
		}
	}
</style>
