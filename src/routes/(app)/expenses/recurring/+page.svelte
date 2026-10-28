<!--
	Recurring [9h] (→ SPEC §11.9): every series that is running, the soonest due
	first — what it is, how much, how often and when next, and who pays. A row
	opens the series [9h-stop]; "Edit series" there swaps in the add sheet in
	its series mode. Both are state, not routes (→ DECISIONS #17).

	"Add expense" — the empty state's button, then the FAB — is the tab's own:
	the same sheet with Repeats on "Never", so nothing repeats that wasn't asked
	to. A series starts from the expense it is first logged as (→ SPEC §11.9,
	DECISIONS #194).
-->
<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import CategoryIcon from '$lib/components/expenses/CategoryIcon.svelte';
	import ExpenseSheet from '$lib/components/expenses/ExpenseSheet.svelte';
	import SeriesSheet from '$lib/components/expenses/SeriesSheet.svelte';
	import { seriesSchedule } from '$lib/components/expenses/series';
	import { pickablePeople } from '$lib/components/expenses/split-draft';
	import RepeatIcon from '$lib/components/icons/RepeatIcon.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	type Sheet = { kind: 'series'; id: string } | { kind: 'edit'; id: string } | { kind: 'add' };
	let sheet = $state<Sheet | null>(null);

	/** Looked up by id, so the sheet follows the list as it reloads — and closes if it's gone. */
	const openId = $derived(sheet && sheet.kind !== 'add' ? sheet.id : null);
	const open = $derived(data.series.find((series) => series.id === openId));
	const byId = $derived(new Map(data.people.map((person) => [person.id, person])));
	const pickable = $derived.by(() => {
		const people = pickablePeople(data.people, data.balances);
		// Someone who has left still has to show up in a series they are part of.
		const involved = new Set(
			open ? [open.paidById, ...open.shares.map((share) => share.personId)] : []
		);
		return data.people.filter((person) => people.includes(person) || involved.has(person.id));
	});
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.expenses.recurring.title)}</title>
</svelte:head>

<SubHeader
	title={m.expenses.recurring.title}
	back="/expenses"
	backLabel={m.expenses.recurring.back}
/>

{#if data.series.length === 0}
	<EmptyState title={m.expenses.recurring.empty}>
		{#snippet icon()}<RepeatIcon size={34} strokeWidth={1.6} />{/snippet}
		{m.expenses.recurring.emptyCopy}
		{#snippet action()}
			<Button onclick={() => (sheet = { kind: 'add' })}>
				<Plus size={18} strokeWidth={2.4} aria-hidden="true" />
				{m.expenses.add}
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	<p class="intro">{m.expenses.recurring.intro}</p>

	<ul class="list">
		{#each data.series as series (series.id)}
			{@const payer = byId.get(series.paidById)}
			<li>
				<button
					type="button"
					class="row"
					data-testid="series-row"
					onclick={() => (sheet = { kind: 'series', id: series.id })}
				>
					<CategoryIcon category={series.category} />
					<span class="text">
						<span class="title">{series.description}</span>
						<span class="meta">
							<span class="amount">{m.expenses.money(series.amountMinor, data.currency)}</span>
							· {seriesSchedule(m, series, data.today)}
						</span>
					</span>
					<Avatar name={payer?.name} color={payer?.color} size={24} />
				</button>
			</li>
		{/each}
	</ul>

	<FAB label={m.expenses.add} onclick={() => (sheet = { kind: 'add' })}>
		<Plus size={24} strokeWidth={2.4} />
	</FAB>
{/if}

{#if sheet?.kind === 'add'}
	<ExpenseSheet
		item={null}
		people={pickablePeople(data.people, data.balances)}
		me={data.me}
		currency={data.currency}
		today={data.today}
		splitDefault={data.splitDefault}
		suggestions={data.suggestions}
		onclose={() => (sheet = null)}
	/>
{:else if open && sheet?.kind === 'series'}
	<SeriesSheet
		series={open}
		people={data.people}
		me={data.me}
		currency={data.currency}
		today={data.today}
		onedit={() => (sheet = { kind: 'edit', id: open.id })}
		onclose={() => {
			if (sheet?.kind === 'series') sheet = null;
		}}
	/>
{:else if open && sheet?.kind === 'edit'}
	<ExpenseSheet
		item={null}
		series={open}
		people={pickable}
		me={data.me}
		currency={data.currency}
		today={data.today}
		splitDefault={data.splitDefault}
		suggestions={data.suggestions}
		onclose={() => (sheet = null)}
	/>
{/if}

<style>
	.intro {
		margin: 0 4px 16px;
		font-size: calc(13px * var(--fs));
		line-height: 1.5;
		color: var(--text-4);
	}

	.list {
		/* Room for the FAB, which would otherwise sit on the last row's payer. */
		margin: 0 0 64px;
		padding: 0;
		overflow: hidden;
		list-style: none;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	li + li {
		border-top: 1px solid var(--divider);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 15px;
		text-align: left;
		color: var(--ink);
	}

	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title {
		overflow: hidden;
		font-size: calc(14.5px * var(--fs));
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta {
		font-size: calc(12px * var(--fs));
		color: var(--text-4);
	}

	.amount {
		font-weight: 600;
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
	}
</style>
