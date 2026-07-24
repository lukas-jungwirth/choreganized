<!--
	One ingredient row, taken apart [3c]. The row itself stays a single typed
	line — that is still what posts, and still what the server parses
	(→ `$lib/utils/ingredients`). This sheet is a *second* way to write that
	line: it takes it apart with the same parser the server will use, offers
	[3a]'s own unit picker, and hands a line back.

	So there is exactly one representation of an ingredient in this form, which
	is why **nothing here has a `name`** and why the form mounts it outside its
	own `<form>`: no field of it can reach `form.getAll('ingredient')`, and Enter
	inside it cannot submit the recipe (→ DECISIONS #100).

	The "Saved as" line under the fields is not decoration. A few names cannot be
	written as a line that reads back the way you set it — "1 Packung Nudeln" is
	one *pack* of "Nudeln" to the parser — so the sheet shows the reading the
	line will actually get, live, rather than letting you discover it a week
	later on the shopping list (→ DECISIONS #101).
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { composeIngredientLine, parseIngredient, RECIPE_UNITS } from '$lib/utils/ingredients';
	import { INGREDIENT_NAME_MAX } from '$lib/utils/recipes';
	import { unitLabel } from '$lib/utils/shopping';
	import { untrack } from 'svelte';

	type Props = {
		/** The row's line, exactly as typed. */
		line: string;
		/** Which row this is — the title says so, like every aria label in [3c]. */
		index: number;
		/** The rewritten line, for the row to take back. */
		onsave: (line: string) => void;
		onclose: () => void;
	};

	let { line, index, onsave, onclose }: Props = $props();

	const m = messages();

	// The parent mounts this per opening, so these initialisers *are* the reset
	// — `ShoppingItemSheet`'s contract, and `untrack` says so out loud.
	const parsed = untrack(() => parseIngredient(line));

	let open = $state(true);
	let name = $state(untrack(() => parsed?.name ?? ''));
	/**
	 * A string, not a number: "½", "1,5" and "1 1/2" are all amounts a recipe
	 * writes and all survive `parseIngredient`. Rounding one through an
	 * `<input type="number">` is the one thing this must not do
	 * (→ DECISIONS #101).
	 */
	let quantity = $state(untrack(() => m.units.amount(parsed?.quantity ?? null, null)));
	let unit = $state(untrack(() => parsed?.unit ?? ''));

	$effect(() => {
		if (!open) onclose();
	});

	const unitOptions = $derived([
		{ value: '', label: m.cooking.form.unitNone },
		...RECIPE_UNITS.map((value) => ({ value, label: unitLabel(value, m.units.labels) }))
	]);

	/**
	 * Composed with the unit's *label*, not its canonical value: a German
	 * household writes "2 EL Öl", and `UNIT_ALIASES` reads every label in both
	 * catalogs back to the same unit (→ DECISIONS #97).
	 */
	const composed = $derived(
		composeIngredientLine(name, quantity, unit ? unitLabel(unit, m.units.labels) : '')
	);

	/** What this row will actually be saved as — the receipt, before you commit. */
	const readback = $derived(composed.reading ? m.units.ingredient(composed.reading) : '');

	function save() {
		onsave(composed.line);
		open = false;
	}
</script>

<BottomSheet
	bind:open
	eyebrow={m.cooking.form.ingredients}
	title={m.cooking.form.ingredientLabel(index)}
>
	<TextField
		label={m.common.name}
		bind:value={name}
		placeholder={m.cooking.form.ingredientNamePlaceholder}
		maxlength={INGREDIENT_NAME_MAX}
		autocomplete="off"
	/>

	<div class="measure">
		<div class="quantity">
			<TextField
				label={m.cooking.form.quantity}
				bind:value={quantity}
				placeholder={m.cooking.form.quantityPlaceholder}
				inputmode="decimal"
				maxlength={8}
				autocomplete="off"
			/>
		</div>
		<div class="unit">
			<!-- Never disabled: a disabled <select> leaves the tab order, taking the
				 sentence that explains it with it. The hint is always there instead,
				 so the row's height never jumps either. -->
			<Select
				label={m.cooking.form.unit}
				bind:value={unit}
				options={unitOptions}
				hint={m.cooking.form.unitHint}
			/>
		</div>
	</div>

	<p class="readback">
		{m.cooking.form.savedAsLead}<b>{readback || m.cooking.form.savedAsNothing}</b>
	</p>

	<!-- `Button` spreads onto a bare <button> with no default type, so this one
		 is load-bearing: without it the sheet would submit the recipe form. -->
	<Button type="button" onclick={save} disabled={!name.trim()}>
		{m.cooking.form.amountDone}
	</Button>
</BottomSheet>

<style>
	/* [3a]'s measure row, copied deliberately: a fixed amount well and a unit
	   that takes what's left, so "Ohne Einheit" and "tbsp" both sit on one line. */
	.measure {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin: 18px 0;
	}

	.quantity {
		flex: none;
		width: 148px;
	}

	.unit {
		flex: 1;
		min-width: 0;
	}

	.readback {
		margin: 0 0 18px;
		font-size: 13px;
		color: var(--text-4);
	}

	.readback b {
		font-weight: 700;
		color: var(--ink);
	}
</style>
