<!--
	A raccoon's trading card (→ plan 35, the sketch's frames 2–4). Met: the
	number and the stars on top, the raccoon on a stage in its frame colour, its
	name and title, one chip saying when you can meet it, a fun fact, four fun
	stats, and when you first met it and how often. Locked: the same frame shape
	in `--sunken-2`, the silhouette under one big "?", and nothing that would
	give it away.
-->
<script lang="ts">
	import { STATS, type AlbumName } from '$lib/assets/mascot/album';
	import type { Season } from '$lib/assets/mascot/everyday';
	import Mascot from '$lib/components/ui/Mascot.svelte';
	import { messages } from '$lib/i18n';
	import type { CalendarDate } from '$lib/utils/dates';
	import {
		albumNumber,
		frameFill,
		frameInk,
		type AlbumEntry,
		type Window
	} from '$lib/utils/raccoon-album';
	import Flower2 from '@lucide/svelte/icons/flower-2';
	import Leaf from '@lucide/svelte/icons/leaf';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Sun from '@lucide/svelte/icons/sun';
	import Silhouette from './Silhouette.svelte';

	type Props = {
		entry: AlbumEntry;
		/** Null until this member has met it: the locked card. */
		sighting: { firstSeenOn: CalendarDate; seenCount: number } | null;
		today: CalendarDate;
	};

	let { entry, sighting, today }: Props = $props();

	const m = messages();

	const SEASON_ICONS = { winter: Snowflake, spring: Flower2, summer: Sun, autumn: Leaf };

	const number = $derived(m.album.number(albumNumber(entry.number)));
	const copy = $derived(m.raccoons[entry.name as AlbumName]);

	function windowLabel(window: Window): string {
		switch (window.kind) {
			case 'all-year':
				return m.album.window.allYear;
			case 'months':
				return m.date.monthSpan(window.from, window.to);
			case 'days':
				return m.date.dayRange(window.from, window.to);
			case 'easter':
				return m.album.window.easter;
			case 'fasching':
				return m.album.window.fasching;
			case 'birthday':
				return m.album.window.birthday;
		}
	}

	const season = $derived<Season | null>(
		entry.window.kind === 'months' ? entry.window.season : null
	);
	const SeasonIcon = $derived(season ? SEASON_ICONS[season] : null);
</script>

{#if sighting}
	<article
		class="card"
		style:--frame={frameFill(entry.frame)}
		style:--frame-ink={frameInk(entry.frame)}
		aria-label={copy.name}
	>
		<div class="inner">
			<header>
				<span class="number">{number}</span>
				<span class="stars" role="img" aria-label={m.album.stars(entry.tier)}>
					{#each [1, 2, 3] as star (star)}
						<span class:off={star > entry.tier}>★</span>
					{/each}
				</span>
			</header>

			<div class="stage">
				<span class="floor" aria-hidden="true"></span>
				<Mascot name={entry.name} height={180} class="card-art" />
			</div>

			<h2 class="name">{copy.name}</h2>
			<p class="title">{copy.title}</p>

			<p class="window">
				<span class="chip">
					{#if SeasonIcon}<SeasonIcon size={13} strokeWidth={2.4} aria-hidden="true" />{/if}
					{windowLabel(entry.window)}
				</span>
			</p>

			<p class="fact">{m.album.quoted(copy.fact)}</p>

			<dl class="stats">
				{#each STATS as stat (stat)}
					{@const value = entry.stats[stat]}
					<dt>{m.album.stats[stat]}</dt>
					<dd role="img" aria-label={m.album.statValue(m.album.stats[stat], value)}>
						{#each [1, 2, 3, 4, 5] as dot (dot)}
							<i class:on={dot <= value}></i>
						{/each}
					</dd>
				{/each}
			</dl>

			<footer>
				<span>
					{#each m.album.firstMet(m.date.shortAuto(sighting.firstSeenOn, today)) as part}
						{#if part.strong}<b>{part.text}</b>{:else}{part.text}{/if}
					{/each}
				</span>
				<span>
					{#each m.album.seen(sighting.seenCount) as part}
						{#if part.strong}<b>{part.text}</b>{:else}{part.text}{/if}
					{/each}
				</span>
			</footer>
		</div>
	</article>
{:else}
	<article class="card locked" aria-label={m.album.locked.title}>
		<div class="inner">
			<header>
				<span class="number">{number}</span>
			</header>

			<div class="stage">
				<Silhouette name={entry.name} height={180} class="card-art" />
				<span class="unknown" aria-hidden="true">?</span>
			</div>

			<p class="name" aria-hidden="true">{m.album.locked.name}</p>
			<p class="title">{m.album.locked.title}</p>

			<footer>
				<span>{m.album.locked.hint}</span>
			</footer>
		</div>
	</article>
{/if}

<style>
	.card {
		width: min(318px, 100%);
		margin: 0 auto;
		padding: 10px;
		border-radius: 26px;
		background: var(--frame);
		box-shadow: var(--shadow-modal);
		text-align: center;
		color: var(--ink);
		transform: rotate(-1deg);
	}

	.locked {
		background: var(--sunken-2);
		transform: rotate(1deg);
	}

	.inner {
		border-radius: 18px;
		background: var(--card);
		overflow: hidden;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 12px 14px 0;
	}

	.number {
		font-size: var(--fs-14);
		font-weight: 800;
		letter-spacing: 0.06em;
		font-variant-numeric: tabular-nums;
		color: var(--frame-ink);
	}

	.locked .number {
		color: var(--text-5);
	}

	.stars {
		font-size: var(--fs-15);
		letter-spacing: 1px;
		color: var(--gold);
	}

	.stars .off {
		color: var(--sunken-2);
	}

	/* The raccoon on a soft stage: the frame's colour as a pool of light under
	   it. A real element rather than a gradient, because the frame may itself be
	   a gradient, and a gradient can't be mixed into another. */
	.stage {
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		height: 196px;
		margin: 8px 12px 0;
		border-radius: 14px;
		background: var(--sunken);
		overflow: hidden;
	}

	.floor {
		position: absolute;
		left: 50%;
		bottom: -60%;
		width: 110%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--frame);
		transform: translateX(-50%);
	}

	.stage :global(.card-art) {
		position: relative;
		max-width: 92%;
		height: 180px;
		width: auto;
		object-fit: contain;
	}

	.unknown {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding-bottom: 10px;
		font-family: var(--font-display);
		font-size: var(--fs-56);
		font-weight: 600;
		color: var(--text-5);
	}

	.name {
		margin: 12px 14px 0;
		font-family: var(--font-display);
		font-size: var(--fs-24);
		font-weight: 600;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.locked .name {
		letter-spacing: 0.2em;
		color: var(--text-4);
	}

	.title {
		margin: 3px 14px 0;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.window {
		margin: 10px 14px 0;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border-radius: var(--r-chip);
		background: var(--frame);
		font-size: var(--fs-13);
		font-weight: 700;
		color: var(--frame-ink);
	}

	.fact {
		margin: 12px 14px 0;
		font-size: var(--fs-16);
		font-style: italic;
		line-height: 1.42;
		color: var(--text-2);
	}

	.stats {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 7px 12px;
		align-items: center;
		margin: 14px 14px 0;
		text-align: left;
	}

	dt {
		font-size: var(--fs-14);
		font-weight: 700;
		color: var(--text-3);
	}

	dd {
		display: flex;
		gap: 4px;
		margin: 0;
	}

	dd i {
		flex: 1;
		height: 8px;
		border-radius: var(--r-chip);
		background: var(--sunken);
	}

	dd i.on {
		background: var(--frame-ink);
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 12px;
		margin-top: 14px;
		padding: 10px 14px 12px;
		border-top: 1px dashed var(--border);
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.locked footer {
		justify-content: center;
	}

	footer b {
		font-weight: 700;
		color: var(--ink);
	}
</style>
