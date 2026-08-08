<!--
	The step itself [7b] — Fraunces 33px, with every ingredient it names
	underlined in amber.

	The underlines are read out of the text rather than authored (→ DECISIONS #14,
	`$lib/utils/step-highlight`): the recipe form never asks which ingredients a
	step uses, and asking would be one more thing to fill in for a screen you only
	look at with your hands full.

	The `{#each}` has no line break anywhere inside it on purpose. Svelte turns the
	whitespace of a prettier-formatted block into real text nodes, and a stray
	space in the middle of "the mushrooms" is very visible at this size.
-->
<script lang="ts">
	import type { RecipeIngredientRow } from '$lib/server/services/recipes';
	import type { StepSegment } from '$lib/utils/step-highlight';

	let { segments }: { segments: StepSegment<RecipeIngredientRow>[] } = $props();
</script>

<p class="step">
	{#each segments as segment, index (index)}{#if segment.ingredient}<mark>{segment.text}</mark
			>{:else}{segment.text}{/if}{/each}
</p>

<style>
	.step {
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(33px * var(--fs));
		font-weight: 600;
		line-height: 1.22;
		color: var(--cook-text);
		overflow-wrap: anywhere;
	}

	/* `<mark>` because that is exactly what this is; only the browser's yellow
		 highlight is being replaced. */
	mark {
		background: none;
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--cook-amber);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}
</style>
