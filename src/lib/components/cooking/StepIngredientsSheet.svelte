<!--
	What one step uses [3c] (→ SPEC §4.4, DECISIONS #127).

	Cook mode used to work this out on its own by looking for ingredient names in
	the step text, which is right often enough to be worth keeping and wrong often
	enough to need an answer: "1 small onion" is referred to as "the onion", a
	sauce mentions water that isn't an ingredient, and olive oil goes in twice in
	different amounts. So this sheet opens **already ticked the way the text was
	read** — adjusting a guess, not filling in a form — and what leaves it is the
	step's own answer from then on.

	The amount beside a tick is a *share of the ingredient row*, in that row's own
	unit: 1 of the 3 tbsp now, 2 at the end. Empty means all of it, which is what
	a plain tick stores and what almost every step wants. Because the share is
	written in recipe-as-written terms, cooking for six scales it exactly like the
	list above it (→ DECISIONS #124).

	Nothing here carries a `name`, and the form mounts it outside its own <form>:
	the step's pins post through one hidden field the row owns (→ DECISIONS #100,
	the same rule `IngredientSheet` follows).
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import { parseQuantity } from '$lib/utils/ingredients';
	import type { StepChoice, StepUseDraft } from '$lib/utils/recipes';
	import { unitLabel } from '$lib/utils/shopping';
	import { untrack } from 'svelte';

	type Props = {
		/** Which step this is — the eyebrow says so, like every label in [3c]. */
		index: number;
		ingredients: StepChoice[];
		/** The step's own list, or null while it still reads its text. */
		uses: StepUseDraft[] | null;
		/** What the text was read as — the seed when nothing has been pinned yet. */
		suggested: StepUseDraft[];
		onsave: (uses: StepUseDraft[]) => void;
		/** Give the step back to the matcher. */
		onauto: () => void;
		onclose: () => void;
	};

	let { index, ingredients, uses, suggested, onsave, onauto, onclose }: Props = $props();

	const m = messages();

	// The parent mounts this per opening, so these initialisers *are* the reset —
	// `IngredientSheet`'s contract, and `untrack` says so out loud.
	const seed = untrack(() => uses ?? suggested);

	let open = $state(true);
	let ticked = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(seed.map((use) => [use.ingredient, true])))
	);
	/**
	 * Strings, not numbers: "½", "1,5" and "1 1/2" are all amounts a recipe writes
	 * and all survive `parseQuantity`. Rounding one through an `<input
	 * type="number">` is the one thing this must not do (→ DECISIONS #101).
	 */
	let shares = $state<Record<string, string>>(
		untrack(() =>
			Object.fromEntries(seed.map((use) => [use.ingredient, m.units.amount(use.quantity, null)]))
		)
	);

	$effect(() => {
		if (!open) onclose();
	});

	function toggle(choice: StepChoice) {
		ticked[choice.key] = !ticked[choice.key];
		shares[choice.key] ??= '';
	}

	/**
	 * Saved in the ingredient list's order rather than the order things were
	 * ticked: that is the order the recipe reads in, and the order cook mode then
	 * says them in. A share is only kept for a row that has an amount to divide —
	 * "half the salt" of no salt is nothing.
	 */
	function save() {
		onsave(
			ingredients
				.filter((choice) => ticked[choice.key])
				.map((choice) => ({
					ingredient: choice.key,
					quantity: choice.quantity === null ? null : parseQuantity(shares[choice.key] ?? '')
				}))
		);
		open = false;
	}

	function auto() {
		onauto();
		open = false;
	}
</script>

<BottomSheet
	bind:open
	eyebrow={m.cooking.form.stepLabel(index)}
	title={m.cooking.form.usesTitle}
	subtitle={m.cooking.form.usesSubtitle}
>
	{#if ingredients.length === 0}
		<p class="empty">{m.cooking.form.usesEmpty}</p>
	{:else}
		<ul class="rows">
			{#each ingredients as choice (choice.key)}
				{@const on = ticked[choice.key] ?? false}
				{@const total = m.units.amount(choice.quantity, choice.unit)}
				<li class="row" class:on>
					<button type="button" class="tick" aria-pressed={on} onclick={() => toggle(choice)}>
						<CheckCircle checked={on} size={22} />
						<span class="text">
							<span class="name">{choice.name}</span>
							<!-- What the whole recipe asks for, so the share above has
								 something to be a share *of*. -->
							{#if on && total}<span class="note">{m.cooking.form.usesShare(total)}</span>{/if}
						</span>
					</button>

					{#if on && choice.quantity !== null}
						<span class="share">
							<input
								type="text"
								bind:value={shares[choice.key]}
								placeholder={m.cooking.form.usesAll}
								aria-label={m.cooking.form.usesAmount(choice.name)}
								inputmode="decimal"
								maxlength={8}
								autocomplete="off"
							/>
							{#if choice.unit}<span class="unit">{unitLabel(choice.unit, m.units.labels)}</span
								>{/if}
						</span>
					{:else if total}
						<span class="total">{total}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<!-- `Button` spreads onto a bare <button> with no default type, so this one is
		 load-bearing: without it the sheet would submit the recipe form. -->
	<Button type="button" onclick={save}>{m.cooking.form.amountDone}</Button>

	{#if uses !== null}
		<button type="button" class="link" onclick={auto}>{m.cooking.form.usesBackToAuto}</button>
	{/if}
</BottomSheet>

<style>
	/*
		The list scrolls on its own rather than with the sheet, the way [3e]'s
		does: a recipe with twenty ingredients would otherwise push Done off the
		bottom of the phone.
	*/
	.rows {
		max-height: 46dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0 0 18px;
		padding: 0 2px 0 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.row + .row {
		border-top: 1px solid var(--divider-sheet);
	}

	/* The tick and the name are one target; the amount beside it is its own, so
	   tapping into the field can't toggle the row out from under the caret. */
	.tick {
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
		padding: 11px 6px;
		text-align: left;
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.name {
		display: block;
		font-size: calc(14.5px * var(--fs));
		font-weight: 600;
		color: var(--text-disabled);
		overflow-wrap: anywhere;
	}

	/* Typed as "400 g pasta", read back as "Pasta · 400 g" [7a]. */
	.name::first-letter {
		text-transform: uppercase;
	}

	.on .name {
		color: var(--ink);
	}

	.note {
		display: block;
		margin-top: 2px;
		font-size: calc(12px * var(--fs));
		line-height: 1.35;
		color: var(--text-5);
	}

	.total {
		flex: none;
		padding-right: 6px;
		font-size: calc(13.5px * var(--fs));
		color: var(--text-disabled);
	}

	.share {
		display: flex;
		align-items: baseline;
		flex: none;
		gap: 6px;
	}

	.share input {
		width: 62px;
		padding: 9px 10px;
		border: 1px solid var(--border);
		border-radius: var(--r-input);
		background: var(--field);
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		text-align: right;
		/* The digits must not jitter while a thumb is on the key. */
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}

	.share input:focus {
		outline: 1.5px solid var(--sage);
		outline-offset: -1px;
	}

	.share input::placeholder {
		font-weight: 500;
		color: var(--text-disabled);
	}

	.unit {
		flex: none;
		min-width: 24px;
		font-size: calc(13px * var(--fs));
		color: var(--text-4);
	}

	/* Under Done, because it undoes the whole sheet rather than one row. */
	.link {
		display: block;
		width: 100%;
		margin-top: 14px;
		padding: 4px;
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	.empty {
		margin: 0 0 18px;
		padding: 0 2px;
		font-size: calc(13.5px * var(--fs));
		line-height: 1.5;
		color: var(--text-4);
	}
</style>
