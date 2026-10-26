<!--
	Expenses [9a] [9a-owe] [9a-settled] [9g] (→ SPEC §11.2): the balance card
	first, because "are we square?" is why the tab was opened; then the recent
	ledger, a way through to all of it, and the FAB that adds to it.

	The sheets — add/edit [9b], settle up [9d], settings — are state rather than
	routes (→ DECISIONS #17), mounted only while open. A delete raises the undo
	toast, whether it happened here or on the detail screen, which comes back
	with `?deleted=` for exactly that.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import BalanceCard from '$lib/components/expenses/BalanceCard.svelte';
	import ExpenseRow from '$lib/components/expenses/ExpenseRow.svelte';
	import ExpenseSettingsSheet from '$lib/components/expenses/ExpenseSettingsSheet.svelte';
	import ExpenseSheet from '$lib/components/expenses/ExpenseSheet.svelte';
	import SettleSheet from '$lib/components/expenses/SettleSheet.svelte';
	import { groupByDay, pickablePeople } from '$lib/components/expenses/split-draft';
	import ReceiptIcon from '$lib/components/icons/ReceiptIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import UndoToast from '$lib/components/ui/UndoToast.svelte';
	import { messages } from '$lib/i18n';
	import { formatTimeIn } from '$lib/utils/dates';
	import type { Payment } from '$lib/utils/money';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	type Sheet = { kind: 'add' } | { kind: 'settle'; payment: Payment | null } | { kind: 'settings' };

	let sheet = $state<Sheet | null>(null);
	let menuOpen = $state(false);
	/** The expense just deleted, while its undo is on offer. */
	let deleted = $state<{ id: string; label: string } | null>(null);

	const names = $derived(Object.fromEntries(data.people.map((person) => [person.id, person.name])));
	const pickable = $derived(pickablePeople(data.people, data.balances.byPerson));
	const balance = $derived(data.balances.byPerson[data.me] ?? 0);
	const days = $derived(groupByDay(data.recent));
	const empty = $derived(data.recent.length === 0);
	const isOwner = $derived(data.currentMember.role === 'owner');

	// The detail screen deletes, then sends the reader here to offer the undo.
	$effect(() => {
		const id = page.url.searchParams.get('deleted');
		if (!id) return;
		deleted = { id, label: page.url.searchParams.get('what') || m.expenses.undo.payment };
		void goto('/expenses', { replaceState: true, noScroll: true, keepFocus: true });
	});

	function closeMenu(event: MouseEvent) {
		if (!(event.target as HTMLElement).closest('.menu-wrap')) menuOpen = false;
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.expenses.title)}</title>
</svelte:head>

<svelte:window onclick={menuOpen ? closeMenu : undefined} />

<PageHeader title={m.expenses.title}>
	{#snippet actions()}
		<div class="menu-wrap">
			<button
				type="button"
				class="more"
				aria-label={m.expenses.menu.label}
				aria-expanded={menuOpen}
				aria-haspopup="menu"
				onclick={() => (menuOpen = !menuOpen)}
			>
				<Ellipsis size={17} strokeWidth={2.6} />
			</button>
			{#if menuOpen}
				<div class="menu" role="menu">
					<a role="menuitem" href="/expenses/history" onclick={() => (menuOpen = false)}>
						<Search size={16} strokeWidth={2} aria-hidden="true" />
						{m.expenses.menu.allActivity}
					</a>
					<button
						type="button"
						role="menuitem"
						onclick={() => {
							menuOpen = false;
							sheet = { kind: 'settings' };
						}}
					>
						<Settings size={16} strokeWidth={2} aria-hidden="true" />
						{m.expenses.menu.settings}
					</button>
				</div>
			{/if}
		</div>
	{/snippet}
</PageHeader>

{#if empty}
	<EmptyState title={m.expenses.empty.title}>
		{#snippet icon()}<ReceiptIcon size={38} strokeWidth={1.6} />{/snippet}
		{m.expenses.empty.copy}
		{#snippet action()}
			<Button onclick={() => (sheet = { kind: 'add' })}>
				<Plus size={18} strokeWidth={2.4} aria-hidden="true" />
				{m.expenses.empty.add}
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	<BalanceCard
		{balance}
		payments={data.balances.payments}
		people={data.people}
		me={data.me}
		currency={data.currency}
		onsettle={(payment) => (sheet = { kind: 'settle', payment })}
	/>

	<h2 class="recent">{m.expenses.recent}</h2>
	{#each days as day (day.date)}
		<section class="day">
			<h3 class="day-label">{m.date.dayLabel(day.date, data.today)}</h3>
			<ul class="rows">
				{#each day.items as item (item.id)}
					<ExpenseRow
						{item}
						me={data.me}
						{names}
						currency={data.currency}
						when={formatTimeIn(item.createdAt, data.household.timezone)}
					/>
				{/each}
			</ul>
		</section>
	{/each}

	<a class="all" href="/expenses/history">
		{m.expenses.allActivity}
		<ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
	</a>

	<!-- Stood down while the undo toast is up: the two share the bottom-right
		 corner, and the toast's Undo is the one thing that can't wait. -->
	{#if !deleted}
		<FAB label={m.expenses.add} onclick={() => (sheet = { kind: 'add' })}>
			<Plus size={24} strokeWidth={2.4} />
		</FAB>
	{/if}
{/if}

{#if sheet?.kind === 'add'}
	<ExpenseSheet
		item={null}
		people={pickable}
		me={data.me}
		currency={data.currency}
		today={data.today}
		splitDefault={data.splitDefault}
		suggestions={data.suggestions}
		onclose={() => (sheet = null)}
	/>
{:else if sheet?.kind === 'settle'}
	<SettleSheet
		suggested={sheet.payment}
		payments={data.balances.payments}
		people={pickable}
		me={data.me}
		currency={data.currency}
		today={data.today}
		onclose={() => (sheet = null)}
	/>
{:else if sheet?.kind === 'settings'}
	<ExpenseSettingsSheet
		people={data.people}
		currency={data.currency}
		currencyLocked={data.currencyLocked}
		{isOwner}
		splitDefault={data.splitDefault}
		onclose={() => (sheet = null)}
	/>
{/if}

{#if deleted}
	{@const current = deleted}
	<UndoToast
		message={m.expenses.undo.deleted(current.label)}
		action="?/restore"
		fields={{ id: current.id }}
		label={m.expenses.undo.action}
		key={current.id}
		undo={() =>
			async ({ update }) => {
				await update({ reset: false });
				deleted = null;
			}}
		onclose={() => (deleted = null)}
	/>
{/if}

<style>
	.menu-wrap {
		position: relative;
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--text-4);
	}

	.menu {
		position: absolute;
		top: 46px;
		right: 0;
		z-index: 5;
		min-width: 220px;
		padding: 6px;
		border-radius: var(--r-block);
		background: var(--card);
		box-shadow: var(--shadow-modal);
	}

	.menu a,
	.menu button {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 11px 12px;
		border-radius: 12px;
		font-size: calc(14.5px * var(--fs));
		font-weight: 600;
		text-align: left;
		color: var(--ink);
	}

	.menu :global(svg) {
		color: var(--text-4);
	}

	.menu a:hover,
	.menu button:hover,
	.menu a:focus-visible,
	.menu button:focus-visible {
		background: var(--sunken);
	}

	.recent,
	.day-label {
		font-family: var(--font-body);
	}

	.recent {
		margin: 0 4px 12px;
		font-size: calc(12px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-4);
	}

	.day-label {
		margin: 0 4px 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.rows {
		margin: 0 0 20px;
		padding: 0;
		overflow: hidden;
		list-style: none;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.all {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 13px;
		border-radius: var(--r-block);
		background: var(--sunken-2);
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		color: var(--sage-deep);
	}
</style>
