<!--
	One day of the week's plan [04]: what's for dinner, who's cooking, and a
	dashed placeholder when nobody has decided yet.

	Where a tap goes follows SPEC §4.1 — a planned recipe opens the recipe, a
	free-text meal (which has nothing to open) opens the plan sheet prefilled,
	and an empty day opens it blank. Changing or removing a planned recipe is the
	trailing ••• , because the row itself is already the way to the recipe and
	the design's "long-press" isn't a gesture a browser can hear reliably.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import type { WeekDay } from '$lib/server/services/meals';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Plus from '@lucide/svelte/icons/plus';

	type Props = {
		day: WeekDay;
		/** Opens the plan sheet for this day — blank, or prefilled if planned. */
		onplan: () => void;
	};

	let { day, onplan }: Props = $props();

	const m = messages();

	const meal = $derived(day.meal);
	/** "Thursday", not the row's "THU" — a screen reader spells that one out. */
	const weekday = $derived(m.date.weekdayLong(day.date));
	/** "Tonight · Elisabeth" today, "Elisabeth cooks" any other day. */
	const cookLine = $derived(
		day.isToday
			? meal?.cook
				? m.cooking.week.tonightWith(meal.cook.displayName)
				: m.cooking.week.tonight
			: meal?.cook
				? m.cooking.week.cooks(meal.cook.displayName)
				: null
	);
</script>

<li class="row" class:today={day.isToday}>
	<span class="weekday" aria-hidden="true">{day.weekday}</span>

	{#if meal}
		{#if meal.recipeId}
			<a class="body" href="/cooking/recipes/{meal.recipeId}">
				<span class="name">{meal.name}</span>
				{#if cookLine}<span class="cook">{cookLine}</span>{/if}
			</a>
		{:else}
			<button type="button" class="body" onclick={onplan}>
				<span class="name">{meal.name}</span>
				{#if cookLine}<span class="cook">{cookLine}</span>{/if}
			</button>
		{/if}

		{#if meal.cook}
			<Avatar name={meal.cook.displayName} color={meal.cook.color} size={20} />
		{/if}

		<button
			type="button"
			class="more"
			onclick={onplan}
			aria-label={m.cooking.week.changeMeal(weekday)}
		>
			<MoreHorizontal size={16} strokeWidth={2.2} />
		</button>
	{:else}
		<!-- The weekday beside it is decorative, so the day goes in the label:
			 seven identical "Add a meal" buttons would otherwise be read out. -->
		<button
			type="button"
			class="body empty"
			onclick={onplan}
			aria-label={m.cooking.week.addMealOn(weekday, day.dayOfMonth)}
		>
			<span class="add">{m.cooking.week.addMeal}</span>
			<span class="tile" aria-hidden="true"><Plus size={13} strokeWidth={2} /></span>
		</button>
	{/if}
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-right: 14px;
		border-top: 1px solid var(--divider);
	}

	.row:first-child {
		border-top: none;
	}

	.today {
		background: var(--sage-row);
	}

	.weekday {
		flex: none;
		width: 34px;
		padding-left: 14px;
		font-family: var(--font-display);
		font-size: 11px;
		font-weight: 600;
		color: var(--text-4);
	}

	.today .weekday {
		font-weight: 700;
		color: var(--sage);
	}

	/* The row's own tap target: full height, so 44px is real at 11px padding. */
	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		min-width: 0;
		padding: 11px 0;
		color: inherit;
		text-align: left;
	}

	.empty {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.name {
		font-size: 14px;
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.cook {
		font-size: 11.5px;
		color: var(--text-4);
	}

	.today .cook {
		font-weight: 600;
		color: var(--sage);
	}

	.add {
		font-size: 13.5px;
		font-weight: 500;
		color: var(--text-disabled);
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 24px;
		height: 24px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: 8px;
		color: var(--text-disabled);
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		color: var(--text-5);
	}

	.more:active,
	.body:active {
		background: var(--sunken);
	}
</style>
