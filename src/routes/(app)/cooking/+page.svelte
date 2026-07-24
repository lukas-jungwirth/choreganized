<!--
	Cooking [04] — the week's dinners and the door to the recipe library.

	One card, seven rows, one dinner slot per day (→ SPEC §4.1). Tapping a day
	raises the plan sheet [3d]; tapping a planned recipe opens the recipe. The
	sheet is mounted per opening, which is what resets its form.
-->
<script lang="ts">
	import MealPlanSheet from '$lib/components/cooking/MealPlanSheet.svelte';
	import MealRow from '$lib/components/cooking/MealRow.svelte';
	import RecipeCard from '$lib/components/cooking/RecipeCard.svelte';
	import ShoppingResultBanner from '$lib/components/cooking/ShoppingResultBanner.svelte';
	import WeekStrip from '$lib/components/cooking/WeekStrip.svelte';
	import ChefHatIcon from '$lib/components/icons/ChefHatIcon.svelte';
	import PageHeader from '$lib/components/shell/PageHeader.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { CalendarDate } from '$lib/utils/dates';
	import Plus from '@lucide/svelte/icons/plus';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	/** How many library cards the tab shows before "Browse all" takes over [04]. */
	const RECENT = 2;

	/** The day the plan sheet is open on. Null = closed. */
	let planning = $state<CalendarDate | null>(null);

	const recent = $derived(data.recipes.slice(0, RECENT));
	const day = $derived(data.week.days.find((entry) => entry.date === planning) ?? null);

	/** What the last plan did to the shopping list — the only trace it leaves. */
	const shopping = $derived(form && 'shopping' in form ? form.shopping : null);
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.cooking.title)}</title>
</svelte:head>

<PageHeader title={m.cooking.thisWeek} meta={data.week.monthLabel} />

<WeekStrip days={data.week.days} />

<ShoppingResultBanner result={shopping} />

<Card>
	<ul class="days">
		{#each data.week.days as entry (entry.date)}
			<MealRow day={entry} onplan={() => (planning = entry.date)} />
		{/each}
	</ul>
</Card>

<section class="library">
	<div class="head">
		<h2>{m.cooking.library.title}</h2>
		{#if data.recipes.length > 0}
			<a href="/cooking/recipes">{m.cooking.library.browseAll(data.recipes.length)}</a>
		{/if}
	</div>

	{#if recent.length > 0}
		<p class="micro">{m.cooking.library.recentlyAdded}</p>
		<div class="cards">
			{#each recent as recipe (recipe.id)}
				<RecipeCard {recipe} today={data.today} timezone={data.household.timezone} />
			{/each}
		</div>
	{:else}
		<a class="first" href="/cooking/recipes/new">
			<span class="well" aria-hidden="true"><ChefHatIcon size={22} strokeWidth={1.7} /></span>
			<span class="first-text">
				<span class="first-title">{m.cooking.library.firstTitle}</span>
				<span class="first-sub">{m.cooking.library.firstSub}</span>
			</span>
			<span class="first-add" aria-hidden="true"><Plus size={16} strokeWidth={2.4} /></span>
		</a>
	{/if}
</section>

{#if day}
	<MealPlanSheet
		date={day.date}
		meal={day.meal}
		recipes={data.recipes}
		members={data.members}
		onclose={() => (planning = null)}
	/>
{/if}

<style>
	.days {
		overflow: hidden;
		border-radius: inherit;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.library {
		margin-top: 22px;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin: 0 2px 12px;
	}

	h2 {
		font-size: 19px;
	}

	.head a {
		flex: none;
		font-size: 13px;
		font-weight: 600;
	}

	.micro {
		margin: 0 4px 10px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.first {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-card-lg);
		color: inherit;
	}

	.well {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: 14px;
		background: var(--sage-tint);
		color: var(--sage);
	}

	.first-text {
		flex: 1;
		min-width: 0;
	}

	.first-title {
		display: block;
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 600;
	}

	.first-sub {
		display: block;
		margin-top: 2px;
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--text-4);
	}

	.first-add {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 9px;
		background: var(--sage);
		color: var(--on-sage);
	}
</style>
