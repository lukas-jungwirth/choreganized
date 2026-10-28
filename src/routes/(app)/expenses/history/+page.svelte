<!--
	All activity [9f] (→ SPEC §11.12): search what it was for, then narrow by
	time, by who paid and by category — three chips that each name their value.
	A chip opens its own sheet and a pick applies at once; the sliders button
	opens all three together. A set chip turns sage, and its × clears it.

	Every filter is in the URL. The search is a GET form carrying the others as
	hidden fields, so it works before JavaScript has loaded; the sheets need it.
	A month or less is grouped by day, anything longer by month, and "All time"
	pages a month at a time.
-->
<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';
	import { goto } from '$app/navigation';
	import ExpenseRow from '$lib/components/expenses/ExpenseRow.svelte';
	import ReceiptIcon from '$lib/components/icons/ReceiptIcon.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SearchField from '$lib/components/ui/SearchField.svelte';
	import { messages } from '$lib/i18n';
	import {
		HISTORY_RANGES,
		historyPeriod,
		PAYMENTS_ONLY,
		type HistoryRange
	} from '$lib/utils/expense-history';
	import { EXPENSE_CATEGORIES } from '$lib/utils/expenses';
	import { untrack, type Snippet } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();
	const h = m.expenses.history;

	let form: HTMLFormElement | undefined = $state();
	let query = $state(untrack(() => data.filters.query));
	let timer: ReturnType<typeof setTimeout> | undefined;

	// Back, forward and "Clear all" change the URL under the field: follow it, so
	// a stale word isn't resubmitted with the next filter. Not while the field
	// has the focus — then the reply to a search sent mid-word would overwrite
	// what has been typed since.
	let field: HTMLElement | undefined = $state();
	$effect(() => {
		const next = data.filters.query;
		untrack(() => {
			if (!field?.contains(document.activeElement)) query = next;
		});
	});

	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(() => form?.requestSubmit(), 300);
	}

	/* ── Filters as URLs ──────────────────────────────────────────────────── */

	type Filters = {
		time: HistoryRange;
		start: string | null;
		end: string | null;
		payer: string | null;
		category: string | null;
	};

	const current: Filters = $derived({
		time: data.filters.range,
		start: data.filters.start,
		end: data.filters.end,
		payer: data.filters.payerId,
		category: data.filters.category
	});

	/** The URL for the filters as they are with `patch` applied — back on the first page. */
	function hrefFor(patch: Partial<Filters>, extra: Record<string, string> = {}): string {
		const next = { ...current, ...patch };
		const params = new URLSearchParams();
		if (data.filters.query) params.set('q', data.filters.query);
		if (next.time !== 'all') params.set('time', next.time);
		if (next.time === 'custom' && next.start) params.set('start', next.start);
		if (next.time === 'custom' && next.end) params.set('end', next.end);
		if (next.payer) params.set('payer', next.payer);
		if (next.category) params.set('category', next.category);
		for (const [key, value] of Object.entries(extra)) params.set(key, value);
		return `?${params}`;
	}

	function apply(patch: Partial<Filters>) {
		return goto(hrefFor(patch), { replaceState: true, noScroll: true, keepFocus: true });
	}

	const cleared: Partial<Filters> = {
		time: 'all',
		start: null,
		end: null,
		payer: null,
		category: null
	};

	/* ── What each chip says ──────────────────────────────────────────────── */

	const names = $derived(Object.fromEntries(data.people.map((person) => [person.id, person.name])));
	const others = $derived(data.people.filter((person) => person.id !== data.me));
	const myColor = $derived(data.people.find((person) => person.id === data.me)?.color);

	/** What a preset covers, in words: "November", "Sep – Nov", "2026". */
	function covers(range: HistoryRange): string | null {
		const period = historyPeriod(range, data.today);
		if (range === 'thisMonth' || range === 'lastMonth') {
			return m.date.monthName(period.from!, data.today);
		}
		if (range === 'last3Months') return m.date.monthRange(period.from!, period.to!);
		if (range === 'thisYear') return data.today.slice(0, 4);
		return null;
	}

	const customLabel = $derived(
		h.customRange(
			current.start && m.date.shortAuto(current.start, data.today),
			current.end && m.date.shortAuto(current.end, data.today)
		)
	);

	const timeLabel = $derived(
		current.time === 'all'
			? h.ranges.all
			: current.time === 'custom'
				? customLabel
				: current.time === 'last3Months'
					? h.ranges.last3Months
					: (covers(current.time) ?? h.ranges[current.time])
	);

	const payerLabel = $derived(
		!current.payer
			? h.anyPayer
			: h.paidByChip(current.payer === data.me ? null : (names[current.payer] ?? null))
	);

	const categoryLabel = $derived(
		!current.category
			? h.allCategories
			: current.category === PAYMENTS_ONLY
				? h.paymentsOnly
				: m.expenses.categories[current.category as keyof typeof m.expenses.categories]
	);

	const filtered = $derived(
		Boolean(data.filters.query) ||
			current.time !== 'all' ||
			current.payer !== null ||
			current.category !== null
	);

	const counted = $derived(
		current.category === PAYMENTS_ONLY
			? h.payments(data.count)
			: current.category
				? h.expenses(data.count)
				: h.entries(data.count)
	);

	/* ── Sheets ───────────────────────────────────────────────────────────── */

	let timeOpen = $state(false);
	let payerOpen = $state(false);
	let categoryOpen = $state(false);
	let allOpen = $state(false);

	// "Pick dates…" opens two fields in the Time sheet, filled with what's set.
	let picking = $state(false);
	let start = $state('');
	let end = $state('');
	$effect(() => {
		if (!timeOpen) return;
		untrack(() => {
			picking = current.time === 'custom';
			start = current.start ?? '';
			end = current.end ?? '';
		});
	});

	async function pick(patch: Partial<Filters>, close: () => void) {
		close();
		await apply(patch);
	}

	const olderHref = $derived(data.older ? hrefFor({}, { from: data.older }) : null);
</script>

<svelte:head>
	<title>{m.common.pageTitle(h.title)}</title>
</svelte:head>

<SubHeader title={h.title} back="/expenses" backLabel={h.back} />

<form
	bind:this={form}
	method="GET"
	class="search-row"
	data-sveltekit-keepfocus
	data-sveltekit-replacestate
	data-sveltekit-noscroll
	aria-label={h.filters}
>
	<div class="search" bind:this={field}>
		<SearchField
			label={h.search}
			placeholder={h.search}
			name="q"
			bind:value={query}
			oninput={onSearch}
		/>
	</div>
	{#if current.time !== 'all'}<input type="hidden" name="time" value={current.time} />{/if}
	{#if current.start}<input type="hidden" name="start" value={current.start} />{/if}
	{#if current.end}<input type="hidden" name="end" value={current.end} />{/if}
	{#if current.payer}<input type="hidden" name="payer" value={current.payer} />{/if}
	{#if current.category}<input type="hidden" name="category" value={current.category} />{/if}
	<button
		type="button"
		class="sliders"
		aria-label={h.allFilters}
		aria-haspopup="dialog"
		onclick={() => (allOpen = true)}
	>
		<SlidersHorizontal size={18} strokeWidth={2} />
	</button>
	<noscript><button type="submit">{m.ui.search}</button></noscript>
</form>

{#snippet filterChip(label: string, set: boolean, open: () => void, clear: Partial<Filters>)}
	<span class="chip" class:on={set}>
		<button type="button" class="open" aria-haspopup="dialog" onclick={open}>
			{label}
			{#if !set}<ChevronDown size={12} strokeWidth={2.4} aria-hidden="true" />{/if}
		</button>
		{#if set}
			<a
				class="clear"
				href={hrefFor(clear)}
				aria-label={h.clear(label)}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
			>
				<X size={14} strokeWidth={2.6} aria-hidden="true" />
			</a>
		{/if}
	</span>
{/snippet}

<div class="chips">
	{@render filterChip(timeLabel, current.time !== 'all', () => (timeOpen = true), {
		time: 'all',
		start: null,
		end: null
	})}
	{@render filterChip(payerLabel, current.payer !== null, () => (payerOpen = true), {
		payer: null
	})}
	{@render filterChip(categoryLabel, current.category !== null, () => (categoryOpen = true), {
		category: null
	})}
</div>

<p class="summary">
	<span>
		{counted}{#if filtered && data.spentMinor > 0}{' · '}<strong
				>{m.expenses.money(data.spentMinor, data.currency)}</strong
			>{/if}
	</span>
	{#if filtered}
		<a href="?" data-sveltekit-replacestate data-sveltekit-noscroll>{h.clearAll}</a>
	{/if}
</p>

{#if data.groups.length === 0 && !data.older}
	<EmptyState title={h.empty}>
		{#snippet icon()}<ReceiptIcon size={38} strokeWidth={1.6} />{/snippet}
		{h.emptyCopy}
	</EmptyState>
{/if}

{#each data.groups as group (group.key)}
	<section>
		{#if data.byDay}
			<h2 class="day">
				<span>{m.date.dayLabel(group.key, data.today)}</span>
				{#if group.spentMinor > 0}
					<span class="day-spent">{m.expenses.money(group.spentMinor, data.currency)}</span>
				{/if}
			</h2>
		{:else}
			<h2 class="month">
				<span class="month-name">{m.date.monthName(group.key, data.today)}</span>
				{#if group.spentMinor > 0}
					<span class="spent">{h.spent(m.expenses.money(group.spentMinor, data.currency))}</span>
				{/if}
			</h2>
		{/if}
		<ul class="rows">
			{#each group.items as item (item.id)}
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
		{h.load(m.date.monthName(data.older, data.today))}
	</a>
{/if}

<!-- ── One filter at a time: a pick applies and closes ──────────────────── -->

{#snippet option(
	selected: boolean,
	label: string,
	onpick: () => void,
	hint?: string,
	lead?: Snippet
)}
	<button type="button" role="radio" aria-checked={selected} class="option" onclick={onpick}>
		{#if lead}{@render lead()}{/if}
		<span class="option-text">
			<span class="option-label">{label}</span>
			{#if hint}<span class="option-hint">{hint}</span>{/if}
		</span>
		<span class="radio" class:on={selected} aria-hidden="true"></span>
	</button>
{/snippet}

<BottomSheet bind:open={timeOpen} title={h.time}>
	<div class="options" role="radiogroup" aria-label={h.time}>
		{#each HISTORY_RANGES.filter((range) => range !== 'custom') as range (range)}
			{@render option(
				current.time === range,
				h.ranges[range],
				() => pick({ time: range, start: null, end: null }, () => (timeOpen = false)),
				h.rangeHint(covers(range), historyPeriod(range, data.today).byDay)
			)}
		{/each}
		<button
			type="button"
			class="option"
			aria-expanded={picking}
			onclick={() => (picking = !picking)}
		>
			<span class="option-icon" aria-hidden="true"><Calendar size={18} strokeWidth={1.9} /></span>
			<span class="option-text">
				<span class="option-label">{h.ranges.custom}</span>
				{#if current.time === 'custom'}<span class="option-hint">{customLabel}</span>{/if}
			</span>
			<ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
		</button>
	</div>
	{#if picking}
		<div class="dates">
			<DateField label={h.from} bind:value={start} />
			<DateField label={h.to} bind:value={end} />
			<Button
				disabled={!start && !end}
				onclick={() =>
					pick(
						{ time: 'custom', start: start || null, end: end || null },
						() => (timeOpen = false)
					)}
			>
				{h.apply}
			</Button>
		</div>
	{/if}
</BottomSheet>

<BottomSheet bind:open={payerOpen} title={h.paidBy} subtitle={h.paidByHint}>
	<div class="options" role="radiogroup" aria-label={h.paidBy}>
		{#snippet anyIcon()}
			<span class="option-icon" aria-hidden="true"><Users size={16} strokeWidth={2} /></span>
		{/snippet}
		{@render option(
			current.payer === null,
			h.anyPayer,
			() => pick({ payer: null }, () => (payerOpen = false)),
			undefined,
			anyIcon
		)}
		{#snippet meAvatar()}<Avatar name={names[data.me]} color={myColor} size={32} />{/snippet}
		{@render option(
			current.payer === data.me,
			h.you,
			() => pick({ payer: data.me }, () => (payerOpen = false)),
			undefined,
			meAvatar
		)}
		{#each others as person (person.id)}
			{#snippet avatar()}<Avatar name={person.name} color={person.color} size={32} />{/snippet}
			{@render option(
				current.payer === person.id,
				person.name,
				() => pick({ payer: person.id }, () => (payerOpen = false)),
				undefined,
				avatar
			)}
		{/each}
	</div>
</BottomSheet>

<BottomSheet bind:open={categoryOpen} title={h.category}>
	<div class="options" role="radiogroup" aria-label={h.category}>
		{@render option(current.category === null, h.allCategories, () =>
			pick({ category: null }, () => (categoryOpen = false))
		)}
		{#each EXPENSE_CATEGORIES as key (key)}
			{@render option(current.category === key, m.expenses.categories[key], () =>
				pick({ category: key }, () => (categoryOpen = false))
			)}
		{/each}
		{@render option(current.category === PAYMENTS_ONLY, h.paymentsOnly, () =>
			pick({ category: PAYMENTS_ONLY }, () => (categoryOpen = false))
		)}
	</div>
</BottomSheet>

<!-- ── All three at once: each pick applies, the sheet stays for the next ── -->

<BottomSheet bind:open={allOpen} title={h.allFilters}>
	{#snippet action()}
		<button type="button" class="sheet-clear" onclick={() => apply(cleared)}>{h.clearAll}</button>
	{/snippet}
	<h3 class="group">{h.time}</h3>
	<div class="pills">
		{#each HISTORY_RANGES.filter((range) => range !== 'custom') as range (range)}
			<Chip
				selected={current.time === range}
				onclick={() => apply({ time: range, start: null, end: null })}
			>
				{h.ranges[range]}
			</Chip>
		{/each}
		<Chip
			class="dashed"
			selected={current.time === 'custom'}
			onclick={() => {
				allOpen = false;
				timeOpen = true;
			}}
		>
			{current.time === 'custom' ? customLabel : h.ranges.custom}
		</Chip>
	</div>

	<h3 class="group">{h.paidBy}</h3>
	<div class="pills">
		<Chip selected={current.payer === null} onclick={() => apply({ payer: null })}>
			{h.anyPayer}
		</Chip>
		<Chip
			selected={current.payer === data.me}
			color={myColor}
			onclick={() => apply({ payer: data.me })}
		>
			<Avatar name={names[data.me]} color={myColor} size={20} />
			{h.you}
		</Chip>
		{#each others as person (person.id)}
			<Chip
				selected={current.payer === person.id}
				color={person.color}
				onclick={() => apply({ payer: person.id })}
			>
				<Avatar name={person.name} color={person.color} size={20} />
				{person.name}
			</Chip>
		{/each}
	</div>

	<h3 class="group">{h.category}</h3>
	<div class="pills">
		<Chip selected={current.category === null} onclick={() => apply({ category: null })}>
			{h.allCategories}
		</Chip>
		{#each EXPENSE_CATEGORIES as key (key)}
			<Chip selected={current.category === key} onclick={() => apply({ category: key })}>
				{m.expenses.categories[key]}
			</Chip>
		{/each}
		<Chip
			class="dashed"
			selected={current.category === PAYMENTS_ONLY}
			onclick={() => apply({ category: PAYMENTS_ONLY })}
		>
			{h.paymentsOnly}
		</Chip>
	</div>

	<div class="show">
		<Button onclick={() => (allOpen = false)}>{h.show(counted)}</Button>
	</div>
</BottomSheet>

<style>
	.search-row {
		display: flex;
		gap: 10px;
		margin-bottom: 12px;
	}

	.search {
		flex: 1;
		min-width: 0;
	}

	.sliders {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 48px;
		border-radius: var(--r-input);
		background: var(--input-surface, var(--card));
		box-shadow: var(--shadow-card);
		color: var(--text-2);
	}

	/* Wraps rather than scrolls: a scroller clips the focus ring, and three
	   chips naming their values don't fit one line at 390px. */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		display: inline-flex;
		align-items: stretch;
		border: 1.5px solid var(--border);
		border-radius: var(--r-chip);
		background: var(--card);
		color: var(--text-2);
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		white-space: nowrap;
	}

	.chip.on {
		border-color: var(--sage);
		background: var(--sage);
		color: var(--on-sage);
	}

	/* The whole chip is the target, not just its words. */
	.open {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		min-height: 36px;
		padding: 0 12px;
		border-radius: var(--r-chip);
		color: inherit;
	}

	.on .open {
		padding-right: 2px;
	}

	/* 36 × 36: the × gets a thumb-sized target of its own, apart from the label. */
	.clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		border-radius: var(--r-chip);
		color: inherit;
	}

	.open:focus-visible,
	.clear:focus-visible,
	.sliders:focus-visible {
		outline: 2px solid var(--sage);
		outline-offset: 2px;
	}

	.summary {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin: 12px 4px 18px;
		font-size: calc(12.5px * var(--fs));
		color: var(--text-4);
		font-variant-numeric: tabular-nums;
	}

	.summary strong {
		color: var(--ink);
		font-weight: 700;
	}

	.summary a {
		font-weight: 600;
		color: var(--sage-deep);
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

	.day {
		display: flex;
		justify-content: space-between;
		margin: 6px 4px 8px;
		font-family: var(--font-body);
		font-size: calc(11.5px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-4);
	}

	.day-spent {
		letter-spacing: 0;
		color: var(--ink);
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

	/* ── Sheets ─────────────────────────────────────────────────────────── */

	.options {
		display: flex;
		flex-direction: column;
		margin: -6px 0 0;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 0;
		border-bottom: 1px solid var(--divider);
		text-align: left;
		color: var(--ink);
	}

	.option:last-child {
		border-bottom: none;
	}

	.option-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.option-label {
		font-size: calc(15px * var(--fs));
		font-weight: 600;
	}

	.option-hint {
		font-size: calc(12px * var(--fs));
		color: var(--text-4);
	}

	.option-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--divider);
		color: var(--text-3);
	}

	.radio {
		flex: none;
		width: 22px;
		height: 22px;
		border: 1.5px solid var(--border);
		border-radius: 50%;
	}

	.radio.on {
		border: 2px solid var(--sage);
		background: radial-gradient(circle, var(--sage) 0 5px, transparent 5.5px);
	}

	.dates {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 14px;
	}

	.group {
		margin: 0 0 10px;
		font-family: var(--font-body);
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 20px;
	}

	.pills :global(.dashed:not(.selected)) {
		border-style: dashed;
	}

	.sheet-clear {
		padding: 6px 0;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--sage-deep);
	}

	.show {
		margin-top: 8px;
	}

	.show :global(.button) {
		width: 100%;
	}
</style>
