<!--
	History → the points board [8a] (→ SPEC §5.8). Every member's score over the
	chosen window, tallest bar first, with a timeframe toggle that lives in the URL
	(?range=) so it survives a refresh and works with no JavaScript. Bars are scaled
	to the leader, who runs the full width.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { messages } from '$lib/i18n';
	import { POINTS_WINDOWS, type PointsWindow } from '$lib/utils/tasks';

	type Props = {
		members: { id: string; displayName: string; color: string }[];
		/** Points by member id, for the current window. */
		points: Record<string, number>;
		currentMemberId: string;
		range: PointsWindow;
	};

	let { members, points, currentMemberId, range }: Props = $props();

	const m = messages();

	/** Best-first; `sort` is stable, so members level on points keep join order. */
	const rows = $derived(
		members
			.map((member) => ({ ...member, points: points[member.id] ?? 0 }))
			.sort((a, b) => b.points - a.points)
	);

	const total = $derived(rows.reduce((sum, row) => sum + row.points, 0));
	/** The leader sets the full-width bar; guard the empty window against ÷0. */
	const max = $derived(Math.max(1, ...rows.map((row) => row.points)));

	const rangeOptions = $derived(
		POINTS_WINDOWS.map((window) => ({
			value: window,
			label: m.tasks.pointsBoard.ranges[window],
			href: `/tasks/history?range=${window}`
		}))
	);
</script>

<Card radius="lg">
	<div class="board">
		<div class="head">
			<h2>{m.tasks.pointsBoard.title}</h2>
			<span class="total">{m.tasks.pointsBoard.together(total)}</span>
		</div>

		<div class="range">
			<SegmentedControl
				label={m.tasks.pointsBoard.rangeLabel}
				value={range}
				options={rangeOptions}
			/>
		</div>

		<ul class="rows">
			{#each rows as row (row.id)}
				<li>
					<Avatar name={row.displayName} color={row.color} size={40} />
					<div class="who">
						<div class="line">
							<span class="name">{row.displayName}</span>
							{#if row.id === currentMemberId}
								<span class="you">{m.tasks.pointsBoard.you}</span>
							{/if}
							<span class="pts">{row.points}</span>
						</div>
						<div class="track">
							<span
								class="fill"
								style:width="{(row.points / max) * 100}%"
								style:background={row.color}
							></span>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</div>
</Card>

<style>
	.board {
		padding: 20px 22px 22px;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}

	h2 {
		font-size: calc(18px * var(--fs));
	}

	.total {
		flex: none;
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	.range {
		margin-bottom: 22px;
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 18px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.who {
		flex: 1;
		min-width: 0;
	}

	.line {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin-bottom: 8px;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		font-size: calc(15px * var(--fs));
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.you {
		flex: none;
		font-size: calc(12px * var(--fs));
		font-weight: 500;
		color: var(--text-5);
	}

	.pts {
		flex: none;
		margin-left: auto;
		font-family: var(--font-display);
		font-size: calc(20px * var(--fs));
		font-weight: 600;
	}

	.track {
		height: 10px;
		border-radius: 5px;
		background: var(--sunken-2);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		border-radius: 5px;
	}
</style>
