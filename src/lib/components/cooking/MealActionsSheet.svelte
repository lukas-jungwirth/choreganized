<!--
	What do you want to do with this meal? — raised by tapping any planned meal
	in the week [04].

	The week's rows used to carry two actions told apart by *where* you tapped:
	the name went to the recipe, the empty space beside it opened the day. A
	long name left no empty space, and nothing on screen said the two halves of
	one row went to different places (→ DECISIONS #132). Now the row is one
	target and this sheet is what it opens — every way on from a planned meal
	written out, so nothing has to be guessed from geometry.

	The day's own action lives here too: **Add another meal** is offered while
	that day still has a free slot, which is what the open day's bar used to be.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { messages } from '$lib/i18n';
	import type { PlannedMeal, WeekDay } from '$lib/server/services/meals';
	import { MEAL_SLOTS } from '$lib/utils/meals';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import ChefHat from '@lucide/svelte/icons/chef-hat';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type Props = {
		/** The day it sits on — for the eyebrow and for "add another". */
		day: WeekDay;
		meal: PlannedMeal;
		/** Open the plan sheet on this meal. */
		onchange: () => void;
		/** Open it blank, on whatever slot the day still has free. */
		onadd: () => void;
		onclose: () => void;
	};

	let { day, meal, onchange, onadd, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let submitting = $state(false);

	$effect(() => {
		if (!open) onclose();
	});

	/** A day holds one meal per slot, so four is full and there is nothing to add. */
	const dayIsFull = $derived(day.meals.length >= MEAL_SLOTS.length);
</script>

<BottomSheet
	bind:open
	eyebrow="{m.date.weekdayLong(day.date)} · {m.date.short(day.date)}"
	title={meal.name}
	subtitle={m.cooking.slots[meal.slot]}
>
	<RowGroup surface="sunken">
		<!-- A custom meal has no recipe to show and nothing to walk through, so
			 its sheet is the two rows that still mean something. -->
		{#if meal.recipeId}
			<a class="item" href="/cooking/recipes/{meal.recipeId}">
				<BookOpen size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.mealMenu.showRecipe}
			</a>

			<a class="item" href="/cooking/recipes/{meal.recipeId}/cook">
				<ChefHat size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.mealMenu.startCooking}
			</a>
		{/if}

		<button type="button" class="item" onclick={onchange}>
			<Pencil size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.mealMenu.change}
		</button>
	</RowGroup>

	{#if !dayIsFull}
		<div class="second">
			<RowGroup surface="sunken">
				<button type="button" class="item" onclick={onadd}>
					<Plus size={19} strokeWidth={2} aria-hidden="true" />{m.cooking.mealMenu.addAnother(
						m.date.weekdayLong(day.date)
					)}
				</button>
			</RowGroup>
		</div>
	{/if}

	<div class="second">
		<RowGroup surface="sunken">
			<!-- The same `?/remove` the plan sheet posts (→ `lib/server/meal-actions`),
				 two taps earlier. No confirm, for the same reason it has none there:
				 a removed meal is one tap to plan again. -->
			<form
				method="POST"
				action="?/remove"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						submitting = false;
						if (result.type === 'success') open = false;
					};
				}}
			>
				<input type="hidden" name="mealId" value={meal.id} />
				<button type="submit" class="item destructive" disabled={submitting}>
					<Trash2 size={19} strokeWidth={1.8} aria-hidden="true" />{m.cooking.mealMenu.remove}
				</button>
			</form>
		</RowGroup>
	</div>

	<button type="button" class="cancel" onclick={() => (open = false)}>{m.common.cancel}</button>
</BottomSheet>

<style>
	/* The ••• menus' row [7c] — one shape for links and buttons alike. */
	.item {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		padding: 15px 16px;
		font-size: calc(15px * var(--fs));
		font-weight: 500;
		color: var(--text-2);
		text-align: left;
	}

	.item:active {
		background: var(--sunken-2);
	}

	.item:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.destructive {
		color: var(--danger);
	}

	.second {
		margin-top: 14px;
	}

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
