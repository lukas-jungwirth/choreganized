<!--
	The raccoon album on Home (→ SPEC §2, DECISIONS #244). A small deck of cards:
	only the front one has colour, your newest raccoon on its frame, and the two
	behind it are silhouettes, so the stack reads as one thing and not as three
	pictures fighting.

	While a raccoon you haven't looked at is waiting, the front card pops over the
	top edge with a "New" badge and the card says who it is. It stays that way
	until you open the album, which is what the album's "New" badges already
	count, so it replaced the toast that was gone after six seconds. The rarity is
	a word in the eyebrow rather than stars; a common raccoon gets none, because
	"Common" takes the shine off the moment. The stars stay on the album's card.

	Built to the canvas Lukas approved on 2026-11-05:
	https://claude.ai/artifact/3urZbsREozVKNJC49naGC9
-->
<script lang="ts">
	import Silhouette from '$lib/components/album/Silhouette.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Mascot from '$lib/components/ui/Mascot.svelte';
	import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
	import { messages } from '$lib/i18n';
	import type { AlbumSummary } from '$lib/server/services/raccoons';
	import { albumEntry, frameFill } from '$lib/utils/raccoon-album';

	let { album }: { album: AlbumSummary } = $props();

	const m = messages();

	const { found, total, rare, legendary, unseen, latest, behind } = $derived(album);

	const count = $derived(unseen.length);
	const front = $derived(latest ? albumEntry(latest) : null);

	/** One waiting opens its card; several open the album, wearing their badges. */
	const href = $derived(
		count === 1 ? `/settings/raccoons?card=${unseen[0]}&from=home` : '/settings/raccoons?from=home'
	);

	const legend = $derived(count === 1 && albumEntry(unseen[0]).tier === 3);

	const eyebrow = $derived.by(() => {
		if (count === 0) return m.album.title;
		if (count > 1) return m.album.home.several;
		return m.album.home.rarity[albumEntry(unseen[0]).tier];
	});

	const title = $derived.by(() => {
		if (count === 0) return m.album.found(found, total);
		if (count > 1) return m.album.home.inAlbum(count);
		return m.raccoons[unseen[0]].name;
	});

	const meta = $derived.by(() => {
		if (count === 0) return m.album.missing(rare, legendary) ?? m.album.complete;
		if (count === 1) return m.album.found(found, total);
		return m.album.home.names(
			unseen.map((name) => m.raccoons[name].name),
			found,
			total
		);
	});
</script>

<!-- No preload at all, not even on tap: "tap" means touchstart, and a finger starting
	 a scroll on this big card would run the album's load, which uses up its "New". -->
<div data-sveltekit-preload-data="off">
	<Card {href}>
		<div class="album" class:waiting={count > 0} class:legend>
			<span class="eyebrow">{eyebrow}</span>
			<span class="title">{title}</span>
			<span class="meta">{meta}</span>
			<div class="bar">
				<ProgressBar value={total > 0 ? found / total : 0} label={m.album.progress(found, total)} />
			</div>

			<span class="deck" aria-hidden="true">
				{#each behind as name, index (name)}
					<span class="back back-{index + 1}"><Silhouette {name} height={50} class="shape" /></span>
				{/each}
				{#if front}
					<span class="front" class:pop={count > 0}>
						{#if count > 0}
							<span class="badge"
								>{count > 1 ? m.album.home.newCount(count) : m.album.newBadge}</span
							>
						{/if}
						<span class="frame" style:background={frameFill(front.frame)}>
							<Mascot name={front.name} height={count > 0 ? 84 : 74} class="art" />
						</span>
					</span>
				{/if}
			</span>
		</div>
	</Card>
</div>

<style>
	/* The deck hangs off the right edge; the text only ever gets what's left of it,
	   and a long name or a big text size grows the card rather than running under. */
	.album {
		position: relative;
		min-height: 114px;
		padding: 16px 136px 16px 16px;
		border-radius: var(--r-card-lg);
		overflow-wrap: anywhere;
	}

	.waiting {
		box-shadow: 0 0 0 1.5px var(--terracotta);
	}

	.legend {
		box-shadow: 0 0 0 1.5px var(--gold);
	}

	.eyebrow {
		display: block;
		margin-bottom: 4px;
		font-size: var(--fs-12);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sage);
	}

	.waiting .eyebrow {
		color: var(--terracotta-deep);
	}

	.legend .eyebrow {
		color: var(--holo-ink);
	}

	.title {
		display: block;
		font-family: var(--font-display);
		font-size: var(--fs-20);
		font-weight: 600;
		line-height: 1.15;
	}

	.meta {
		display: block;
		margin-top: 4px;
		font-size: var(--fs-13);
		line-height: 1.3;
		color: var(--text-3);
	}

	.bar {
		margin-top: 10px;
	}

	.deck {
		position: absolute;
		inset: 0 0 0 auto;
		width: 136px;
	}

	/* Over the silhouette's own token: this one sits on `--sunken`, where the
	   album's dark-theme shadow would vanish. */
	.back {
		--silhouette: var(--silhouette-back);
		position: absolute;
		width: 64px;
		height: 86px;
		border-radius: 11px;
		overflow: hidden;
		background: var(--sunken);
		box-shadow:
			inset 0 0 0 1px var(--border-soft),
			var(--shadow-card);
	}

	.back-1 {
		right: 66px;
		bottom: 14px;
		transform: rotate(-11deg);
	}

	.back-2 {
		right: 40px;
		bottom: 15px;
		transform: rotate(-4deg);
	}

	/* Left in its card, so the head shows past the card in front. */
	.back :global(.shape) {
		position: absolute;
		left: -6px;
		bottom: 0;
	}

	.front {
		position: absolute;
		right: 12px;
		bottom: 13px;
		width: 68px;
		height: 90px;
		transform: rotate(5deg);
	}

	.front.pop {
		right: 11px;
		bottom: 20px;
		width: 76px;
		height: 102px;
		transform: rotate(6deg);
		animation: pop 320ms cubic-bezier(0.34, 1.4, 0.64, 1);
	}

	.frame {
		position: absolute;
		inset: 0;
		border-radius: 11px;
		overflow: hidden;
		box-shadow: var(--shadow-card);
	}

	/* A wide pose narrows to fit rather than losing its elbows. */
	.frame :global(.art) {
		position: absolute;
		left: 50%;
		bottom: 0;
		width: auto;
		max-width: 94%;
		height: auto;
		max-height: 84%;
		transform: translateX(-50%);
	}

	.badge {
		position: absolute;
		z-index: 1;
		top: -7px;
		right: -7px;
		padding: 2px 7px;
		border-radius: var(--r-chip);
		background: var(--new-badge);
		color: var(--on-new-badge);
		font-size: min(var(--fs-12), 13px);
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(16px) rotate(0deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.front.pop {
			animation: none;
		}
	}
</style>
