<!--
	"Cooking for {n}", with what the recipe was written for beside it
	(→ SPEC §4.5).

	One control, two surfaces: the recipe screen [7a], where it sits above the
	ingredient list on a card, and the ingredient picker [3e], where it sits on
	the sunken field the sheets ask questions on. The caller owns the arithmetic
	— this only asks the number.
-->
<script lang="ts">
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import { messages } from '$lib/i18n';
	import { RECIPE_SERVINGS_MAX } from '$lib/utils/recipes';

	type Props = {
		/** The count being cooked for. Bindable — the caller scales off it. */
		value: number | null;
		/** What the recipe itself says, for the note beside the stepper. */
		writtenFor: number;
		/** Set when the field posts as part of a form (the picker's submit). */
		name?: string;
		/** `field` for the sunken block inside a sheet, `card` on a page. */
		surface?: 'card' | 'field';
	};

	let { value = $bindable(null), writtenFor, name, surface = 'card' }: Props = $props();

	const m = messages();
</script>

<div class="serves" class:field={surface === 'field'}>
	<Stepper
		label={m.cooking.recipe.cookingFor}
		{name}
		bind:value
		min={1}
		max={RECIPE_SERVINGS_MAX}
	/>
	<p class="written">{m.cooking.recipe.writtenFor(writtenFor)}</p>
</div>

<style>
	/* Above the amounts it moves, so it reads as "for how many?" rather than as
	   another line of recipe metadata. */
	.serves {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 14px;
		margin-bottom: 12px;
		padding: 12px 14px;
		border: 1.5px solid var(--divider);
		border-radius: var(--r-input);
		background: var(--card);
	}

	/* Inside a sheet the card *is* the background, so the question sinks into it
	   instead — the same block the plan sheet's toggle row sits on [3d]. */
	.field {
		margin-bottom: 16px;
		border-color: transparent;
		background: var(--field);
	}

	.written {
		margin: 0 0 7px;
		font-size: calc(12.5px * var(--fs));
		text-align: right;
		color: var(--text-5);
	}
</style>
