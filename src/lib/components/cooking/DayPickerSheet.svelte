<!--
	"Add to plan" from a recipe [7a] asks which day before it can open the plan
	sheet — the week, with whatever is already on each day, so replacing
	Thursday's dinner is a decision rather than a surprise.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import type { MealWeek } from '$lib/server/services/meals';
	import { formatWeekdayLong, type CalendarDate } from '$lib/utils/dates';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	type Props = {
		week: MealWeek;
		onpick: (date: CalendarDate) => void;
		onclose: () => void;
	};

	let { week, onpick, onclose }: Props = $props();

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title="Which day?" eyebrow="Add to plan">
	<RowGroup surface="sunken">
		{#each week.days as day (day.date)}
			<!-- The label spells the day out; the row itself abbreviates it to fit. -->
			<button
				type="button"
				class="day"
				class:today={day.isToday}
				aria-label="{formatWeekdayLong(day.date)} {day.dayOfMonth} — {day.meal?.name ?? 'free'}"
				onclick={() => onpick(day.date)}
			>
				<span class="when">
					<span class="weekday">{day.weekday}</span>
					<span class="number">{day.dayOfMonth}</span>
				</span>
				<span class="meal" class:free={!day.meal}>{day.meal?.name ?? 'Free'}</span>
				<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
			</button>
		{/each}
	</RowGroup>
</BottomSheet>

<style>
	.day {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 13px 16px;
		color: var(--text-5);
		text-align: left;
	}

	.day:active {
		background: var(--sunken-2);
	}

	.when {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex: none;
		width: 62px;
	}

	.weekday {
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 600;
		color: var(--text-4);
	}

	.number {
		font-size: 14px;
		font-weight: 700;
		color: var(--ink);
	}

	.today .weekday,
	.today .number {
		color: var(--sage);
	}

	.meal {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.free {
		font-weight: 400;
		color: var(--text-disabled);
	}
</style>
