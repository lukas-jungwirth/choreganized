<!--
	Plan a meal [3d] — a recipe from the library or something not saved, who's
	cooking, and whether the ingredients should land on the shopping list.

	Raised from two places (the week [04] and a recipe's "Add to plan" [7a]), so
	it posts to `?/plan` and `?/remove` on whichever page mounted it — both pages
	define those actions over the same service call.

	One dinner per day, so opening it on a planned day prefills it and offers
	**Remove meal**; saving replaces what was there (→ SPEC §4.2).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import SearchField from '$lib/components/ui/SearchField.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import type { HouseholdMember } from '$lib/server/services/household';
	import type { PlannedMeal } from '$lib/server/services/meals';
	import { messages } from '$lib/i18n';
	import type { RecipeSummary } from '$lib/server/services/recipes';
	import type { CalendarDate } from '$lib/utils/dates';
	import { MEAL_TITLE_MAX } from '$lib/utils/recipes';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import RecipeImage from './RecipeImage.svelte';

	type Props = {
		date: CalendarDate;
		/** What's already planned for that day, if anything. */
		meal: PlannedMeal | null;
		/** Opened from a recipe: that recipe wins over what the day already has. */
		preselectRecipeId?: string | null;
		recipes: RecipeSummary[];
		members: HouseholdMember[];
		onclose: () => void;
	};

	let { date, meal, preselectRecipeId = null, recipes, members, onclose }: Props = $props();

	const m = messages();

	/** How many rows the list shows before searching, and while searching. */
	const RECENTS = 4;
	const MATCHES = 8;

	let open = $state(true);

	// Seeded once — from this opening's day — and owned by the form afterwards
	// (the same `untrack` contract as TaskFormSheet).
	let selectedId = $state<string | null>(
		untrack(() => preselectRecipeId ?? meal?.recipeId ?? null)
	);
	// An empty library has nothing to pick, so the sheet opens as the free-text
	// meal it would have to become anyway.
	let custom = $state(
		untrack(() => recipes.length === 0 || (!preselectRecipeId && !!meal && !meal.recipeId))
	);
	let title = $state(untrack(() => (meal?.recipeId ? '' : (meal?.title ?? ''))));
	let cookId = $state<string | null>(untrack(() => meal?.cook?.id ?? null));
	let addToList = $state(true);
	let search = $state('');
	let submitting = $state(false);
	/** This form's own rejection — see TaskFormSheet for why not `$page.form`. */
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});

	const weekday = $derived(m.date.weekdayLong(date));
	const selected = $derived(recipes.find((recipe) => recipe.id === selectedId) ?? null);

	const matches = $derived.by(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return recipes.slice(0, RECENTS);
		return recipes.filter((recipe) => recipe.name.toLowerCase().includes(needle));
	});

	/**
	 * The rows on screen. While searching they are exactly the matches: pinning
	 * the selected recipe to the top there would have to evict one, and evicting
	 * the only match of a one-hit search leaves the thing you searched for
	 * unselectable. Unsearched, the chosen recipe *is* pinned in — a prefilled
	 * sheet whose recipe is older than the four most recent would otherwise look
	 * like nothing was selected.
	 */
	const shown = $derived.by(() => {
		if (search.trim()) return matches.slice(0, MATCHES);
		if (!selected || matches.some((recipe) => recipe.id === selected.id)) return matches;
		return [selected, ...matches.slice(0, -1)];
	});

	const hiddenMatches = $derived(Math.max(matches.length - shown.length, 0));

	/** Only a recipe that has ingredients can put any on the list (→ SPEC §4.2). */
	const offersShopping = $derived(!custom && !!selected?.hasIngredients);

	const uid = $props.id();
	const cooksLabelId = `${uid}-cooks`;

	function pick(recipe: RecipeSummary) {
		selectedId = recipe.id;
		custom = false;
	}
</script>

<BottomSheet bind:open title="{weekday} · {m.date.short(date)}" eyebrow={m.cooking.plan.eyebrow}>
	<form
		method="POST"
		action="?/plan"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<input type="hidden" name="date" value={date} />

		{#if recipes.length > 0}
			<div class="search">
				<SearchField
					label={m.cooking.plan.searchRecipes}
					placeholder={m.cooking.plan.searchRecipes}
					bind:value={search}
				/>
			</div>

			<ul class="recipes" role="radiogroup" aria-label={m.cooking.plan.recipeGroup}>
				{#each shown as recipe (recipe.id)}
					{@const on = !custom && selectedId === recipe.id}
					{@const time = recipe.timeMinutes ? m.cooking.cookTime(recipe.timeMinutes) : null}
					<li>
						<button
							type="button"
							class="recipe"
							class:on
							role="radio"
							aria-checked={on}
							aria-label={recipe.name}
							onclick={() => pick(recipe)}
						>
							<span class="thumb"><RecipeImage imagePath={recipe.imagePath} stripe={5} /></span>
							<span class="text">
								<span class="name">{recipe.name}</span>
								{#if time}<span class="time">{time}</span>{/if}
							</span>
							<span class="radio" aria-hidden="true">
								{#if on}<Check size={12} strokeWidth={3.5} />{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>

			{#if search.trim() && matches.length === 0}
				<p class="note">{m.cooking.plan.noMatch}</p>
			{:else if hiddenMatches > 0}
				<p class="note">{m.cooking.plan.moreMatches(hiddenMatches)}</p>
			{:else if !search.trim() && recipes.length > shown.length}
				<p class="note">{m.cooking.plan.mostRecent(recipes.length - shown.length)}</p>
			{/if}
		{/if}

		{#if custom}
			<div class="custom">
				<TextField
					label={m.cooking.plan.notSaved}
					name="title"
					bind:value={title}
					placeholder={m.cooking.plan.notSavedPlaceholder}
					maxlength={MEAL_TITLE_MAX}
					autocomplete="off"
				/>
			</div>
		{:else}
			<button type="button" class="not-saved" onclick={() => (custom = true)}>
				<Plus size={16} strokeWidth={2.2} />{m.cooking.plan.notSaved}
			</button>
		{/if}

		<input type="hidden" name="recipeId" value={custom ? '' : (selectedId ?? '')} />
		{#if !custom && selected}
			<!-- The chosen recipe's name travels with its id: if a housemate deletes
				 it between opening this sheet and saving, the day still gets the meal
				 it was named after instead of silently getting nothing. -->
			<input type="hidden" name="title" value={selected.name} />
		{/if}

		<p class="label" id={cooksLabelId}>
			{m.cooking.plan.cooking} <span class="optional">{m.cooking.plan.optional}</span>
		</p>
		<div class="chips" role="group" aria-labelledby={cooksLabelId}>
			{#each members as member (member.id)}
				{@const on = cookId === member.id}
				<Chip
					color={member.color}
					selected={on}
					aria-pressed={on}
					onclick={() => (cookId = on ? null : member.id)}
				>
					<Avatar name={member.displayName} color={member.color} size={24} />
					{member.displayName}
				</Chip>
			{/each}
		</div>
		<input type="hidden" name="cookMemberId" value={cookId ?? ''} />

		{#if offersShopping}
			<div class="pref">
				<span class="pref-title">{m.cooking.plan.addIngredients}</span>
				<Toggle
					name="addIngredients"
					bind:checked={addToList}
					label={m.cooking.plan.addIngredients}
				/>
			</div>
		{/if}

		{#if error}<p class="error">{error}</p>{/if}

		<Button type="submit" disabled={submitting || (custom ? !title.trim() : !selectedId)}>
			{m.cooking.plan.addTo(weekday)}
		</Button>
	</form>

	{#if meal}
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
			<input type="hidden" name="date" value={date} />
			<button type="submit" class="remove" disabled={submitting}>{m.cooking.plan.remove}</button>
		</form>
	{/if}
</BottomSheet>

<style>
	.search {
		margin-bottom: 14px;
	}

	.recipes {
		display: flex;
		flex-direction: column;
		gap: 9px;
		margin: 0 0 14px;
		padding: 0;
		list-style: none;
	}

	.recipe {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 9px 12px;
		border: 1.5px solid var(--divider);
		border-radius: 15px;
		background: var(--card);
		text-align: left;
	}

	.recipe.on {
		border-color: var(--sage);
		background: var(--sage-row);
	}

	.thumb {
		display: block;
		flex: none;
		width: 42px;
		height: 42px;
		overflow: hidden;
		border-radius: 11px;
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.name {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.time {
		display: block;
		margin-top: 1px;
		font-size: 12px;
		color: var(--text-4);
	}

	.radio {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 22px;
		height: 22px;
		border: 2px solid var(--border);
		border-radius: 50%;
		color: var(--on-sage);
	}

	.recipe.on .radio {
		border-color: var(--sage);
		background: var(--sage);
	}

	.note {
		margin: -6px 0 14px;
		padding: 0 4px;
		font-size: 12.5px;
		color: var(--text-4);
	}

	.not-saved {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px;
		margin: 0 0 4px;
		font-size: 14px;
		font-weight: 600;
		color: var(--sage);
	}

	.custom {
		margin-bottom: 4px;
	}

	/* The uppercase micro-label the other sheets group a chip row under [3b]. */
	.label {
		margin: 18px 0 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.optional {
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--text-disabled);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 18px;
	}

	.pref {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
		padding: 12px 14px;
		border-radius: var(--r-input);
		background: var(--field);
	}

	.pref-title {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}

	.error {
		margin: 0 0 12px;
		padding: 0 4px;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.remove {
		width: 100%;
		padding: 14px;
		margin-top: 12px;
		font-size: 15px;
		font-weight: 700;
		color: var(--danger);
	}

	.remove:disabled {
		opacity: 0.55;
		cursor: default;
	}
</style>
