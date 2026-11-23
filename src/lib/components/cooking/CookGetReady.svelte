<!--
	Get ready [C1] (→ plan 47): the screen before step 1. Every ingredient under
	its part, with its note, to tick off while it is set out on the counter.

	It carries the "Cooking for" stepper, because this is the moment the count
	is decided: before the hands are wet (Lukas, 2026-11-23). The same stepper
	as the recipe screen (`ServingsField`, → SPEC §4.5), hidden for a recipe that
	never said how many it serves. The caller owns the count and the URL; the
	amounts here arrive already scaled, so a step of the stepper rewrites every
	one of them at once.

	The ticks belong to the caller too, which keeps them on the device for this
	cook (→ `$lib/utils/cook` `readTicks`).
-->
<script lang="ts">
	import ServingsField from '$lib/components/cooking/ServingsField.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeIngredientRow } from '$lib/server/services/recipes';
	import { showsParts, tickKey } from '$lib/utils/cook';
	import { groupByPart } from '$lib/utils/recipes';
	import Check from '@lucide/svelte/icons/check';

	type Props = {
		/** The whole list, already scaled for `serves`. */
		ingredients: RecipeIngredientRow[];
		/** What the recipe was written for; null hides the stepper. */
		writtenFor: number | null;
		/** The count cooked for. Bindable: the caller writes it to `?serves=`. */
		serves: number | null;
		ticked: ReadonlySet<string>;
		ontoggle: (id: string) => void;
	};

	let { ingredients, writtenFor, serves = $bindable(null), ticked, ontoggle }: Props = $props();

	const m = messages();

	const parts = $derived(groupByPart(ingredients));
	const named = $derived(showsParts(ingredients));
</script>

<p class="eyebrow">{m.cooking.cook.readyEyebrow}</p>
<h1 class="title">{m.cooking.cook.readyTitle}</h1>

{#if writtenFor !== null}
	<div class="count">
		<ServingsField bind:value={serves} {writtenFor} surface="cook" />
	</div>
{/if}

{#each parts as part, at (at)}
	{#if named && part.section}<h2 class="part">{part.section}</h2>{/if}
	<ul class="list">
		{#each part.rows as ingredient (ingredient.id)}
			{@const on = ticked.has(tickKey(ingredient))}
			<li>
				<button
					type="button"
					class="tick"
					aria-pressed={on}
					onclick={() => ontoggle(tickKey(ingredient))}
				>
					<span class="box" aria-hidden="true">
						{#if on}<Check size={15} strokeWidth={3} />{/if}
					</span>
					<span class="what"
						><span class="name">{ingredient.name}</span>{#if ingredient.note}<span class="note"
								>{ingredient.note}</span
							>{/if}</span
					>
					<span class="amount">{m.units.amount(ingredient.quantity, ingredient.unit)}</span>
				</button>
			</li>
		{/each}
	</ul>
{/each}

<style>
	.eyebrow {
		margin: 0;
		font-size: var(--fs-15);
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--cook-amber);
	}

	.title {
		margin: 10px 0 0;
		font-family: var(--font-display);
		font-size: var(--fs-36);
		font-weight: 600;
		line-height: 1.1;
		color: var(--cook-text);
	}

	.count {
		margin-top: 18px;
	}

	.part {
		margin: 22px 0 2px;
		font-family: inherit;
		font-size: var(--fs-14);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cook-muted);
	}

	.list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Without parts the list starts under the stepper, with the same air. */
	.count + .list,
	.title + .list {
		margin-top: 14px;
	}

	.list li {
		border-bottom: 1px solid var(--cook-divider);
	}

	.tick {
		display: grid;
		grid-template-columns: 26px 1fr auto;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 11px 0;
		text-align: left;
		font-size: var(--fs-20);
		color: var(--cook-text);
	}

	.box {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 1.7px solid var(--cook-muted);
		border-radius: 50%;
		color: var(--on-sage);
	}

	.tick[aria-pressed='true'] .box {
		border-color: var(--sage);
		background: var(--sage);
	}

	.what {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.name {
		display: block;
	}

	.name::first-letter {
		text-transform: uppercase;
	}

	.tick[aria-pressed='true'] .name {
		color: var(--cook-muted);
		text-decoration: line-through;
	}

	.note {
		display: block;
		margin-top: 2px;
		font-size: var(--fs-15);
		color: var(--cook-muted);
	}

	.amount {
		max-width: 45vw;
		font-variant-numeric: tabular-nums;
		text-align: right;
		color: var(--cook-text-2);
		overflow-wrap: anywhere;
	}
</style>
