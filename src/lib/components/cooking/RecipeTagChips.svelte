<!--
	The tag questions themselves — meal, kind, diet, free from — as rows of
	chips (→ plans 40, 41). Meal, kind and free-from take any number; diet takes
	one or none, and tapping the chosen diet again clears it.

	Two places ask them: the recipe form's Tags block (`RecipeTagsField`, folded
	inside a <details>) and the sorting pass (`/cooking/recipes/sort`, one recipe
	per card). Both post what this renders: one hidden `tag` per ticked tag and
	one `diet`, read by `readRecipeForm` / `readRecipeTags`.

	**Suggestions** (an import's, the AI's, the diet guess) arrive ticked and
	wear a small dot until somebody touches that chip, so "the website said so"
	and "I said so" look different until Save. The dot is never stored. A
	parent that swaps in new suggestions remounts this (`{#key}`).
-->
<script lang="ts">
	import Chip from '$lib/components/ui/Chip.svelte';
	import { messages } from '$lib/i18n';
	import { MEAL_SLOTS } from '$lib/utils/meals';
	import {
		RECIPE_DIETS,
		RECIPE_FREE_FROM,
		RECIPE_KINDS,
		readRecipeTags,
		type RecipeDiet,
		type RecipeTag
	} from '$lib/utils/recipe-tags';
	import { untrack } from 'svelte';

	type Props = {
		tags: RecipeTag[];
		diet: RecipeDiet | null;
		/** Chip keys (`meal:dinner`, `diet:vegan`) that are suggestions, not choices. */
		suggested?: string[];
	};

	let { tags = $bindable(), diet = $bindable(), suggested = [] }: Props = $props();

	const m = messages();
	/** Each group is named by its heading, so ids must be unique per mounted copy. */
	const uid = $props.id();

	/** Which chips still carry their suggestion dot. */
	let dotted = $state(new Set(untrack(() => suggested)));

	function touched(key: string) {
		if (!dotted.has(key)) return;
		dotted.delete(key);
		dotted = new Set(dotted);
	}

	function toggle(tag: RecipeTag) {
		touched(tag);
		tags = tags.includes(tag)
			? tags.filter((entry) => entry !== tag)
			: readRecipeTags([...tags, tag]);
	}

	function pickDiet(value: RecipeDiet) {
		touched(`diet:${value}`);
		if (diet) touched(`diet:${diet}`);
		diet = diet === value ? null : value;
	}

	/**
	 * A dotted chip says so in its name ("Vegan, suggested"). An aria-label
	 * rather than hidden text: the chip is a flex box, and Chrome reads a hidden
	 * span in one as a separate word ("Vegan , suggested").
	 */
	function named(name: string, key: string): string {
		return dotted.has(key) ? m.cooking.tags.suggestedMark(name) : name;
	}

	const groups = [
		{
			key: 'meal',
			label: () => m.cooking.tags.meal,
			values: MEAL_SLOTS.map((slot) => ({
				tag: `meal:${slot}` as RecipeTag,
				name: () => m.cooking.slots[slot]
			}))
		},
		{
			key: 'kind',
			label: () => m.cooking.tags.kind,
			values: RECIPE_KINDS.map((kind) => ({
				tag: `kind:${kind}` as RecipeTag,
				name: () => m.cooking.tags.kinds[kind]
			}))
		}
	];
</script>

{#snippet label(name: string, key: string)}
	{name}{#if dotted.has(key)}<span class="dot" aria-hidden="true"></span>{/if}
{/snippet}

{#each groups as group (group.key)}
	<div class="group" role="group" aria-labelledby="{uid}-{group.key}">
		<p class="legend" id="{uid}-{group.key}">{group.label()}</p>
		<div class="chips">
			{#each group.values as value (value.tag)}
				<Chip
					selected={tags.includes(value.tag)}
					aria-label={named(value.name(), value.tag)}
					onclick={() => toggle(value.tag)}
				>
					{@render label(value.name(), value.tag)}
				</Chip>
			{/each}
		</div>
	</div>
{/each}

<div class="group" role="group" aria-labelledby="{uid}-diet">
	<p class="legend" id="{uid}-diet">
		{m.cooking.tags.diet}<small>{m.cooking.tags.pickOne}</small>
	</p>
	<div class="chips">
		{#each RECIPE_DIETS as value (value)}
			<Chip
				selected={diet === value}
				aria-label={named(m.cooking.tags.diets[value], `diet:${value}`)}
				onclick={() => pickDiet(value)}
			>
				{@render label(m.cooking.tags.diets[value], `diet:${value}`)}
			</Chip>
		{/each}
	</div>
</div>

<div class="group" role="group" aria-labelledby="{uid}-free">
	<p class="legend" id="{uid}-free">{m.cooking.tags.free}</p>
	<div class="chips">
		{#each RECIPE_FREE_FROM as free (free)}
			{@const tag = `free:${free}` as RecipeTag}
			<Chip
				selected={tags.includes(tag)}
				aria-label={named(m.cooking.tags.freeFrom[free], tag)}
				onclick={() => toggle(tag)}
			>
				{@render label(m.cooking.tags.freeFrom[free], tag)}
			</Chip>
		{/each}
	</div>
</div>

{#each tags as tag (tag)}
	<input type="hidden" name="tag" value={tag} />
{/each}
<input type="hidden" name="diet" value={diet ?? ''} />

<style>
	.group {
		margin: 0;
		padding: 12px 0 14px;
		border-top: 1px solid var(--divider);
		min-width: 0;
	}

	.legend {
		display: flex;
		justify-content: space-between;
		width: 100%;
		margin: 0 0 9px;
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
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}

	.chips :global(.chip) {
		padding: 7px 12px;
		font-size: var(--fs-15);
	}

	/* The suggestion mark: gold on a plain chip, the chip's own ink on a ticked one. */
	.dot {
		width: 6px;
		height: 6px;
		margin-left: -2px;
		border-radius: 50%;
		background: var(--gold);
	}

	.chips :global(.chip.selected .dot) {
		background: var(--on-sage);
		opacity: 0.85;
	}
</style>
