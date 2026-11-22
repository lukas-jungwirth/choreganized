<!--
	The recipe form's Tags block [3c] (→ plan 40, sketch phone 4): meal, kind
	and free-from as chips you tick any number of, diet as one chip or none —
	tapping the chosen diet again clears it.

	**Folded while empty** (Lukas, 2026-11-22): a recipe typed in by hand gets
	one quiet row, "Tags · meal, kind, diet", rather than four questions on top
	of everything else. Anything set opens it, so an edit always shows what is
	there. A native <details>, so the fold needs no state of its own.

	What posts is hidden fields — one `tag` per ticked tag and one `diet` —
	read by `readRecipeForm`.
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
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Tag from '@lucide/svelte/icons/tag';
	import { untrack } from 'svelte';

	type Props = {
		tags: RecipeTag[];
		diet: RecipeDiet | null;
	};

	let props: Props = $props();

	const m = messages();
	/** Each group is named by its heading, so ids must be unique per mounted copy. */
	const uid = $props.id();

	let tags = $state<RecipeTag[]>(untrack(() => [...props.tags]));
	let diet = $state<RecipeDiet | null>(untrack(() => props.diet));
	/** Open on arrival when anything is set; after that it's the reader's. */
	const startOpen = untrack(() => props.tags.length > 0 || props.diet !== null);

	function toggle(tag: RecipeTag) {
		tags = tags.includes(tag)
			? tags.filter((entry) => entry !== tag)
			: readRecipeTags([...tags, tag]);
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

<details class="tags" open={startOpen}>
	<summary>
		<Tag size={17} strokeWidth={2} aria-hidden="true" />
		<span class="title">{m.cooking.tags.label}</span>
		<span class="hint">{m.cooking.tags.folded}</span>
		<ChevronDown size={18} strokeWidth={2.2} aria-hidden="true" class="chevron" />
	</summary>

	<div class="body">
		{#each groups as group (group.key)}
			<div class="group" role="group" aria-labelledby="{uid}-{group.key}">
				<p class="legend" id="{uid}-{group.key}">{group.label()}</p>
				<div class="chips">
					{#each group.values as value (value.tag)}
						<Chip selected={tags.includes(value.tag)} onclick={() => toggle(value.tag)}>
							{value.name()}
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
					<Chip selected={diet === value} onclick={() => (diet = diet === value ? null : value)}>
						{m.cooking.tags.diets[value]}
					</Chip>
				{/each}
			</div>
		</div>

		<div class="group" role="group" aria-labelledby="{uid}-free">
			<p class="legend" id="{uid}-free">{m.cooking.tags.free}</p>
			<div class="chips">
				{#each RECIPE_FREE_FROM as free (free)}
					{@const tag = `free:${free}` as RecipeTag}
					<Chip selected={tags.includes(tag)} onclick={() => toggle(tag)}>
						{m.cooking.tags.freeFrom[free]}
					</Chip>
				{/each}
			</div>
		</div>
	</div>
</details>

{#each tags as tag (tag)}
	<input type="hidden" name="tag" value={tag} />
{/each}
<input type="hidden" name="diet" value={diet ?? ''} />

<style>
	.tags {
		margin-top: 22px;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	summary {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 14px 16px;
		list-style: none;
		cursor: pointer;
		color: var(--text-2);
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.title {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.hint {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	summary :global(.chevron) {
		flex: none;
		color: var(--text-4);
		transition: transform 0.15s;
	}

	.tags[open] summary :global(.chevron) {
		transform: rotate(180deg);
	}

	.body {
		padding: 0 16px 6px;
	}

	.group {
		margin: 0;
		padding: 12px 0 14px;
		border: 0;
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

	@media (prefers-reduced-motion: reduce) {
		summary :global(.chevron) {
			transition: none;
		}
	}
</style>
