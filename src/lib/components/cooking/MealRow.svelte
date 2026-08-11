<!--
	One day of the week's plan [04]: every meal it holds, a row each, and — on
	the one day the card has open — the bar that adds to it or changes it.

	**Nothing is summarised.** A day with three meals draws three rows, indented
	under its weekday, so there is no notation to learn and no count to decode;
	the row says the meal's name, which meal of the day it is, and who cooks
	(the avatar). Opening a day therefore *adds* the action bar rather than
	unfolding anything, and the rows above it never move — the list you tapped
	is the list you're looking at.

	The whole day is its own tap target, sitting behind its rows, because the
	names themselves already lead somewhere: a planned recipe opens the recipe,
	a free-text meal (which has nothing to open) opens the plan sheet prefilled
	(→ SPEC §4.1). Changing or removing what's already there is the bar's ••• —
	the design's "long-press" isn't a gesture a browser can hear reliably.

	The slot tag follows the rule DECISIONS #126 set for the old meta line: it
	appears on every meal of a day that says something a lone dinner doesn't, so
	the ordinary week stays a column of bare names — and DECISIONS #129 is why
	the day's meta line became that tag and an avatar.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import type { PlannedMeal, WeekDay } from '$lib/server/services/meals';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Plus from '@lucide/svelte/icons/plus';

	type Props = {
		day: WeekDay;
		/** The card holds one day open at a time — this is that day. */
		open: boolean;
		/** Open this day, which is what puts the action bar under its meals. */
		onopen: () => void;
		/**
		 * Opens the plan sheet for this day — on one of its meals, or blank
		 * (null) on whichever slot the day still has free.
		 */
		onplan: (meal: PlannedMeal | null) => void;
		/** The bar's ••• : change what this day already holds. */
		onmore: () => void;
	};

	let { day, open, onopen, onplan, onmore }: Props = $props();

	const m = messages();

	/** "Thursday", not the row's "THU" — a screen reader spells that one out. */
	const weekday = $derived(m.date.weekdayLong(day.date));

	/**
	 * The lone dinner *is* the day, so it goes untagged; anything else says
	 * which meal it is. Decided per day rather than per meal, so a Saturday
	 * that gained a breakfast tags both of its rows, not just the new one.
	 */
	const tagged = $derived(!(day.meals.length === 1 && day.meals[0].slot === 'dinner'));
</script>

{#snippet meal(planned: PlannedMeal)}
	<span class="name">{planned.name}</span>
	{#if tagged}<span class="slot">{m.cooking.slots[planned.slot]}</span>{/if}
	<!-- The cook is an avatar, and an avatar is decorative — so the one thing
		 the row says out loud that it doesn't write out goes here. -->
	{#if planned.cook}<span class="sr-only">{m.cooking.week.cookedBy(planned.cook.displayName)}</span
		>{/if}
{/snippet}

<li class="day" class:open class:today={day.isToday}>
	{#if !open}
		<!-- Behind the rows: the empty space beside a meal name is what opens the
			 day. The weekday beside it is decorative, so seven of these would
			 otherwise be read out alike. -->
		<button
			type="button"
			class="pick"
			onclick={onopen}
			aria-label={m.cooking.week.openDay(weekday, day.dayOfMonth)}
		></button>
	{/if}

	{#each day.meals as planned, index (planned.id)}
		<div class="row">
			<span class="weekday" aria-hidden="true">{index === 0 ? day.weekday : ''}</span>

			{#if planned.recipeId}
				<a class="body" href="/cooking/recipes/{planned.recipeId}">{@render meal(planned)}</a>
			{:else}
				<button type="button" class="body" onclick={() => onplan(planned)}>
					{@render meal(planned)}
				</button>
			{/if}

			{#if planned.cook}
				<Avatar name={planned.cook.displayName} color={planned.cook.color} size={20} />
			{/if}
		</div>
	{:else}
		<div class="row">
			<span class="weekday" aria-hidden="true">{day.weekday}</span>
			<span class="nothing">{m.cooking.week.nothingPlanned}</span>
		</div>
	{/each}

	{#if open}
		<div class="row bar">
			<span class="weekday" aria-hidden="true"></span>

			<button
				type="button"
				class="add"
				onclick={() => onplan(null)}
				aria-label={m.cooking.week.addMealOn(weekday, day.dayOfMonth)}
			>
				<Plus size={15} strokeWidth={2.4} aria-hidden="true" />
				<span>{m.cooking.week.addMeal}</span>
			</button>

			{#if day.meals.length > 0}
				<button
					type="button"
					class="more"
					onclick={onmore}
					aria-label={m.cooking.week.changeMealsOn(weekday)}
				>
					<MoreHorizontal size={16} strokeWidth={2.2} />
				</button>
			{/if}
		</div>
	{/if}
</li>

<style>
	.day {
		position: relative;
	}

	/* The day's own target, under everything the rows put on top of it. */
	.pick {
		position: absolute;
		inset: 0;
		width: 100%;
	}

	/* `--sunken-2`, not `--sunken`: the slot tags are `--sunken`, and a press
	   that swallowed them would read as the row losing its meals. */
	.pick:active {
		background: var(--sunken-2);
	}

	/* The card clips its rows (rounded corners), so app.css's 2px *outside* the
	   button leaves a keyboard ring with only its top and bottom edges showing.
	   Drawn inside the day it's a whole rectangle again. */
	.pick:focus-visible {
		outline-offset: -2px;
	}

	/* Sage is this app's "selected" (→ app.css `--sage-row`). Today keeps its
	   own mark in the weekday and in the strip above, so the two never fight
	   over one surface. */
	.open {
		background: var(--sage-row);
	}

	/* Every meal is a row and every row is divided the same way, so a day reads
	   as a group by its indent rather than by a heavier rule. */
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 14px 14px 0;
		border-top: 1px solid var(--divider);
		/* Everything that isn't a control lets the day's own target through. */
		pointer-events: none;
	}

	.row :is(a, button) {
		pointer-events: auto;
	}

	.day:first-child .row:first-of-type {
		border-top: none;
	}

	/* Wide enough for "WED" once the type scale is on it (→ app.css `--fs`, and
	   DECISIONS #125), and empty on a day's second and third meal — the indent
	   is what says they belong to the weekday above. */
	.weekday {
		flex: none;
		width: 38px;
		padding-left: 14px;
		font-family: var(--font-display);
		font-size: calc(11px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	.today .weekday {
		font-weight: 700;
		color: var(--sage);
	}

	/* The meal's own tap target — as wide as the meal, not as wide as the row,
	   so the space beside it still belongs to the day underneath. A name too
	   long for the line wraps and the tag follows it down: this wraps rather
	   than truncates, because the meal is the one thing here that must never be
	   half-read. */
	.body {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px 9px;
		min-width: 0;
		margin-right: auto;
		color: inherit;
		text-align: left;
	}

	/* Pressing the name flashes the whole row — the same feedback the day's own
	   target gives, so the two never look like different surfaces. */
	.row:has(.body:active) {
		background: var(--sunken-2);
	}

	.name {
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.slot {
		flex: none;
		padding: 3px 8px;
		border-radius: 8px;
		background: var(--sunken);
		font-size: calc(11.5px * var(--fs));
		font-weight: 500;
		line-height: 1.2;
		color: var(--text-4);
	}

	.nothing {
		flex: 1;
		font-size: calc(14px * var(--fs));
		font-weight: 500;
		color: var(--text-disabled);
	}

	/* The only thing opening a day adds. It sits in the meals' column so the
	   rows above it keep their alignment. */
	.bar {
		padding-top: 8px;
		padding-bottom: 8px;
	}

	.add {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 34px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}

	.more {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 34px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--text-4);
	}

	.add:active,
	.more:active {
		background: var(--sunken);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
