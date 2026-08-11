<!--
	Which meal did you mean? — raised by the open day's ••• [04] when that day
	holds more than one.

	The week's rows lead to recipes, so the ••• is the whole way in to changing
	or removing what's planned, and on a day with a breakfast *and* a dinner it
	cannot know which. A day holding one meal never sees this sheet: the page
	sends the ••• straight to the plan sheet, because asking "which of these
	one?" is a tap that answers itself.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import type { PlannedMeal, WeekDay } from '$lib/server/services/meals';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	type Props = {
		day: WeekDay;
		onpick: (meal: PlannedMeal) => void;
		onclose: () => void;
	};

	let { day, onpick, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet
	bind:open
	title="{m.date.weekdayLong(day.date)} · {m.date.short(day.date)}"
	eyebrow={m.cooking.week.changeEyebrow}
>
	<RowGroup surface="sunken">
		{#each day.meals as meal (meal.id)}
			<button type="button" class="meal" onclick={() => onpick(meal)}>
				<span class="name">{meal.name}</span>
				<span class="slot">{m.cooking.slots[meal.slot]}</span>
				<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
			</button>
		{/each}
	</RowGroup>

	<button type="button" class="cancel" onclick={() => (open = false)}>{m.common.cancel}</button>
</BottomSheet>

<style>
	.meal {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 14px 16px;
		color: var(--text-5);
		text-align: left;
	}

	.meal:active {
		background: var(--sunken-2);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: calc(15px * var(--fs));
		font-weight: 500;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}

	/* The tag the week's rows wear, on the sheet's tint. */
	.slot {
		flex: none;
		padding: 3px 8px;
		border-radius: 8px;
		background: var(--card);
		font-size: calc(11.5px * var(--fs));
		font-weight: 500;
		color: var(--text-4);
	}

	/* The ••• menus' own dismissal [7c] — the same row, in the same place. */
	.cancel {
		width: 100%;
		padding: 15px;
		margin-top: 14px;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: calc(15px * var(--fs));
		font-weight: 700;
		color: var(--text-2);
	}
</style>
