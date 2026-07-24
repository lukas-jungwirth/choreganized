<!--
	The "Recent history" block under the to-do list [05]. Its real job is the
	sentence above it: a recurring task that vanished from To do isn't gone, it
	has a next date — this is where it went in the meantime.

	The full feed and the podium are plan 09's [8a]; the whole card links there.
-->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { CompletionEntry } from '$lib/server/services/tasks';

	let { entries }: { entries: CompletionEntry[] } = $props();

	const m = messages();
</script>

<section>
	<h2>{m.tasks.history.recent}</h2>
	<p class="explainer">{m.tasks.history.explainer}</p>

	<Card href="/tasks/history" radius="md">
		<ul>
			{#each entries as entry (entry.id)}
				{@const color = entry.memberColor ?? 'var(--text-4)'}
				<li>
					<!-- Member-coloured like Home's feed [8b] rather than the flat sage
						 [05] draws: the same event, so the same wash. -->
					<CheckCircle checked tinted size={20} {color} />
					<span class="what">
						<span class="task">{entry.taskName}</span>
						<span class="meta">
							{[entry.repeat, entry.memberName, entry.when].filter(Boolean).join(' · ')}
						</span>
					</span>
					<span class="points">{m.task.points(entry.points)}</span>
				</li>
			{/each}
		</ul>
	</Card>
</section>

<style>
	section {
		margin-top: 22px;
	}

	h2 {
		margin: 0 4px 4px;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.explainer {
		margin: 0 4px 8px;
		font-size: 12px;
		line-height: 1.45;
		color: var(--text-5);
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: 13px;
		padding: 13px 15px;
	}

	li + li {
		border-top: 1px solid var(--divider);
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
		color: var(--text-2);
		overflow-wrap: anywhere;
	}

	.meta {
		display: block;
		margin-top: 2px;
		font-size: 12px;
		color: var(--text-5);
	}

	.points {
		flex: none;
		font-size: 12px;
		font-weight: 700;
		color: var(--text-5);
	}
</style>
