<!--
	One day of the week's plan [04]: what's being eaten, who's cooking, and a
	dashed placeholder when nobody has decided yet.

	A day holds up to four meals now (→ DECISIONS #126), so the row is a *stack*
	rather than a line — but a day with nothing but a dinner on it draws exactly
	what it drew before: no slot label, no extra affordance, one line. The label
	appears the moment a day says something a lone dinner doesn't ("Lunch", or a
	"Breakfast" beside a "Dinner"), and the quiet **Add another** row only exists
	on days that already hold something, so the seven-row card stays a week you
	can read at a glance rather than a form.

	Where a tap goes follows SPEC §4.1 — a planned recipe opens the recipe, a
	free-text meal (which has nothing to open) opens the plan sheet prefilled,
	and an empty day opens it blank. Changing or removing a planned recipe is the
	trailing ••• , because the row itself is already the way to the recipe and
	the design's "long-press" isn't a gesture a browser can hear reliably.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import type { PlannedMeal, WeekDay } from '$lib/server/services/meals';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Plus from '@lucide/svelte/icons/plus';

	type Props = {
		day: WeekDay;
		/**
		 * Opens the plan sheet for this day — on one of its meals, or blank
		 * (null) on whichever slot the day still has free.
		 */
		onplan: (meal: PlannedMeal | null) => void;
	};

	let { day, onplan }: Props = $props();

	const m = messages();

	/** "Thursday", not the row's "THU" — a screen reader spells that one out. */
	const weekday = $derived(m.date.weekdayLong(day.date));

	/**
	 * The lone dinner *is* the day, so it goes unlabelled; anything else says
	 * which meal it is. Decided per day rather than per meal, so a Saturday
	 * that gained a breakfast labels both of its rows, not just the new one.
	 */
	const labelled = $derived(!(day.meals.length === 1 && day.meals[0].slot === 'dinner'));

	function meta(meal: PlannedMeal): string | null {
		return m.cooking.week.mealMeta(
			labelled ? m.cooking.slots[meal.slot] : null,
			meal.cook?.displayName ?? null,
			day.isToday && meal.slot === 'dinner'
		);
	}
</script>

<li class="row" class:today={day.isToday}>
	<span class="weekday" aria-hidden="true">{day.weekday}</span>

	<div class="stack">
		{#each day.meals as meal (meal.id)}
			{@const line = meta(meal)}
			<div class="meal">
				{#if meal.recipeId}
					<a class="body" href="/cooking/recipes/{meal.recipeId}">
						<span class="name">{meal.name}</span>
						{#if line}<span class="cook">{line}</span>{/if}
					</a>
				{:else}
					<button type="button" class="body" onclick={() => onplan(meal)}>
						<span class="name">{meal.name}</span>
						{#if line}<span class="cook">{line}</span>{/if}
					</button>
				{/if}

				{#if meal.cook}
					<Avatar name={meal.cook.displayName} color={meal.cook.color} size={20} />
				{/if}

				<button
					type="button"
					class="more"
					onclick={() => onplan(meal)}
					aria-label={m.cooking.week.changeMeal(meal.name, weekday)}
				>
					<MoreHorizontal size={16} strokeWidth={2.2} />
				</button>
			</div>
		{/each}

		{#if day.meals.length > 0}
			<button
				type="button"
				class="another"
				onclick={() => onplan(null)}
				aria-label={m.cooking.week.addAnotherOn(weekday)}
			>
				<span class="tile small" aria-hidden="true"><Plus size={11} strokeWidth={2.2} /></span>
				<span class="another-text">{m.cooking.week.addAnother}</span>
			</button>
		{:else}
			<!-- The weekday beside it is decorative, so the day goes in the label:
				 seven identical "Add a meal" buttons would otherwise be read out. -->
			<button
				type="button"
				class="body empty"
				onclick={() => onplan(null)}
				aria-label={m.cooking.week.addMealOn(weekday, day.dayOfMonth)}
			>
				<span class="add">{m.cooking.week.addMeal}</span>
				<span class="tile" aria-hidden="true"><Plus size={13} strokeWidth={2} /></span>
			</button>
		{/if}
	</div>
</li>

<style>
	.row {
		display: flex;
		align-items: flex-start;
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

	/* Wide enough for "WED" once the type scale is on it (→ app.css, `--fs`),
	   and aligned with the first meal's name rather than with the middle of a
	   stack that may be three deep. */
	.weekday {
		flex: none;
		width: 38px;
		padding: 14px 0 0 14px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	.today .weekday {
		font-weight: 700;
		color: var(--sage);
	}

	.stack {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	.meal {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	/* Two meals on one day are two lines, and a hairline between them is what
	   says they're separate — it stops short of the weekday column, so it reads
	   as "inside Saturday" rather than as another day. */
	.meal + .meal {
		border-top: 1px solid var(--divider);
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
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.cook {
		font-size: calc(11.5px * var(--fs));
		color: var(--text-4);
	}

	.today .cook {
		font-weight: 600;
		color: var(--sage);
	}

	.add {
		font-size: calc(13.5px * var(--fs));
		font-weight: 500;
		color: var(--text-disabled);
	}

	/* The same dashed invitation as an empty day, shrunk to a footnote: it is
	   the rarer of the two and must not compete with the meals above it. */
	.another {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 6px 0 11px;
		color: var(--text-disabled);
	}

	.another-text {
		font-size: calc(12px * var(--fs));
		font-weight: 500;
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

	.small {
		width: 20px;
		height: 20px;
		border-radius: 7px;
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
	.another:active,
	.body:active {
		background: var(--sunken);
	}
</style>
