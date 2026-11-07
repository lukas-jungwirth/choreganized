<!--
	Home's top card when more than one chore is on you (→ SPEC §2.1, DECISIONS
	#256): the same `NextChoreCard`s side by side, one screen wide each, swiped
	through. The counter on each card says there are more; the dots under them
	say where you are. One chore is just the card, exactly as before: no counter,
	no dots.

	Full width, no peek of the next card (Lukas 2026-11-07): the counter carries
	"there's more", and a sliver of the next card would cost every name 30px and
	break the line with the cards below.

	Scroll-snap does the swiping, so it's the browser's own momentum and every
	card is reachable by Tab without swiping at all. Cards in a row share the
	tallest one's height, so the page under them never jumps mid-swipe.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { NextChore } from '$lib/server/services/home';
	import type { CalendarDate } from '$lib/utils/dates';
	import type { SubmitFunction } from '@sveltejs/kit';
	import NextChoreCard from './NextChoreCard.svelte';

	type Props = {
		chores: NextChore[];
		/** Past the last card: the "+N more" link to Tasks. */
		more: number;
		today: CalendarDate;
		/** The chore ticked and not yet confirmed, if any. */
		pendingId: string | null;
		complete: SubmitFunction;
		onsnooze: (chore: NextChore) => void;
	};

	let { chores, more, today, pendingId, complete, onsnooze }: Props = $props();

	const m = messages();

	let rail = $state<HTMLElement>();
	let active = $state(0);

	const several = $derived(chores.length > 1);

	/** Which card is in view. One card plus its gap is exactly the rail's width. */
	function onscroll() {
		if (!rail) return;
		const width = rail.clientWidth;
		active = width > 0 ? Math.round(rail.scrollLeft / width) : 0;
	}

	// A card done and gone can leave the index past the end.
	$effect(() => {
		if (active > chores.length - 1) active = Math.max(0, chores.length - 1);
	});
</script>

{#if several}
	<section class="stack" aria-label={m.home.nextChore.eyebrow}>
		<ul class="rail" bind:this={rail} {onscroll}>
			{#each chores as chore, index (chore.id)}
				<li class="slide">
					<NextChoreCard
						{chore}
						{today}
						pending={pendingId === chore.id}
						{complete}
						onsnooze={() => onsnooze(chore)}
						position={{ index, total: chores.length }}
					/>
				</li>
			{/each}
		</ul>

		<div class="below">
			<div class="dots" aria-hidden="true">
				{#each chores as chore, index (chore.id)}
					<i class:on={index === active}></i>
				{/each}
			</div>
			{#if more > 0}
				<a class="more" href="/tasks" aria-label={m.home.nextChore.moreLabel(more)}>
					{m.home.nextChore.more(more)}
				</a>
			{/if}
		</div>
	</section>
{:else if chores[0]}
	{@const chore = chores[0]}
	<NextChoreCard
		{chore}
		{today}
		pending={pendingId === chore.id}
		{complete}
		onsnooze={() => onsnooze(chore)}
	/>
{/if}

<style>
	.rail {
		display: flex;
		/* Both gutters between two cards, so the next one starts past the
		   screen's edge (no peek) and one swipe moves exactly one screen. */
		gap: calc(2 * var(--page-pad));
		margin: 0;
		/* Out to the screen's edges, so a card slides off the side rather than
		   vanishing at the gutter; the padding puts it back where the others sit,
		   and leaves room for the card's shadow, which a scroller would clip. */
		margin-inline: calc(-1 * var(--page-pad));
		padding: 4px var(--page-pad) 6px;
		margin-block: -4px -6px;
		scroll-padding-inline: var(--page-pad);
		list-style: none;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}

	.rail::-webkit-scrollbar {
		display: none;
	}

	/* A grid cell stretches the card to the row's height: every card as tall as
	   the tallest, so nothing below moves while swiping. */
	.slide {
		display: grid;
		flex: 0 0 100%;
		min-width: 0;
		scroll-snap-align: start;
		scroll-snap-stop: always;
	}

	.below {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 20px;
		margin-top: 10px;
	}

	.dots {
		display: flex;
		gap: 6px;
	}

	.dots i {
		width: 6px;
		height: 6px;
		border-radius: 3px;
		background: var(--border);
		transition:
			width 160ms ease-out,
			background-color 160ms ease-out;
	}

	.dots i.on {
		width: 18px;
		background: var(--terracotta);
	}

	.more {
		position: absolute;
		right: 2px;
		font-size: var(--fs-14);
		font-weight: 600;
		color: var(--terracotta);
	}

	@media (prefers-reduced-motion: reduce) {
		.dots i {
			transition: none;
		}
	}
</style>
