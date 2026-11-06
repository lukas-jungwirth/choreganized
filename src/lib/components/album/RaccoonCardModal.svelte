<!--
	A raccoon card over the album (→ plan 35), centred rather than in a sheet:
	a trading card is held up to look at, and a sheet's handle and flat top would
	fight its frame (→ DECISIONS #231). Prev / next, or a sideways swipe, go to
	the neighbouring card in album order, skipping nothing: a raccoon you haven't
	met shows as its locked card (open, marked as unmet, in admin mode).
-->
<script lang="ts">
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import { messages } from '$lib/i18n';
	import { swipe } from '$lib/swipe';
	import type { CalendarDate } from '$lib/utils/dates';
	import { albumNumber, type AlbumEntry } from '$lib/utils/raccoon-album';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import RaccoonCard from './RaccoonCard.svelte';

	type Sighting = { firstSeenOn: CalendarDate; seenCount: number };

	type Props = {
		entries: readonly AlbumEntry[];
		/** Which card is up, by its place in `entries`. */
		index: number;
		sightings: ReadonlyMap<string, Sighting>;
		/** Admin mode: an unmet raccoon's card is shown open too (→ DECISIONS #240). */
		reveal?: boolean;
		today: CalendarDate;
		onmove: (index: number) => void;
		onclose: () => void;
	};

	let { entries, index, sightings, reveal = false, today, onmove, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});

	const entry = $derived(entries[index]);
	const previous = $derived(entries[index - 1] ?? null);
	const next = $derived(entries[index + 1] ?? null);
</script>

<CenterModal bind:open label={m.album.title} bare>
	<div
		class="holder"
		use:swipe={(direction) => {
			if (direction === 'left' && next) onmove(index + 1);
			if (direction === 'right' && previous) onmove(index - 1);
		}}
	>
		{#key entry.name}
			<RaccoonCard {entry} sighting={sightings.get(entry.name) ?? null} {reveal} {today} />
		{/key}
	</div>

	<nav class="pager">
		<button
			type="button"
			disabled={!previous}
			aria-label={m.album.previous}
			onclick={() => onmove(index - 1)}
		>
			<ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
			{previous ? albumNumber(previous.number) : ''}
		</button>
		<button type="button" class="close" onclick={() => (open = false)}>{m.album.close}</button>
		<button
			type="button"
			disabled={!next}
			aria-label={m.album.next}
			onclick={() => onmove(index + 1)}
		>
			{next ? albumNumber(next.number) : ''}
			<ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
		</button>
	</nav>
</CenterModal>

<style>
	.holder {
		padding: 6px 0;
	}

	.pager {
		display: flex;
		justify-content: center;
		gap: 10px;
		margin-top: 18px;
	}

	.pager button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 76px;
		min-height: 44px;
		justify-content: center;
		padding: 8px 14px;
		border-radius: var(--r-chip);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: var(--fs-15);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-2);
	}

	.pager button:disabled {
		visibility: hidden;
	}

	.pager .close {
		color: var(--sage);
	}
</style>
