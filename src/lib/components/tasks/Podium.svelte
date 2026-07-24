<!--
	The month's standings [8a] — avatars on plinths, tallest in the middle,
	a crown on whoever is winning.

	The markup is an ordered list in *rank* order and CSS `order` puts the
	columns where the design draws them, so the podium reads as a ranking to a
	screen reader and as a podium to everybody else. Heights, colours and the
	crown all come off `rank`, which is competition-ranked upstream: two
	housemates level on points get identical columns (→ DECISIONS #75).
-->
<script lang="ts">
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { Podium } from '$lib/server/services/history';

	let { podium }: { podium: Podium } = $props();

	const m = messages();

	/**
	 * Plinth heights by rank: [8a] draws the first three at 104 / 78 / 60 and
	 * the two it never had to draw keep the same shrinking step. Nobody has
	 * scored ⇒ no ranking to express, so every plinth is the same floor.
	 */
	const HEIGHTS = [104, 78, 60, 48, 40];
	const LEVEL = 60;

	/** The rank numeral shrinks with the plinth it sits on. */
	const NUMERALS = [24, 20, 18, 18, 18];

	/** Ranks past the fifth keep the smallest column — SPEC tops out at five. */
	function step(sizes: number[], rank: number): number {
		return sizes[rank - 1] ?? sizes[sizes.length - 1];
	}

	const resets = $derived(m.tasks.podium.resets(m.date.short(podium.resetsOn)));
</script>

<Card>
	<div class="podium">
		<header>
			<h2>{m.tasks.podium.thisMonth}</h2>
			<span class="resets">{resets}</span>
		</header>

		<!-- In rank order, so the names and scores read as the standings they are;
			 the numeral on the plinth is the same fact drawn, and a tie makes it
			 ambiguous out loud ("1, 1, 3"), so it stays decoration. -->
		<ol aria-label={m.tasks.podium.standings}>
			{#each podium.entries as entry (entry.memberId)}
				{@const winning = entry.rank === 1 && !podium.leaderless}
				<li style:order={entry.position} style:--column-color={entry.color}>
					{#if entry.crowned}
						<span class="crown"><CrownIcon size={26} /></span>
					{/if}

					<span class="face" class:big={winning}>
						<Avatar
							name={entry.displayName}
							color={entry.color}
							size={winning ? 54 : 46}
							ring={entry.crowned}
							ringColor="var(--gold)"
						/>
					</span>

					<span class="name" class:winning>{entry.displayName}</span>
					<span class="points" class:winning>{entry.points}</span>

					<span
						class="plinth"
						class:winning
						style:height="{podium.leaderless ? LEVEL : step(HEIGHTS, entry.rank)}px"
						style:font-size="{step(NUMERALS, entry.rank)}px"
						aria-hidden="true"
					>
						<!-- A rank nobody earned would be a lie about a scoreless month. -->
						{#if !podium.leaderless}{entry.rank}{/if}
					</span>
				</li>
			{/each}
		</ol>
	</div>
</Card>

<style>
	.podium {
		padding: 18px 16px 20px;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 6px;
	}

	h2 {
		font-family: var(--font-body);
		font-size: 15px;
		font-weight: 700;
	}

	.resets {
		flex: none;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-5);
	}

	ol {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 10px;
		margin: 14px 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-direction: column;
		align-items: center;
		/* Five housemates share 390px: the columns give, the avatars don't. The
		   cap is the width three columns get in [8a] — without it a two-member
		   household gets half a card each and the plinths read as walls. */
		flex: 1;
		min-width: 0;
		max-width: 100px;
	}

	/* Columns are bottom-anchored, so the crown grows off the top of one of
	   them without moving anything in the others. */
	.crown {
		display: flex;
		margin-bottom: 2px;
		color: var(--gold);
	}

	/*
		The avatar's coloured glow [8a]. On the wrapper, because Avatar spends its
		own box-shadow on the gold ring — and mixing the member's colour with
		transparent covers the three palette entries the design never drew
		(→ DECISIONS #35).
	*/
	.face {
		display: inline-flex;
		margin-bottom: 8px;
		border-radius: 50%;
		box-shadow: 0 3px 8px -2px color-mix(in srgb, var(--column-color) 50%, transparent);
	}

	.big {
		box-shadow: 0 4px 10px -2px color-mix(in srgb, var(--column-color) 55%, transparent);
	}

	.name {
		max-width: 100%;
		overflow: hidden;
		margin-bottom: 1px;
		font-size: 12.5px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name.winning {
		font-weight: 700;
	}

	.points {
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 600;
		color: var(--column-color);
	}

	.points.winning {
		font-size: 19px;
	}

	.plinth {
		display: flex;
		justify-content: center;
		width: 100%;
		margin-top: 8px;
		padding-top: 8px;
		border-radius: 14px 14px 0 0;
		background: linear-gradient(var(--sunken), var(--sunken-2));
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--text-5);
	}

	.plinth.winning {
		background: linear-gradient(
			var(--column-color),
			color-mix(in srgb, var(--column-color) 86%, var(--ink))
		);
		color: color-mix(in srgb, var(--on-sage) 90%, transparent);
	}
</style>
