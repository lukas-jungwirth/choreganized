<!--
	Tasks → History [8a] — the month's podium and everything the household has
	ticked off, newest first.

	The other half of the Tasks screen, so it keeps the Tasks title and the
	segmented control and swaps the list for the feed. The podium stands in for
	the points tiles [05]: same numbers, told as a scoreboard.
-->
<script lang="ts">
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import HistoryRow from '$lib/components/tasks/HistoryRow.svelte';
	import Podium from '$lib/components/tasks/Podium.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const view = $derived([
		{ value: 'todo', label: `To do · ${data.todoCount}`, href: '/tasks' },
		{ value: 'history', label: 'History', href: '/tasks/history' }
	]);

	/** Nothing in the window and nothing older to reach for: a first month. */
	const blank = $derived(data.feed.days.length === 0 && !data.feed.older);
</script>

<svelte:head>
	<title>History · Choreganized</title>
</svelte:head>

<PageHeader title="Tasks" />

<div class="view">
	<SegmentedControl label="Task view" value="history" options={view} />
</div>

<Podium podium={data.podium} />

{#if blank}
	<div class="nothing">
		<EmptyState title="Nothing done yet">
			{#snippet icon()}<ChecklistIcon size={38} strokeWidth={1.6} />{/snippet}
			Tick a task off and it lands here — what it was, who did it, and what it was worth.
			{#snippet action()}
				<Button href="/tasks">Back to the list</Button>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="feed">
		{#each data.feed.days as day (day.date)}
			<section>
				<h2>{day.label}</h2>
				<!-- `list`, because HistoryRow is an `<li>` and an `<li>` outside a
					 list element is invalid markup. -->
				<RowGroup list>
					{#each day.entries as entry (entry.id)}
						<HistoryRow {entry} />
					{/each}
				</RowGroup>
			</section>
		{/each}

		<!-- A month somebody paged into that turned out to hold nothing (its
			 completions belonged to a housemate who has since left). The window
			 has to account for itself before offering another one. -->
		{#if data.feed.days.length === 0}
			<p class="quiet">Nothing was completed in this stretch.</p>
		{/if}

		{#if data.feed.older}
			{@const older = data.feed.older}
			<!-- A link, not a fetch: the window lives in the URL, so this works
				 with no JavaScript and survives a refresh. `noscroll` keeps the
				 button under your thumb instead of jumping back to the podium. -->
			<Button variant="secondary" href="?from={older.from}" data-sveltekit-noscroll>
				Show {older.label}
			</Button>
		{/if}
	</div>
{/if}

<style>
	.view {
		margin-bottom: 22px;
	}

	.feed {
		margin-top: 22px;
	}

	section {
		margin-bottom: 18px;
	}

	h2 {
		margin: 0 4px 10px;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.quiet {
		margin: 0 4px 18px;
		font-size: 13.5px;
		color: var(--text-4);
	}

	.nothing {
		margin-top: 30px;
	}
</style>
