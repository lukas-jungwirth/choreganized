<!--
	All activity [9f] (→ SPEC §11.12): search what it was for, narrow by
	category, by person, to what involves you or to settle-ups — grouped by
	month with what the household spent, and paged a month at a time.

	The filters are one GET form, so every change is a URL: back undoes it, and
	it works before JavaScript has loaded. With JavaScript, a change submits by
	itself (the search after a short pause) and keeps the focus where it was.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ExpenseRow from '$lib/components/expenses/ExpenseRow.svelte';
	import ReceiptIcon from '$lib/components/icons/ReceiptIcon.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SearchField from '$lib/components/ui/SearchField.svelte';
	import { messages } from '$lib/i18n';
	import { EXPENSE_CATEGORIES } from '$lib/utils/expenses';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	let form: HTMLFormElement | undefined = $state();
	let query = $state(untrack(() => data.filters.query));
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Back and forward change the URL under the field: follow it, so a stale
	// word isn't resubmitted with the next chip. While typing, the URL catches up
	// with the field, so this writes back what is already there.
	$effect(() => {
		query = data.filters.query;
	});

	const names = $derived(Object.fromEntries(data.people.map((person) => [person.id, person.name])));
	const submit = () => form?.requestSubmit();

	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(submit, 300);
	}

	/** The URL for "Load September": the filters as they are, one month further back. */
	const olderHref = $derived.by(() => {
		if (!data.older) return null;
		const params = new URLSearchParams();
		if (data.filters.query) params.set('q', data.filters.query);
		if (data.filters.category) params.set('category', data.filters.category);
		if (data.filters.personId) params.set('person', data.filters.personId);
		if (data.filters.mine) params.set('mine', '1');
		if (data.filters.payments) params.set('payments', '1');
		params.set('from', data.older);
		return `?${params}`;
	});
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.expenses.history.title)}</title>
</svelte:head>

<SubHeader title={m.expenses.history.title} back="/expenses" backLabel={m.expenses.history.back} />

<form
	bind:this={form}
	method="GET"
	class="filters"
	data-sveltekit-keepfocus
	data-sveltekit-replacestate
	data-sveltekit-noscroll
	aria-label={m.expenses.history.filters}
>
	<SearchField
		label={m.expenses.history.search}
		placeholder={m.expenses.history.search}
		name="q"
		bind:value={query}
		oninput={onSearch}
	/>

	<div class="chips">
		<label class="chip select" class:on={data.filters.category}>
			<span class="sr">{m.expenses.history.category}</span>
			<select name="category" value={data.filters.category ?? ''} onchange={submit}>
				<option value="">{m.expenses.history.category}</option>
				{#each EXPENSE_CATEGORIES as key (key)}
					<option value={key}>{m.expenses.categories[key]}</option>
				{/each}
			</select>
			<ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
		</label>

		<label class="chip select" class:on={data.filters.personId}>
			<span class="sr">{m.expenses.history.person}</span>
			<select name="person" value={data.filters.personId ?? ''} onchange={submit}>
				<option value="">{m.expenses.history.person}</option>
				{#each data.people as person (person.id)}
					<option value={person.id}>{person.name}</option>
				{/each}
			</select>
			<ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
		</label>

		<label class="chip" class:on={data.filters.mine}>
			<input type="checkbox" name="mine" value="1" checked={data.filters.mine} onchange={submit} />
			{#if data.filters.mine}<Check size={14} strokeWidth={2.6} aria-hidden="true" />{/if}
			{m.expenses.history.mine}
		</label>

		<label class="chip" class:on={data.filters.payments}>
			<input
				type="checkbox"
				name="payments"
				value="1"
				checked={data.filters.payments}
				onchange={submit}
			/>
			{#if data.filters.payments}<Check size={14} strokeWidth={2.6} aria-hidden="true" />{/if}
			{m.expenses.history.payments}
		</label>
	</div>
	<noscript><button type="submit">{m.ui.search}</button></noscript>
</form>

{#if data.months.length === 0 && !data.older}
	<EmptyState title={m.expenses.history.empty}>
		{#snippet icon()}<ReceiptIcon size={38} strokeWidth={1.6} />{/snippet}
		{m.expenses.history.emptyCopy}
	</EmptyState>
{/if}

{#each data.months as month (month.month)}
	<section>
		<h2 class="month">
			<span class="month-name">{m.date.monthName(month.month, data.today)}</span>
			{#if month.spentMinor > 0}
				<span class="spent"
					>{m.expenses.history.spent(m.expenses.money(month.spentMinor, data.currency))}</span
				>
			{/if}
		</h2>
		<ul class="rows">
			{#each month.items as item (item.id)}
				<ExpenseRow
					{item}
					me={data.me}
					{names}
					currency={data.currency}
					when={m.date.shortAuto(item.date, data.today)}
				/>
			{/each}
		</ul>
	</section>
{/each}

{#if olderHref && data.older}
	<a class="older" href={olderHref} data-sveltekit-noscroll>
		{m.expenses.history.load(m.date.monthName(data.older, data.today))}
	</a>
{/if}

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 20px;
	}

	.chips {
		display: flex;
		gap: 8px;
		margin: 0 calc(-1 * var(--page-pad));
		padding: 0 var(--page-pad) 2px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.chips::-webkit-scrollbar {
		display: none;
	}

	.chip {
		position: relative;
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-chip);
		background: var(--card);
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		color: var(--text-2);
		white-space: nowrap;
		cursor: pointer;
	}

	.chip:focus-within {
		outline: 2px solid var(--sage);
		outline-offset: 2px;
	}

	.chip.on {
		border-color: var(--sage);
		background: var(--sage);
		color: var(--on-sage);
	}

	.chip input[type='checkbox'] {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.select select {
		appearance: none;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		cursor: pointer;
		outline: none;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.month {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin: 6px 4px 10px;
	}

	.month-name {
		font-family: var(--font-display);
		font-size: calc(20px * var(--fs));
		font-weight: 600;
		color: var(--ink);
	}

	.spent {
		font-family: var(--font-body);
		font-size: calc(12.5px * var(--fs));
		font-weight: 500;
		color: var(--text-4);
		font-variant-numeric: tabular-nums;
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

	.older {
		display: block;
		padding: 12px;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		text-align: center;
		color: var(--sage-deep);
	}
</style>
