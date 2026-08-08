<!--
	A recipe in the library: photo (or placeholder art), name, and how long it
	takes next to when it was added [04]. Used two-up under "Recently added" and
	in the browse-all grid, which is the same card in a wider column.
-->
<script lang="ts">
	import RecipeImage from '$lib/components/cooking/RecipeImage.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeSummary } from '$lib/server/services/recipes';
	import { toCalendarDate, type CalendarDate } from '$lib/utils/dates';

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
		<span class="photo"><RecipeImage imagePath={recipe.imagePath} /></span>
		<span class="body">
			<span class="name">{recipe.name}</span>
			<span class="meta">{meta}</span>
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
		display: block;
		height: 78px;
	}

	.body {
		display: block;
		padding: 10px 12px 12px;
	}

	/* Body font, not Fraunces: [04] draws these titles at 13.5px, where the
	   display face turns cramped and the card stops reading as a list item. */
	.name {
		display: block;
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.meta {
		display: block;
		margin-top: 3px;
		font-size: calc(11.5px * var(--fs));
		color: var(--text-4);
	}
</style>
