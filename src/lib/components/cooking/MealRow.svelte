<!--
	One day of the week's plan [04]: every meal it holds, a row each, under its
	weekday.

	**Nothing is summarised.** A day with three meals draws three rows, indented
	under its weekday, so there is no notation to learn and no count to decode;
	the row says the meal's name, which meal of the day it is, and who cooks
	(the avatar).

	**One row, one target, one action.** The whole row — edge to edge, however
	long the name grows — opens that meal's sheet (`MealActionsSheet`), which
	writes out everything you can do with it: show the recipe, start cooking,
	change it, remove it, add another meal to the day. Until #132 the row
	carried two actions told apart by where you tapped, and a name long enough
	to fill the line swallowed the one that wasn't written anywhere.
	A day with nothing planned has exactly one thing to offer, so its row skips
	the sheet and opens the plan sheet [3d] itself.

	The slot tag follows the rule DECISIONS #126 set for the old meta line: it
	appears on every meal of a day that says something a lone dinner doesn't, so
	the ordinary week stays a column of bare names — and DECISIONS #129 is why
	the day's meta line became that tag and an avatar.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import type { PlannedMeal, WeekDay } from '$lib/server/services/meals';
	import Plus from '@lucide/svelte/icons/plus';

	type Props = {
		day: WeekDay;
		/** Tapped one of the day's meals — the actions sheet opens on it. */
		onmeal: (meal: PlannedMeal) => void;
		/** Tapped a day with nothing on it — straight to the plan sheet. */
		onadd: () => void;
	};

	let { day, onmeal, onadd }: Props = $props();

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

<li class="day" class:today={day.isToday}>
	{#each day.meals as planned, index (planned.id)}
		<button type="button" class="row" onclick={() => onmeal(planned)}>
			<!-- Written once per day, on its first row — the indent is what says the
				 rows below belong to it. Which is exactly why every row still names
				 its day *out loud*: a screen reader reads them one at a time. -->
			<span class="weekday" aria-hidden="true">{index === 0 ? day.weekday : ''}</span>
			<span class="sr-only">{m.cooking.week.dayLabel(weekday, day.dayOfMonth)}</span>

			<span class="body">
				<span class="name">{planned.name}</span>
				{#if tagged}<span class="slot">{m.cooking.slots[planned.slot]}</span>{/if}
			</span>

			{#if planned.cook}
				<!-- The cook is an avatar, and an avatar is decorative — so the one
					 thing the row says out loud that it doesn't write out goes here. -->
				<span class="sr-only">{m.cooking.week.cookedBy(planned.cook.displayName)}</span>
				<Avatar name={planned.cook.displayName} color={planned.cook.color} size={20} />
			{/if}
		</button>
	{:else}
		<button
			type="button"
			class="row"
			onclick={onadd}
			aria-label={m.cooking.week.planDay(weekday, day.dayOfMonth)}
		>
			<span class="weekday" aria-hidden="true">{day.weekday}</span>
			<span class="nothing">{m.cooking.week.nothingPlanned}</span>
			<span class="plus" aria-hidden="true"><Plus size={16} strokeWidth={2.2} /></span>
		</button>
	{/each}
</li>

<style>
	/* Holds the rows' `sr-only` spans, which are taken out of the flow. */
	.day {
		position: relative;
	}

	/* Sage is this app's "selected" row, and with no day held open any more it
	   is free to mark the day you're on — which is where it sat by default
	   anyway (→ DECISIONS #132). Next week has no today and no tint. */
	.today {
		background: var(--sage-row);
	}

	/* Every meal is a row and every row is divided the same way, so a day reads
	   as a group by its indent rather than by a heavier rule. */
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 14px 14px 14px 0;
		border-top: 1px solid var(--divider);
		color: inherit;
		text-align: left;
	}

	.day:first-child .row:first-child {
		border-top: none;
	}

	.row:active {
		background: var(--sunken-2);
	}

	/* The card clips its rows (rounded corners), so app.css's 2px *outside* the
	   button leaves a keyboard ring with only its top and bottom edges showing.
	   Drawn inside the row it's a whole rectangle again. */
	.row:focus-visible {
		outline-offset: -2px;
	}

	/* Wide enough for "WED" once the type scale is on it (→ app.css `--fs`, and
	   DECISIONS #125), and empty on a day's second and third meal. */
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

	/* A name too long for the line wraps and the tag follows it down: this wraps
	   rather than truncates, because the meal is the one thing here that must
	   never be half-read — and now that the row is one target end to end, a name
	   that fills it costs nothing. */
	.body {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 5px 9px;
		min-width: 0;
		margin-right: auto;
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

	/* An empty day is the one row whose action isn't written on it, so it wears
	   the sign of the one thing it does. */
	.plus {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		color: var(--text-4);
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
