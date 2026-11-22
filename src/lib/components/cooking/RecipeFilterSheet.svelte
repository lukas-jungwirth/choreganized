<!--
	"Filter recipes" — the library's sheet (→ plan 40, sketch phone 2).

	It edits a draft of the filter the URL holds and counts it as you tap, with
	the same function the server filtered the grid with, against the searched
	library the load sent along. **Show** navigates to the draft's address, so
	the sheet never filters anything itself: the grid always comes from the URL.

	A group no recipe in the library uses isn't drawn (→ `recipeFacets`): a
	household that never tags gets time and sort, not four empty questions.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { messages } from '$lib/i18n';
	import { MEAL_SLOTS } from '$lib/utils/meals';
	import {
		emptyFilter,
		matchesRecipeFilter,
		recipeFilterHref,
		RECIPE_SORTS,
		TIME_CAPS,
		type FilterableRecipe,
		type RecipeFacets,
		type RecipeFilter,
		type TimeCap
	} from '$lib/utils/recipe-filter';
	import { RECIPE_DIETS, RECIPE_FREE_FROM, RECIPE_KINDS } from '$lib/utils/recipe-tags';
	import Heart from '@lucide/svelte/icons/heart';
	import { untrack } from 'svelte';

	type Props = {
		open: boolean;
		/** The filter the URL holds now — the draft starts from it each time. */
		filter: RecipeFilter;
		/** The search beside it, which the sheet keeps. */
		search: string;
		/** The searched library, unfiltered — what the button counts. */
		index: FilterableRecipe[];
		facets: RecipeFacets;
	};

	let { open = $bindable(), filter, search, index, facets }: Props = $props();

	const m = messages();
	/** Each group is named by its heading, so ids must be unique per mounted copy. */
	const uid = $props.id();

	let draft = $state<RecipeFilter>(untrack(() => structuredClone($state.snapshot(filter))));

	// Each opening starts from what the URL says, not from an abandoned draft.
	$effect(() => {
		if (open) untrack(() => (draft = structuredClone($state.snapshot(filter))));
	});

	const count = $derived(index.filter((recipe) => matchesRecipeFilter(recipe, draft)).length);

	/**
	 * A group shows when the library uses it — or when the URL already set it
	 * (an old link, a household that untagged since), so a filter that's on can
	 * always be seen and taken off here.
	 */
	const show = $derived({
		favourites: facets.favourites || draft.favourites,
		meals: facets.meals || draft.meals.length > 0,
		kinds: facets.kinds || draft.kinds.length > 0,
		diets: facets.diets || draft.diets.length > 0,
		free: facets.free || draft.free.length > 0,
		time: facets.time || draft.max !== null
	});

	/** The segmented control speaks strings; "" is Any. */
	const readTime = () => (draft.max ? String(draft.max) : '');
	const writeTime = (value: string) => (draft.max = value ? (Number(value) as TimeCap) : null);

	function toggle<T extends string>(list: T[], value: T): T[] {
		return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
	}

	async function apply() {
		open = false;
		await goto(recipeFilterHref(draft, search), { noScroll: true });
	}
</script>

<BottomSheet bind:open title={m.cooking.filters.sheet.title}>
	<div class="groups">
		{#if show.favourites}
			<div class="group pref">
				<Heart size={18} strokeWidth={0} fill="currentColor" aria-hidden="true" class="heart" />
				<span class="pref-text">
					<span class="pref-title">{m.cooking.filters.sheet.onlyFavourites}</span>
					<span class="pref-note">{m.cooking.filters.sheet.hearted(facets.hearted)}</span>
				</span>
				<Toggle bind:checked={draft.favourites} label={m.cooking.filters.sheet.onlyFavourites} />
			</div>
		{/if}

		{#if show.meals}
			<div class="group" role="group" aria-labelledby="{uid}-1">
				<p class="legend" id="{uid}-1">
					<span>{m.cooking.tags.meal}</span><small>{m.cooking.filters.sheet.anyOf}</small>
				</p>
				<div class="chips">
					{#each MEAL_SLOTS as meal (meal)}
						<Chip
							selected={draft.meals.includes(meal)}
							onclick={() => (draft.meals = toggle(draft.meals, meal))}
						>
							{m.cooking.slots[meal]}
						</Chip>
					{/each}
				</div>
			</div>
		{/if}

		{#if show.kinds}
			<div class="group" role="group" aria-labelledby="{uid}-2">
				<p class="legend" id="{uid}-2">
					<span>{m.cooking.tags.kind}</span><small>{m.cooking.filters.sheet.anyOf}</small>
				</p>
				<div class="chips">
					{#each RECIPE_KINDS as kind (kind)}
						<Chip
							selected={draft.kinds.includes(kind)}
							onclick={() => (draft.kinds = toggle(draft.kinds, kind))}
						>
							{m.cooking.tags.kinds[kind]}
						</Chip>
					{/each}
				</div>
			</div>
		{/if}

		{#if show.diets}
			<div class="group" role="group" aria-labelledby="{uid}-3">
				<p class="legend" id="{uid}-3">
					<span>{m.cooking.tags.diet}</span>
					<small>{m.cooking.filters.sheet.vegetarianIncludesVegan}</small>
				</p>
				<div class="chips">
					{#each RECIPE_DIETS as diet (diet)}
						<Chip
							selected={draft.diets.includes(diet)}
							onclick={() => (draft.diets = toggle(draft.diets, diet))}
						>
							{m.cooking.tags.diets[diet]}
						</Chip>
					{/each}
				</div>
			</div>
		{/if}

		{#if show.free}
			<div class="group" role="group" aria-labelledby="{uid}-4">
				<p class="legend" id="{uid}-4">
					<span>{m.cooking.tags.free}</span><small>{m.cooking.filters.sheet.allOf}</small>
				</p>
				<div class="chips">
					{#each RECIPE_FREE_FROM as free (free)}
						<Chip
							selected={draft.free.includes(free)}
							onclick={() => (draft.free = toggle(draft.free, free))}
						>
							{m.cooking.tags.freeFrom[free]}
						</Chip>
					{/each}
				</div>
			</div>
		{/if}

		{#if show.time}
			<div class="group">
				<p class="legend">
					<span>{m.cooking.filters.sheet.readyIn}</span><small
						>{m.cooking.filters.sheet.atMost}</small
					>
				</p>
				<SegmentedControl
					label={m.cooking.filters.sheet.readyIn}
					bind:value={readTime, writeTime}
					options={[
						{ value: '', label: m.cooking.filters.sheet.any },
						...TIME_CAPS.map((cap) => ({ value: String(cap), label: String(cap) }))
					]}
				/>
			</div>
		{/if}

		<div class="group" role="group" aria-labelledby="{uid}-5">
			<p class="legend" id="{uid}-5"><span>{m.cooking.filters.sheet.sortBy}</span></p>
			<div class="chips">
				{#each RECIPE_SORTS as sort (sort)}
					<Chip selected={draft.sort === sort} onclick={() => (draft.sort = sort)}>
						{m.cooking.filters.sorts[sort]}
					</Chip>
				{/each}
			</div>
		</div>
	</div>

	{#snippet footer()}
		<div class="foot">
			<button
				type="button"
				class="reset"
				onclick={() => (draft = { ...emptyFilter(), sort: draft.sort })}
			>
				{m.cooking.filters.sheet.clearAll}
			</button>
			<Button disabled={count === 0} onclick={apply}>
				{count === 0 ? m.cooking.filters.sheet.nothingFits : m.cooking.filters.sheet.show(count)}
			</Button>
		</div>
	{/snippet}
</BottomSheet>

<style>
	.groups {
		display: flex;
		flex-direction: column;
	}

	.group {
		margin: 0;
		padding: 14px 0 16px;
		border: 0;
		border-top: 1px solid var(--divider-sheet);
		min-width: 0;
	}

	.group:first-child {
		border-top: 0;
		padding-top: 4px;
	}

	.legend {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		width: 100%;
		margin: 0 0 10px;
		padding: 0;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-4);
	}

	.legend small {
		font-size: var(--fs-13);
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text-5);
		text-align: right;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.pref {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.pref :global(.heart) {
		flex: none;
		color: var(--heart);
	}

	.pref-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.pref-title {
		font-size: var(--fs-16);
		font-weight: 600;
	}

	.pref-note {
		font-size: var(--fs-13);
		color: var(--text-4);
	}

	/* The count is the point of the sheet, so it stays in sight (the sheet's
	   footer) while the groups above it scroll. */
	.foot {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.foot :global(.button) {
		flex: 1;
	}

	.reset {
		padding: 12px 8px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--text-2);
	}
</style>
