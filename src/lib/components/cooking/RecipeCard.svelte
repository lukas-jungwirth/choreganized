<!--
	A recipe in the library: photo (or placeholder art), name, and how long it
	takes next to when it was added [04]. Used two-up under "Recently added" and
	in the browse-all grid, which is the same card in a wider column.

	Two small marks ride on the photo (→ plan 40): a filled heart for a
	favourite, a leaf for a meat-free recipe. Nothing else on the card changes.
-->
<script lang="ts">
	import RecipeImage from '$lib/components/cooking/RecipeImage.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeSummary } from '$lib/server/services/recipes';
	import { toCalendarDate, type CalendarDate } from '$lib/utils/dates';
	import { isMeatFree } from '$lib/utils/recipe-tags';
	import Heart from '@lucide/svelte/icons/heart';
	import Leaf from '@lucide/svelte/icons/leaf';

	type Props = {
		recipe: RecipeSummary;
		/** Household-local today — decides whether the year is worth printing. */
		today: CalendarDate;
		/** The household's zone: "added Jul 12" is a calendar day, not an instant. */
		timezone: string;
	};

	let { recipe, today, timezone }: Props = $props();

	const m = messages();

	const meta = $derived(
		[
			recipe.timeMinutes ? m.cooking.cookTime(recipe.timeMinutes) : null,
			m.cooking.library.addedOn(addedOn(recipe.createdAt))
		]
			.filter(Boolean)
			.join(' · ')
	);

	/** The photo's marks in words, for a screen reader. */
	const marks = $derived(
		[
			recipe.favourite ? m.cooking.recipe.favourite : null,
			recipe.diet && isMeatFree(recipe.diet) ? m.cooking.tags.diets[recipe.diet] : null
		]
			.filter(Boolean)
			.join(', ')
	);

	/**
	 * `Intl` with an explicit zone, rather than the browser's own — the same
	 * string on the server and after hydration, and the day the household would
	 * say it was.
	 */
	function addedOn(createdAt: number): string {
		return m.date.shortAuto(toCalendarDate(new Date(createdAt), timezone), today);
	}
</script>

<Card href="/cooking/recipes/{recipe.id}" radius="md">
	<span class="inner">
		<span class="photo">
			<RecipeImage imagePath={recipe.imagePath} />
			<!-- Drawn here, said after the name: a screen reader hears "Shakshuka,
				 30 min, favourite, vegetarian", not the marks first. -->
			{#if recipe.favourite || isMeatFree(recipe.diet)}
				<span class="marks" aria-hidden="true">
					{#if recipe.favourite}
						<span class="mark heart"><Heart size={12} strokeWidth={0} fill="currentColor" /></span>
					{/if}
					{#if isMeatFree(recipe.diet)}
						<span class="mark leaf"><Leaf size={12} strokeWidth={2.4} /></span>
					{/if}
				</span>
			{/if}
		</span>
		<span class="body">
			<span class="name">{recipe.name}</span>
			<span class="meta">{meta}</span>
			{#if marks}<span class="sr-only">, {marks}</span>{/if}
		</span>
	</span>
</Card>

<style>
	.inner {
		display: block;
		overflow: hidden;
		border-radius: inherit;
	}

	.photo {
		position: relative;
		display: block;
		height: 78px;
	}

	.marks {
		position: absolute;
		top: 7px;
		right: 7px;
		display: flex;
		gap: 4px;
	}

	/* Frosted, like the recipe view's buttons: they sit on a photo nobody chose
	   for contrast. */
	.mark {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--tabbar-bg);
		backdrop-filter: blur(6px);
	}

	.heart {
		color: var(--heart);
	}

	.leaf {
		color: var(--sage);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.body {
		display: block;
		padding: 10px 12px 12px;
	}

	/* Body font, not Fraunces: [04] draws these titles at 13.5px, where the
	   display face turns cramped and the card stops reading as a list item. */
	.name {
		display: block;
		font-size: var(--fs-15);
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.meta {
		display: block;
		margin-top: 3px;
		font-size: var(--fs-13);
		color: var(--text-4);
	}
</style>
