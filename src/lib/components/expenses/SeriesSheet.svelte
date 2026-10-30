<!--
	One recurring series [9h-stop] (→ SPEC §11.9): what it is, when the next one
	comes, and the two things you can do about it — change the ones to come, or
	stop it. Stopping keeps every expense it has logged, and says how many.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Ban from '@lucide/svelte/icons/ban';
	import Calendar from '@lucide/svelte/icons/calendar';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Pencil from '@lucide/svelte/icons/pencil';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { messages } from '$lib/i18n';
	import type { SeriesItem } from '$lib/server/services/expense-recurrences';
	import type { ExpensePerson } from '$lib/server/services/expenses';
	import type { CalendarDate } from '$lib/utils/dates';
	import CategoryIcon from './CategoryIcon.svelte';
	import { seriesRule } from './series';

	type Props = {
		series: SeriesItem;
		people: ExpensePerson[];
		me: string;
		currency: string;
		today: CalendarDate;
		/** "Edit series": the page swaps this sheet for the edit sheet. */
		onedit: () => void;
		onclose: () => void;
	};

	let { series, people, me, currency, today, onedit, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let stopping = $state(false);

	$effect(() => {
		if (!open) onclose();
	});

	const payer = $derived(people.find((person) => person.id === series.paidById));
	const summary = $derived(
		m.expenses.recurring.summary(
			m.expenses.money(series.amountMinor, currency),
			seriesRule(m, series),
			m.expenses.recurring.pays(series.paidById === me ? null : (payer?.name ?? '?'))
		)
	);
	const next = $derived(
		m.expenses.detail.dateLine(
			m.date.weekday(series.nextDate),
			m.date.shortAuto(series.nextDate, today)
		)
	);
</script>

<BottomSheet bind:open title={series.description} subtitle={summary}>
	{#snippet lead()}<CategoryIcon category={series.category} size={44} />{/snippet}

	<div class="next">
		<Calendar size={17} strokeWidth={1.8} aria-hidden="true" />
		<span class="next-label">{m.expenses.recurring.nextOne}</span>
		<span class="next-date">{next}</span>
	</div>

	<div class="group">
		<button
			type="button"
			class="row"
			onclick={() => {
				open = false;
				onedit();
			}}
		>
			<Pencil size={17} strokeWidth={1.8} aria-hidden="true" />
			<span class="text">
				<span class="title">{m.expenses.recurring.editSeries}</span>
				<span class="detail">{m.expenses.recurring.editSeriesDetail}</span>
			</span>
			<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
		</button>

		<form
			method="POST"
			action="?/stop"
			use:enhance={() => {
				stopping = true;
				return async ({ update }) => {
					await update({ reset: false });
					stopping = false;
					open = false;
				};
			}}
		>
			<input type="hidden" name="id" value={series.id} />
			<button type="submit" class="row stop" disabled={stopping}>
				<Ban size={17} strokeWidth={1.8} aria-hidden="true" />
				<span class="text">
					<span class="title">{m.expenses.recurring.stop}</span>
					<span class="detail">{m.expenses.recurring.stopDetail(series.occurrences)}</span>
				</span>
			</button>
		</form>
	</div>
</BottomSheet>

<style>
	.next {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 16px;
		padding: 13px 15px;
		border-radius: var(--r-block);
		background: var(--sunken);
		color: var(--text-3);
	}

	.next-label {
		flex: 1;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.next-date {
		font-size: var(--fs-16);
		font-weight: 700;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.group {
		margin-bottom: 8px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--r-block);
		background: var(--card);
	}

	.group > :global(* + *) {
		border-top: 1px solid var(--divider-sheet);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 15px;
		color: var(--text-3);
		text-align: left;
	}

	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.detail {
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.stop,
	.stop .title {
		color: var(--danger);
	}

	.stop:disabled {
		opacity: 0.6;
	}
</style>
