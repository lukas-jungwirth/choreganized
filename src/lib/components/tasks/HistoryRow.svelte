<!--
	One completion in the History feed [8a]: a member-coloured tick, what was
	done, who did it and when, and what it was worth.

	A task done together is one row: a tick per doer, overlapping, and a neutral
	chip saying what each got (→ SPEC §5.8, DECISIONS #277).

	Nothing here is a control — history is read-only, and the row that carried
	the task has moved on. The `+pts` chip wears the same tint as the circle, so
	a scan down the feed reads as two columns of the same two colours.
-->
<script lang="ts">
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { FeedEntry } from '$lib/server/services/history';

	let { entry }: { entry: FeedEntry } = $props();

	const m = messages();

	// A departed housemate's tick goes grey; their name and points stay.
	const colors = $derived(entry.doers.map((doer) => doer.color ?? 'var(--text-4)'));
	const shared = $derived(entry.doers.length > 1);
	const names = $derived(m.task.doers(entry.doers.map((doer) => doer.name)));
</script>

<!-- Shared, the chip belongs to no one doer, so it takes the neutral grey. -->
<li style:--row-color={shared ? 'var(--text-3)' : colors[0]}>
	<span class="ticks">
		{#each colors as color, index (index)}
			<span class="tick"><CheckCircle checked tinted size={30} {color} /></span>
		{/each}
	</span>
	<span class="what">
		<span class="task">{entry.taskName}</span>
		<span class="meta">{names} · {entry.time}</span>
	</span>
	<span class="points">
		{shared ? m.task.pointsEach(entry.points) : m.task.points(entry.points)}
	</span>
</li>

<style>
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 16px;
	}

	.ticks {
		display: flex;
		flex: none;
	}

	/* Overlapping ticks: each one cuts its outline out of the card behind it. */
	.tick {
		display: flex;
		border-radius: 50%;
		background: var(--card);
		box-shadow: 0 0 0 2px var(--card);
	}

	.tick + .tick {
		margin-left: -12px;
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.task {
		display: block;
		font-size: var(--fs-16);
		font-weight: 600;
		line-height: 1.2;
		/* Task names are free text up to 80 characters with no guaranteed space. */
		overflow-wrap: anywhere;
	}

	.meta {
		display: block;
		margin-top: 1px;
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	/* Only sage and terracotta have tint tokens; mixing the member's colour into
	   the card reproduces both and covers the other three (→ DECISIONS #35). */
	.points {
		flex: none;
		padding: 4px 9px;
		border-radius: var(--r-chip);
		background: color-mix(in srgb, var(--row-color) 12%, var(--card));
		font-size: var(--fs-14);
		font-weight: 700;
		color: var(--row-color);
	}
</style>
