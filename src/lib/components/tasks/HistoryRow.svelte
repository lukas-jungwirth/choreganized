<!--
	One completion in the History feed [8a]: a member-coloured tick, what was
	done, who did it and when, and what it was worth.

	Nothing here is a control — history is read-only, and the row that carried
	the task has moved on. The `+pts` chip wears the same tint as the circle, so
	a scan down the feed reads as two columns of the same two colours.
-->
<script lang="ts">
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import type { FeedEntry } from '$lib/server/services/history';

	let { entry }: { entry: FeedEntry } = $props();

	// A departed housemate's tick goes grey; their name and points stay.
	const color = $derived(entry.memberColor ?? 'var(--text-4)');
</script>

<li style:--row-color={color}>
	<CheckCircle checked tinted size={30} {color} />
	<span class="what">
		<span class="task">{entry.taskName}</span>
		<span class="meta">{entry.memberName} · {entry.time}</span>
	</span>
	<span class="points">+{entry.points}</span>
</li>

<style>
	li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 16px;
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.task {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
		line-height: 1.2;
		/* Task names are free text up to 80 characters with no guaranteed space. */
		overflow-wrap: anywhere;
	}

	.meta {
		display: block;
		margin-top: 1px;
		font-size: 12px;
		color: var(--text-4);
	}

	/* Only sage and terracotta have tint tokens; mixing the member's colour into
	   the card reproduces both and covers the other three (→ DECISIONS #35). */
	.points {
		flex: none;
		padding: 4px 9px;
		border-radius: var(--r-chip);
		background: color-mix(in srgb, var(--row-color) 12%, var(--card));
		font-size: 12.5px;
		font-weight: 700;
		color: var(--row-color);
	}
</style>
