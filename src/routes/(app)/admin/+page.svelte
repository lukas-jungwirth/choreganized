<!--
	Admin [no frame] (→ plan 34, SPEC §12, DECISIONS #228). Built from the
	settings subpage's parts: the header [6b], tiles for the counts, a bar per
	week for sign-ups, and the households as a list. Only an admin in admin
	mode ever loads it (→ `requireAdmin`); for everyone else it's a 404.
-->
<script lang="ts">
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const tiles = $derived([
		{ value: data.active7, label: m.admin.active7 },
		{ value: data.active30, label: m.admin.active30 },
		{ value: data.totals.households, label: m.admin.totals.households },
		{ value: data.totals.users, label: m.admin.totals.users },
		{ value: data.totals.members, label: m.admin.totals.members },
		{ value: data.totals.pushDevices, label: m.admin.totals.pushDevices }
	]);

	/** The tallest bar is the busiest week; an empty quarter still draws a baseline. */
	const peak = $derived(Math.max(1, ...data.weeks.map((week) => week.households + week.users)));
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.admin.title)}</title>
</svelte:head>

<SubHeader
	title={m.admin.title}
	subtitle={m.admin.subtitle}
	back="/settings"
	backLabel={m.admin.back}
/>

<div class="tiles">
	{#each tiles as tile (tile.label)}
		<Card radius="md">
			<div class="tile">
				<span class="value">{tile.value}</span>
				<span class="label">{tile.label}</span>
			</div>
		</Card>
	{/each}
</div>

<h2 class="section">{m.admin.signups}</h2>

<Card radius="md">
	<div class="chart">
		<ol class="bars">
			{#each data.weeks as week (week.start)}
				<li class="week">
					<span class="visually-hidden">
						{m.admin.weekLabel(m.date.short(week.start), week.households, week.users)}
					</span>
					<span class="stack" aria-hidden="true">
						<span class="bar users" style:height="{(week.users / peak) * 100}%"></span>
						<span class="bar households" style:height="{(week.households / peak) * 100}%"></span>
					</span>
				</li>
			{/each}
		</ol>
		<div class="axis" aria-hidden="true">
			<span>{m.date.short(data.weeks[0].start)}</span>
			<span>{m.admin.thisWeek}</span>
		</div>
		<p class="legend" aria-hidden="true">
			<span class="key households"></span>{m.admin.totals.households}
			<span class="key users"></span>{m.admin.totals.users}
		</p>
	</div>
</Card>

<h2 class="section">{m.admin.list}</h2>

<RowGroup list>
	{#each data.households as household (household.id)}
		<li class="household">
			<span class="name">{household.name}</span>
			<span class="meta">
				{m.admin.members(household.memberCount)} · {m.admin.since(
					m.date.shortAuto(household.createdAt, data.today)
				)}
			</span>
			<span class={['activity', { idle: !household.lastActiveAt }]}>
				{household.lastActiveAt
					? m.admin.lastActive(m.date.dayLabel(household.lastActiveAt, data.today))
					: m.admin.neverActive}
			</span>
		</li>
	{/each}
</RowGroup>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.tile {
		display: block;
		padding: 15px;
	}

	.value {
		display: block;
		font-family: var(--font-display);
		font-size: var(--fs-32);
		font-weight: 600;
		line-height: 1.1;
		color: var(--ink);
	}

	.label {
		display: block;
		margin-top: 4px;
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.section {
		margin: 22px 4px 8px;
		font-family: var(--font-body);
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.chart {
		padding: 16px;
	}

	.bars {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		align-items: end;
		gap: 6px;
		height: 96px;
		margin: 0;
		padding: 0;
		list-style: none;
		border-bottom: 1px solid var(--sunken-2);
	}

	.week,
	.stack {
		display: flex;
		height: 100%;
	}

	/* Read out, never seen: the bars beside it are the picture of the same numbers. */
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.stack {
		flex: 1;
		flex-direction: column-reverse;
	}

	.bar {
		display: block;
		border-radius: 3px;
	}

	.households {
		background: var(--sage);
	}

	.users {
		background: var(--terracotta);
	}

	.bar + .bar {
		margin-bottom: 2px;
	}

	.axis {
		display: flex;
		justify-content: space-between;
		margin-top: 6px;
		font-size: var(--fs-13);
		color: var(--text-4);
	}

	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 10px 0 0;
		font-size: var(--fs-13);
		color: var(--text-3);
	}

	.key {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}

	.key.users {
		margin-left: 10px;
	}

	.household {
		display: grid;
		gap: 2px;
		padding: 12px 16px;
	}

	.name {
		font-size: var(--fs-17);
		font-weight: 600;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.meta,
	.activity {
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.activity {
		color: var(--sage);
	}

	.activity.idle {
		color: var(--text-5);
	}
</style>
