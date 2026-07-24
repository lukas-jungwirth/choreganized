<!--
	"Add to plan" from a recipe [7a] asks which day before it can open the plan
	sheet — both plannable weeks, with whatever is already on each day, so
	replacing Thursday's dinner is a decision rather than a surprise.

	Fourteen rows rather than seven, because a recipe you just wrote down is
	exactly the kind of thing you plan for next week (→ DECISIONS #99). Each
	week's group carries its own heading, so a screen reader hears two lists
	instead of fourteen undifferentiated days.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import type { MealWeek } from '$lib/server/services/meals';
	import type { CalendarDate } from '$lib/utils/dates';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	type Props = {
		/** This week and the next: "add to plan" reaches both (→ DECISIONS #99). */
		weeks: MealWeek[];
		onpick: (date: CalendarDate) => void;
		onclose: () => void;
	};

	let { weeks, onpick, onclose }: Props = $props();

	const m = messages();

	const uid = $props.id();

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.cooking.dayPicker.title} eyebrow={m.cooking.dayPicker.eyebrow}>
	{#each weeks as week (week.start)}
		{@const labelId = `${uid}-week-${week.offset}`}
		<section aria-labelledby={labelId}>
			<p class="week" id={labelId}>
				{week.offset === 0 ? m.cooking.weekSwitch.current : m.cooking.weekSwitch.next}
			</p>
			<RowGroup surface="sunken">
				{#each week.days as day (day.date)}
					<!-- The label spells the day out; the row itself abbreviates it to fit. -->
					<button
						type="button"
						class="day"
						class:today={day.isToday}
						aria-label={m.cooking.dayPicker.day(
							m.date.weekdayLong(day.date),
							day.dayOfMonth,
							day.meal?.name ?? m.cooking.dayPicker.freeQuiet
						)}
						onclick={() => onpick(day.date)}
					>
						<span class="when">
							<span class="weekday">{day.weekday}</span>
							<span class="number">{day.dayOfMonth}</span>
						</span>
						<span class="meal" class:free={!day.meal}
							>{day.meal?.name ?? m.cooking.dayPicker.free}</span
						>
						<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
					</button>
				{/each}
			</RowGroup>
		</section>
	{/each}
</BottomSheet>

<style>
	/* The uppercase micro-label the sheets group a list under [3b]. */
	.week {
		margin: 18px 0 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

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
