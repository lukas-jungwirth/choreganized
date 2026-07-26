<!--
	Tasks → History [8a] — the stats landing (→ SPEC §5.8). Keeps the Tasks title
	and the To do / History switch, then two cards: how the recurring plan splits
	by design, and the points board with a timeframe toggle. The full completed
	feed is one level down, behind "All completed chores".
-->
<script lang="ts">
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import ChoreSplit from '$lib/components/tasks/ChoreSplit.svelte';
	import PointsBoard from '$lib/components/tasks/PointsBoard.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { messages } from '$lib/i18n';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const view = $derived([
		{ value: 'todo', label: m.tasks.view.todo, href: '/tasks' },
		{ value: 'history', label: m.tasks.view.history, href: '/tasks/history' }
	]);
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.tasks.view.history)}</title>
</svelte:head>

<PageHeader title={m.tasks.title} />

<div class="view">
	<SegmentedControl label={m.tasks.view.label} value="history" options={view} />
</div>

<div class="cards">
	<ChoreSplit shares={data.split} />

	<PointsBoard
		members={data.members}
		points={data.points}
		currentMemberId={data.currentMember.id}
		range={data.range}
	/>

	<a class="all" href="/tasks/history/all">
		<span>{m.tasks.allCompleted}</span>
		<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
	</a>
</div>

<style>
	.view {
		margin-bottom: 22px;
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.all {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 16px;
		border-radius: var(--r-block);
		background: var(--sage-tint);
		font-size: 15px;
		font-weight: 600;
		color: var(--sage-deep);
	}

	.all:active {
		background: var(--sage-row);
	}
</style>
