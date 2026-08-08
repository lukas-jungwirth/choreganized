<!--
	A recipe [7a] — hero photo, what it takes, what's in it, what to do.

	The hero is full-bleed, so it steps back out of the shell's padding; the
	content below rides up over it on a 26px radius, which is the whole trick of
	this screen. Everything else is the app's usual furniture.
-->
<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import DayPickerSheet from '$lib/components/cooking/DayPickerSheet.svelte';
	import IngredientPickSheet from '$lib/components/cooking/IngredientPickSheet.svelte';
	import MealPlanSheet from '$lib/components/cooking/MealPlanSheet.svelte';
	import ServingsField from '$lib/components/cooking/ServingsField.svelte';
	import RecipeImage from '$lib/components/cooking/RecipeImage.svelte';
	import RecipeMenuSheet from '$lib/components/cooking/RecipeMenuSheet.svelte';
	import ShoppingResultBanner from '$lib/components/cooking/ShoppingResultBanner.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { IngredientPick } from '$lib/server/services/recipe-shopping';
	import type { CalendarDate } from '$lib/utils/dates';
	import type { MealSlot } from '$lib/utils/meals';
	import { scaleIngredients, servingsFactor } from '$lib/utils/ingredients';
	import { readServings } from '$lib/utils/recipes';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChefHat from '@lucide/svelte/icons/chef-hat';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Clock from '@lucide/svelte/icons/clock';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Users from '@lucide/svelte/icons/users';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	const recipe = $derived(data.recipe);

	/** Which sheet is up: the day picker, the plan sheet for a day, or the menu. */
	let choosingDay = $state(false);
	/**
	 * The day picked, and the slot on it this recipe would take — always a new
	 * meal from here, on whatever that day still has free, so "add to plan"
	 * never lands on top of a dinner by default (→ `$lib/utils/meals`).
	 */
	let planning = $state<{ date: CalendarDate; slot: MealSlot } | null>(null);
	let menu = $state(false);

	/**
	 * The ingredient picker [3e]. Two ways in: the basket here, which opens on
	 * the reading the load already did, and the plan sheet's toggle, whose
	 * `?/plan` answer carries a picker for whichever recipe *it* chose — not
	 * necessarily this one. Copied out of `form` so closing it sticks.
	 */
	let picking = $state<IngredientPick | null>(null);

	$effect(() => {
		const offered = form && 'pick' in form ? form.pick : null;
		if (offered) untrack(() => (picking = offered));
	});

	/**
	 * How many people this is being read for (→ SPEC §4.5). Read from `?serves=`
	 * once at mount and written back on every step, the same one-way traffic
	 * cook mode's `?step=` runs: `replaceState` keeps the address bar honest
	 * without a round trip, so a reload comes back to the same amounts and
	 * "Start cook mode" carries the choice through the link.
	 *
	 * Null for a recipe that never recorded what it serves — there is nothing to
	 * scale from, so the control doesn't appear.
	 */
	let serves = $state<number | null>(untrack(() => servesFromUrl()));

	/**
	 * The address the bar is *currently* showing. Not `page.url`, which shallow
	 * routing deliberately leaves at whatever the navigation landed on: comparing
	 * against that, stepping 4 → 6 → 4 computes the original address again, skips
	 * the write, and leaves a stale `?serves=6` behind for the next reload to
	 * come back to. Plain `let`, not `$state` — the effect must not depend on it.
	 */
	let written = untrack(() => page.url.href);

	/**
	 * Which recipe the two above were read for. This screen is one component for
	 * every recipe, so a same-route navigation — ••• → Duplicate lands on the copy
	 * through `redirect(303)` — swaps `data.recipe` underneath without a remount,
	 * and the initializers would never run again: the new recipe would inherit the
	 * old one's count and write it onto the old one's address. Cook mode keeps a
	 * `cursorFor` for exactly this reason; the count needs the same.
	 */
	let servesFor = $state(untrack(() => recipe.id));

	$effect(() => {
		const id = recipe.id;
		if (untrack(() => servesFor) === id) return;

		servesFor = id;
		written = page.url.href;
		serves = untrack(() => servesFromUrl());
	});

	/** `?serves=`, else however many the recipe says it was written for. */
	function servesFromUrl(): number | null {
		return readServings(page.url.searchParams.get('serves')) ?? data.recipe.servings;
	}

	const factor = $derived(servingsFactor(recipe.servings, serves ?? 0));
	/** The amounts as this reader needs them — the whole point of the stepper. */
	const ingredients = $derived(scaleIngredients(recipe.ingredients, factor));

	/** Cook mode inherits the count rather than asking again with wet hands. */
	const cookHref = $derived(
		serves !== null && serves !== recipe.servings
			? `/cooking/recipes/${recipe.id}/cook?serves=${serves}`
			: `/cooking/recipes/${recipe.id}/cook`
	);

	/** One `replaceState` per actual change, and none at all on mount. */
	$effect(() => {
		const url = new URL(page.url);
		if (serves !== null && serves !== recipe.servings)
			url.searchParams.set('serves', String(serves));
		else url.searchParams.delete('serves');

		if (url.href === written) return;
		written = url.href;
		replaceState(url, page.state);
	});

	const day = $derived(
		data.plan.weeks.flatMap((week) => week.days).find((entry) => entry.date === planning?.date) ??
			null
	);
	const shopping = $derived(form && 'shopping' in form ? form.shopping : null);

	/** The icon travels with its line, so a recipe missing one still reads right. */
	const meta = $derived(
		[
			{
				icon: Clock,
				text: recipe.timeMinutes ? m.cooking.cookTime(recipe.timeMinutes) : null
			},
			// The count this reader chose, not the one it was written for: the
			// amounts below have already moved, and a meta line still saying
			// "Serves 4" over six people's worth of pasta is the contradiction.
			{ icon: Users, text: recipe.servings ? m.cooking.serves(serves ?? recipe.servings) : null },
			{
				icon: ChefHat,
				text: recipe.createdBy ? m.cooking.recipe.addedBy(recipe.createdBy.displayName) : null
			}
		].filter((entry) => entry.text !== null)
	);
</script>

<svelte:head>
	<title>{recipe.name} · Choreganized</title>
</svelte:head>

<div class="hero">
	<RecipeImage imagePath={recipe.imagePath} stripe={8} eager />
	<div class="bar">
		<a class="round" href="/cooking/recipes" aria-label={m.cooking.recipe.back}>
			<ChevronLeft size={18} strokeWidth={2.4} />
		</a>
		<button
			type="button"
			class="round"
			onclick={() => (menu = true)}
			aria-label={m.cooking.recipe.options}
		>
			<MoreHorizontal size={18} strokeWidth={2.4} />
		</button>
	</div>
</div>

<article class="panel">
	<h1>{recipe.name}</h1>

	{#if meta.length > 0}
		<p class="meta">
			{#each meta as entry (entry.text)}
				{@const Icon = entry.icon}
				<span><Icon size={16} strokeWidth={1.9} aria-hidden="true" />{entry.text}</span>
			{/each}
		</p>
	{/if}

	<div class="actions">
		<button type="button" class="plan" onclick={() => (choosingDay = true)}>
			<CalendarDays size={17} strokeWidth={2.2} aria-hidden="true" />{m.cooking.recipe.addToPlan}
		</button>
		{#if data.pick}
			<button
				type="button"
				class="basket"
				aria-label={m.cooking.recipe.pickForList}
				onclick={() => (picking = data.pick)}
			>
				<BasketIcon size={20} strokeWidth={1.9} />
			</button>
		{/if}
	</div>

	<ShoppingResultBanner result={shopping} />

	{#if recipe.ingredients.length > 0}
		<div class="section-head">
			<h2>{m.cooking.recipe.ingredients}</h2>
			{#if data.pick}
				<button type="button" class="link" onclick={() => (picking = data.pick)}>
					{m.cooking.recipe.addToList}
				</button>
			{/if}
		</div>
		{#if recipe.servings !== null}
			<!-- Narrowed on the field itself rather than on `scalable`, which
				 TypeScript can't see through to know the count is a number here. -->
			<ServingsField bind:value={serves} writtenFor={recipe.servings} />
		{/if}

		<Card radius="md">
			<ul class="ingredients">
				{#each ingredients as ingredient (ingredient.id)}
					{@const amount = m.units.amount(ingredient.quantity, ingredient.unit)}
					<li>
						<span class="dot" aria-hidden="true"></span>
						<span class="ingredient-name">{ingredient.name}</span>
						{#if amount}<span class="amount">{amount}</span>{/if}
					</li>
				{/each}
			</ul>
		</Card>
	{/if}

	{#if recipe.steps.length > 0}
		<h2 class="steps-head">{m.cooking.recipe.steps}</h2>
		<ol class="steps">
			{#each recipe.steps as step, index (step.id)}
				<li>
					<span class="number" aria-hidden="true">{index + 1}</span>
					<span class="step-text">{step.text}</span>
				</li>
			{/each}
		</ol>

		<Button variant="dark" href={cookHref}>
			<ChefHat size={18} strokeWidth={2} />{m.cooking.recipe.startCookMode}
		</Button>
	{:else}
		<p class="no-steps">
			{m.cooking.recipe.noStepsLead}<a href="/cooking/recipes/{recipe.id}/edit"
				>{m.cooking.recipe.noStepsLink}</a
			>{m.cooking.recipe.noStepsRest}
		</p>
	{/if}
</article>

{#if choosingDay}
	<DayPickerSheet
		weeks={data.plan.weeks}
		onclose={() => (choosingDay = false)}
		onpick={(date, slot) => {
			choosingDay = false;
			planning = { date, slot };
		}}
	/>
{/if}

{#if day && planning}
	<MealPlanSheet
		date={day.date}
		meal={null}
		slot={planning.slot}
		dayMeals={day.meals}
		preselectRecipeId={recipe.id}
		recipes={data.recipes}
		members={data.members}
		onclose={() => (planning = null)}
	/>
{/if}

{#if picking}
	<!-- Opened on whatever this screen is showing: the amounts you just decided
		 on are the amounts you're about to buy. A picker raised by the plan sheet
		 is about another recipe entirely, so it opens on that one's own count. -->
	<IngredientPickSheet
		pick={picking}
		cookingFor={picking.recipeId === recipe.id ? serves : null}
		onclose={() => (picking = null)}
	/>
{/if}

{#if menu}
	<RecipeMenuSheet {recipe} onclose={() => (menu = false)} />
{/if}

<style>
	/* Out of the shell's padding on three sides — the design's photo bleeds. */
	.hero {
		position: relative;
		height: 290px;
		margin: calc((8px + env(safe-area-inset-top)) * -1) calc(var(--page-pad) * -1) 0;
		overflow: hidden;
		background: var(--sunken);
	}

	.bar {
		position: absolute;
		top: calc(14px + env(safe-area-inset-top));
		left: var(--page-pad);
		right: var(--page-pad);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	/* Frosted, because it sits on a photograph nobody chose for contrast. */
	.round {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--tabbar-bg);
		backdrop-filter: blur(6px);
		color: var(--ink);
	}

	.panel {
		position: relative;
		margin: -26px calc(var(--page-pad) * -1) 0;
		padding: 24px var(--page-pad) 0;
		border-radius: 26px 26px 0 0;
		background: var(--bg);
	}

	h1 {
		margin-bottom: 12px;
		font-size: calc(27px * var(--fs));
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 18px;
		margin: 0 0 22px;
		font-size: calc(13.5px * var(--fs));
		color: var(--text-2);
	}

	.meta span {
		display: flex;
		align-items: center;
		gap: 7px;
		color: var(--text-4);
	}

	.actions {
		display: flex;
		gap: 10px;
		margin-bottom: 26px;
	}

	.plan {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		flex: 1;
		padding: 14px;
		border-radius: var(--r-input);
		background: var(--sage);
		box-shadow: var(--shadow-button);
		font-size: calc(15px * var(--fs));
		font-weight: 700;
		color: var(--on-sage);
	}

	/* `align-self`, not `height: 100%`: the button is the flex item now that it
	   isn't wrapped in a form, and a percentage height against an auto-height
	   row resolves to auto — which is a basket half the height of "Add to plan". */
	.basket {
		display: flex;
		align-items: center;
		justify-content: center;
		align-self: stretch;
		width: 52px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-input);
		background: var(--card);
		color: var(--sage);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	h2 {
		font-size: calc(18px * var(--fs));
	}

	.link {
		font-size: calc(12.5px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}

	.ingredients {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.ingredients li {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 13px 16px;
	}

	.ingredients li + li {
		border-top: 1px solid var(--divider);
	}

	.dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--border-dashed);
	}

	.ingredient-name {
		flex: 1;
		min-width: 0;
		font-size: calc(14.5px * var(--fs));
		overflow-wrap: anywhere;
	}

	/* Typed as "400 g pasta", read back as "Pasta · 400 g" [7a]. */
	.ingredient-name::first-letter {
		text-transform: uppercase;
	}

	.amount {
		flex: none;
		font-size: calc(13.5px * var(--fs));
		color: var(--text-4);
	}

	.steps-head {
		margin: 26px 0 14px;
	}

	.steps {
		margin: 0 0 24px;
		padding: 0;
		list-style: none;
	}

	.steps li {
		display: flex;
		gap: 13px;
		margin-bottom: 16px;
	}

	.number {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--sage);
		font-size: calc(13px * var(--fs));
		font-weight: 700;
		color: var(--on-sage);
	}

	.step-text {
		flex: 1;
		min-width: 0;
		padding-top: 2px;
		font-size: calc(14.5px * var(--fs));
		line-height: 1.5;
		color: var(--ink);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.no-steps {
		margin: 26px 0 0;
		font-size: calc(14px * var(--fs));
		line-height: 1.5;
		color: var(--text-4);
	}
</style>
