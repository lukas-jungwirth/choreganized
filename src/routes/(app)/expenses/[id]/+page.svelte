<!--
	Expense detail [9e] (→ SPEC §11.3): what it was, who paid, every share — and
	under each share that isn't the payer's own, what that person owes for it —
	then who logged it and who touched it last. Edit opens the add sheet [9b-edit]
	(or, for a payment, the settle sheet [9d]); a delete goes back to the tab,
	which offers the undo.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import CategoryIcon from '$lib/components/expenses/CategoryIcon.svelte';
	import ExpenseSheet from '$lib/components/expenses/ExpenseSheet.svelte';
	import SettleSheet from '$lib/components/expenses/SettleSheet.svelte';
	import { pickablePeople } from '$lib/components/expenses/split-draft';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import { formatTimeIn, toCalendarDate } from '$lib/utils/dates';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	let editing = $state(false);

	const item = $derived(data.item);
	const byId = $derived(new Map(data.people.map((person) => [person.id, person])));
	const money = (minor: number) => m.expenses.money(minor, data.currency);
	const nameOf = (id: string) => byId.get(id)?.name ?? '?';
	const who = (id: string) => (id === data.me ? null : nameOf(id));
	const payer = $derived(byId.get(item.paidById));
	const pickable = $derived.by(() => {
		const people = pickablePeople(data.people, data.balances.byPerson);
		// Someone who has left still has to show up in an old expense's pickers.
		const involved = new Set([item.paidById, ...item.shares.map((share) => share.personId)]);
		return data.people.filter((person) => people.includes(person) || involved.has(person.id));
	});

	const title = $derived(
		item.kind === 'payment'
			? m.expenses.row.payment(
					who(item.paidById),
					who(item.shares[0]?.personId ?? ''),
					money(item.amountMinor)
				)
			: (item.description ?? '')
	);

	const dateLine = $derived(
		m.expenses.detail.dateLine(
			m.date.weekdayLong(item.date),
			m.date.shortAuto(item.date, data.today)
		)
	);

	function stamp(instant: Date): string {
		const day = toCalendarDate(instant, data.household.timezone);
		return m.expenses.detail.stamp(
			m.date.shortAuto(day, data.today),
			formatTimeIn(instant, data.household.timezone)
		);
	}

	function afterDelete() {
		void goto(`/expenses?deleted=${encodeURIComponent(item.id)}`);
	}
</script>

<svelte:head>
	<title
		>{m.common.pageTitle(
			item.kind === 'payment' ? m.expenses.detail.payment : (item.description ?? m.expenses.title)
		)}</title
	>
</svelte:head>

<div class="top">
	<a class="back" href="/expenses" aria-label={m.expenses.detail.back}>
		<ChevronLeft size={20} strokeWidth={2.2} />
	</a>
	<button type="button" class="edit" onclick={() => (editing = true)}>
		{m.expenses.detail.edit}
	</button>
</div>

<header class="hero">
	<CategoryIcon category={item.category} size={52} />
	<h1 class="what">{item.kind === 'payment' ? m.expenses.detail.payment : title}</h1>
	<p class="amount">{money(item.amountMinor)}</p>
	<p class="meta">
		{item.category
			? m.expenses.detail.meta(m.expenses.categories[item.category], dateLine)
			: dateLine}
	</p>
</header>

{#if item.kind === 'payment'}
	<p class="payment-line">{title}</p>
{:else}
	<h2 class="section">{m.expenses.detail.paidBy}</h2>
	<div class="card">
		<div class="line">
			<Avatar name={payer?.name} color={payer?.color} size={28} />
			<span class="name">
				{payer?.name ?? '?'}
				{#if item.paidById === data.me}<span class="tag">{m.expenses.detail.you}</span>{/if}
				{#if payer && payer.memberId === null}<span class="tag"
						>{m.expenses.detail.formerMember}</span
					>{/if}
			</span>
			<span class="value">{money(item.amountMinor)}</span>
		</div>
	</div>

	<h2 class="section">{m.expenses.detail.shares(m.expenses.detail.how[item.splitMode])}</h2>
	<ul class="card">
		{#each item.shares as share (share.personId)}
			{@const person = byId.get(share.personId)}
			<li class="line">
				<Avatar name={person?.name} color={person?.color} size={28} />
				<span class="name-block">
					<span class="name">
						{person?.name ?? '?'}
						{#if person && person.memberId === null}<span class="tag"
								>{m.expenses.detail.formerMember}</span
							>{/if}
					</span>
					{#if share.personId !== item.paidById && share.shareMinor > 0}
						<span class="owes">
							{m.expenses.detail.owesFor(
								who(share.personId),
								who(item.paidById),
								money(share.shareMinor)
							)}
						</span>
					{/if}
				</span>
				<span class="value">{money(share.shareMinor)}</span>
			</li>
		{/each}
	</ul>
{/if}

<p class="stamps">
	{m.expenses.detail.added(item.createdBy ?? m.expenses.detail.someone, stamp(item.createdAt))}
	{#if item.edited}
		<br />{m.expenses.detail.edited(
			item.updatedBy ?? m.expenses.detail.someone,
			stamp(item.updatedAt)
		)}
	{/if}
</p>

{#if editing && item.kind === 'expense'}
	<ExpenseSheet
		{item}
		people={pickable}
		me={data.me}
		currency={data.currency}
		today={data.today}
		splitDefault={data.splitDefault}
		suggestions={data.suggestions}
		onclose={() => (editing = false)}
		ondeleted={afterDelete}
	/>
{:else if editing}
	<SettleSheet
		{item}
		payments={data.balances.payments}
		people={pickable}
		me={data.me}
		currency={data.currency}
		today={data.today}
		onclose={() => (editing = false)}
		ondeleted={afterDelete}
	/>
{/if}

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 0 4px;
	}

	.back {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--ink);
	}

	.edit {
		padding: 8px 4px;
		font-size: calc(15px * var(--fs));
		font-weight: 700;
		color: var(--sage-deep);
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		margin: 10px 0 22px;
		text-align: center;
	}

	.hero :global(.well) {
		margin-bottom: 12px;
		border-radius: 16px;
	}

	.what {
		margin: 0;
		font-family: var(--font-body);
		font-size: calc(15px * var(--fs));
		font-weight: 500;
		color: var(--text-3);
	}

	.amount {
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(44px * var(--fs));
		font-weight: 600;
		line-height: 1.1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.meta {
		margin: 2px 0 0;
		font-size: calc(13px * var(--fs));
		color: var(--text-4);
	}

	.payment-line {
		margin: 0 0 20px;
		padding: 16px;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: calc(15px * var(--fs));
		font-weight: 600;
		text-align: center;
	}

	.section {
		margin: 0 4px 8px;
		font-family: var(--font-body);
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.card {
		margin: 0 0 20px;
		padding: 0;
		list-style: none;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.line {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
	}

	li.line + li.line {
		border-top: 1px solid var(--divider);
	}

	.name-block {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: calc(15px * var(--fs));
		font-weight: 600;
	}

	.tag {
		margin-left: 4px;
		font-size: calc(12px * var(--fs));
		font-weight: 500;
		color: var(--text-5);
	}

	.owes {
		font-size: calc(12px * var(--fs));
		color: var(--owe);
	}

	.value {
		flex: none;
		font-size: calc(15px * var(--fs));
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.stamps {
		margin: 4px 0 0;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.6;
		text-align: center;
		color: var(--text-5);
	}
</style>
