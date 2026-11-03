<!--
	The raccoon album (→ plan 35, sketch frame 1): every raccoon Home can show,
	the ones you've met in colour, the rest as silhouettes. A tap opens its card;
	`?card=<name>` opens one straight away (Home's "New raccoon!" toast links
	here that way).

	No design frame: built to `design/sketches/raccoon-album.html`, which Lukas
	approved on 2026-11-03.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import AlbumProgress from '$lib/components/album/AlbumProgress.svelte';
	import AlbumTile from '$lib/components/album/AlbumTile.svelte';
	import RaccoonCardModal from '$lib/components/album/RaccoonCardModal.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import { messages } from '$lib/i18n';
	import {
		ALBUM_ENTRIES,
		ALBUM_SIZE,
		filterAlbum,
		type AlbumEntry,
		type Tier
	} from '$lib/utils/raccoon-album';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const sightings = $derived(new Map(data.sightings.map((row) => [row.raccoon, row])));
	const met = $derived(new Set(sightings.keys()));

	const missingOf = (tier: Tier) =>
		ALBUM_ENTRIES.filter((entry) => entry.tier === tier && !met.has(entry.name)).length;

	let tier = $state<Tier | null>(null);
	let missing = $state(false);

	const shown = $derived(filterAlbum(ALBUM_ENTRIES, met, { tier, missing }));

	const TIERS: Tier[] = [1, 2, 3];

	/** The card that's up, by its place in the album; null when none is. */
	let open = $state<number | null>(null);

	function openCard(entry: AlbumEntry) {
		open = ALBUM_ENTRIES.indexOf(entry);
	}

	/** Opened by `?card=`, which comes off the address once it is shut. */
	let fromLink = false;

	onMount(() => {
		const asked = page.url.searchParams.get('card');
		const at = ALBUM_ENTRIES.findIndex((entry) => entry.name === asked);
		if (at !== -1) {
			open = at;
			fromLink = true;
		}
	});

	function close() {
		open = null;
		// A card opened from Home's link stays shut on a reload. (A shallow
		// `replaceState` leaves `page.url` as it was, so it can't be asked.)
		if (fromLink) replaceState('/settings/raccoons', {});
		fromLink = false;
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.album.title)}</title>
</svelte:head>

<SubHeader
	title={m.album.title}
	subtitle={m.album.subtitle}
	back="/settings"
	backLabel={m.album.back}
/>

<AlbumProgress found={met.size} total={ALBUM_SIZE} seasonal={missingOf(2)} special={missingOf(3)} />

<div class="filters" role="group" aria-label={m.album.filters.label}>
	<Chip selected={tier === null} onclick={() => (tier = null)}>{m.album.filters.all}</Chip>
	{#each TIERS as each (each)}
		<Chip selected={tier === each} onclick={() => (tier = each)}>
			<span aria-hidden="true">{'★'.repeat(each)}</span>
			{m.album.tiers[each]}
		</Chip>
	{/each}
	<Chip selected={missing} onclick={() => (missing = !missing)}>{m.album.filters.missing}</Chip>
</div>

{#if shown.length > 0}
	<ul class="grid">
		{#each shown as entry (entry.name)}
			{@const sighting = sightings.get(entry.name)}
			<li>
				<AlbumTile
					{entry}
					met={sighting !== undefined}
					isNew={sighting?.isNew ?? false}
					onopen={() => openCard(entry)}
				/>
			</li>
		{/each}
	</ul>
{:else}
	<p class="empty">{m.album.empty}</p>
{/if}

{#if open !== null}
	<RaccoonCardModal
		entries={ALBUM_ENTRIES}
		index={open}
		{sightings}
		today={data.today}
		onmove={(index) => (open = index)}
		onclose={close}
	/>
{/if}

<style>
	/* Sideways at 390px: five chips don't fit a phone's width, and wrapping
	   would push the grid down for a control you set once. */
	.filters {
		display: flex;
		gap: 8px;
		margin: 18px calc(-1 * var(--page-pad)) 14px;
		padding: 2px var(--page-pad) 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.filters::-webkit-scrollbar {
		display: none;
	}

	.filters :global(.chip) {
		flex: none;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		margin: 32px 0;
		text-align: center;
		font-size: var(--fs-16);
		color: var(--text-4);
	}
</style>
