<!--
	Tasks → History → all completed chores [8a] (→ SPEC §5.8) — everything the
	household has ticked off, newest first, grouped by the day it fell on, paged a
	month at a time. One level below History, so it opens with a way back rather
	than the To do / History switch.
-->
<script lang="ts">
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import HistoryRow from '$lib/components/tasks/HistoryRow.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	/** Nothing in the window and nothing older to reach for: a first, empty history. */
	const blank = $derived(data.feed.days.length === 0 && !data.feed.older);
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.tasks.allCompleted)}</title>
</svelte:head>

<PageHeader title={m.tasks.title} />

<a class="back" href="/tasks/history">
	<ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
	{m.tasks.historyScreen.backToHistory}
</a>

{#if blank}
	<div class="nothing">
		<EmptyState title={m.tasks.historyScreen.emptyTitle}>
			{#snippet icon()}<ChecklistIcon size={38} strokeWidth={1.6} />{/snippet}
			{m.tasks.historyScreen.emptyCopy}
			{#snippet action()}
				<Button href="/tasks/history">{m.tasks.historyScreen.backToHistory}</Button>
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
			 completions belonged to a housemate who has since left). -->
		{#if data.feed.days.length === 0}
			<p class="quiet">{m.tasks.historyScreen.emptyStretch}</p>
		{/if}

		{#if data.feed.older}
			{@const older = data.feed.older}
			<!-- A link, not a fetch: the window lives in the URL, so this works with
				 no JavaScript and survives a refresh. `noscroll` keeps the button
				 under your thumb instead of jumping back to the top. -->
			<Button variant="secondary" href="?from={older.from}" data-sveltekit-noscroll>
				{m.tasks.historyScreen.showMonth(older.label)}
			</Button>
		{/if}
	</div>
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 20px;
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	section {
		margin-bottom: 18px;
	}

	h2 {
		margin: 0 4px 10px;
		font-family: var(--font-body);
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.quiet {
		margin: 0 4px 18px;
		font-size: calc(13.5px * var(--fs));
		color: var(--text-4);
	}

	.nothing {
		margin-top: 30px;
	}
</style>
