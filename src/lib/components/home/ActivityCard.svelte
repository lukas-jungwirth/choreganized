<!--
	The two most recent completions [8b] — the "someone did a thing" signal that
	makes the household feel shared. Hidden entirely until there's history, which
	the page decides.
-->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { ActivityEntry } from '$lib/server/services/home';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let { entries }: { entries: ActivityEntry[] } = $props();

	const m = messages();
</script>

<Card href="/tasks/history">
	<div class="activity">
		<header>
			<span class="eyebrow">{m.home.activity.title}</span>
			<span class="all">{m.home.activity.all}<ChevronRight size={13} strokeWidth={2.2} /></span>
		</header>

		<ul>
			{#each entries as entry (entry.id)}
				{@const colors = entry.doers.map((doer) => doer.color ?? 'var(--text-4)')}
				{@const shared = entry.doers.length > 1}
				<li>
					<!-- Done together: a tick per doer, and points that are nobody's colour. -->
					<span class="ticks">
						{#each colors as color, index (index)}
							<span class="tick"><CheckCircle checked tinted size={28} {color} /></span>
						{/each}
					</span>
					<span class="what">
						<span class="task">{entry.taskName}</span>
						<span class="meta">
							{m.task.doers(entry.doers.map((doer) => doer.name))} · {entry.time}
						</span>
					</span>
					<span class="points" style:color={shared ? 'var(--text-3)' : colors[0]}>
						{shared ? m.task.pointsEach(entry.points) : m.task.points(entry.points)}
					</span>
				</li>
			{/each}
		</ul>
	</div>
</Card>

<style>
	.activity {
		padding: 15px 16px 4px;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.eyebrow {
		font-size: var(--fs-12);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--sage);
	}

	.all {
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: var(--fs-14);
		font-weight: 600;
		color: var(--text-4);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 11px 0;
	}

	li + li {
		border-top: 1px solid var(--divider);
	}

	.ticks {
		display: flex;
		flex: none;
	}

	.tick {
		display: flex;
		border-radius: 50%;
		background: var(--card);
		box-shadow: 0 0 0 2px var(--card);
	}

	.tick + .tick {
		margin-left: -11px;
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.task {
		display: block;
		font-size: var(--fs-16);
		font-weight: 600;
	}

	.meta {
		display: block;
		margin-top: 1px;
		font-size: var(--fs-13);
		color: var(--text-4);
	}

	.points {
		flex: none;
		font-size: var(--fs-14);
		font-weight: 700;
	}
</style>
