<!--
	One ingredient [E2] (→ plan 46, SPEC §4.4): its name (what goes on the list),
	its amount as **a number and a unit kept apart**, its note (shown in the
	recipe), and its part when the recipe has parts.

	- The number field takes numbers only ("500", "1,5", "½", "1/2") and opens
	  the number keyboard; a letter is refused as it is typed, and said so.
	  Nothing is guessed: what was a typed line with a chip (DECISIONS #100,
	  #101) is two controls now, because a typed field has to guess what is
	  number and what is unit (Lukas, DECISIONS #321).
	- The unit is a button showing the current unit; it opens `UnitPanel`
	  [E2b] over this sheet.
	- The Part row lists every part of the recipe and "none"; the row lands at
	  the end of the part picked. A recipe without parts has no Part row.

	Built to be mounted on its own (plan 45's review opens it too): it takes a
	row's fields and hands back the edited fields and the part, and posts
	nothing itself. Mounted per opening, so the initialisers are the reset.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import { countingForm, parseQuantity, clampAmount } from '$lib/utils/amounts';
	import { formatQuantityValue } from '$lib/utils/ingredients';
	import type { EditorIngredient } from '$lib/utils/recipe-editor';
	import { INGREDIENT_LINE_MAX, INGREDIENT_NOTE_MAX } from '$lib/utils/recipes';
	import { unitLabel } from '$lib/utils/shopping';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { untrack } from 'svelte';
	import UnitPanel from './UnitPanel.svelte';

	/** A row's fields, without the form's own key. */
	type IngredientFields = Omit<EditorIngredient, 'id'>;

	type Props = {
		ingredient: IngredientFields;
		/** The row's part, and every part of the recipe; none at all: no Part row. */
		part: string | null;
		parts: string[];
		/** The household's own unit words, as added. */
		own: string[];
		onsave: (fields: IngredientFields, part: string | null) => void;
		/** Absent: the sheet offers no removal (an import's row may say otherwise). */
		onremove?: () => void;
		/** A unit word the household just added in the panel. */
		onadded: (word: string) => void;
		onclose: () => void;
	};

	let { ingredient, part, parts, own, onsave, onremove, onadded, onclose }: Props = $props();

	const m = messages();
	const t = m.cooking.form.ingredientSheet;
	const uid = $props.id();

	let open = $state(true);
	let name = $state(untrack(() => ingredient.name));
	let number = $state(
		untrack(() => (ingredient.quantity === null ? '' : formatQuantityValue(ingredient.quantity)))
	);
	let unit = $state<string | null>(untrack(() => ingredient.unit));
	let note = $state(untrack(() => ingredient.note ?? ''));
	let chosenPart = $state<string | null>(untrack(() => part));
	/** A letter was typed into the number field and refused: say what it takes. */
	let refused = $state(false);
	let choosing = $state(false);

	$effect(() => {
		if (!open) onclose();
	});

	/** What the number field holds, read; null for empty or unreadable. */
	const quantity = $derived.by(() => {
		const read = parseQuantity(number);
		return read === null ? null : clampAmount(read);
	});
	const unreadable = $derived(number.trim() !== '' && quantity === null);

	/** The unit as the button shows it: "g", "EL", "2 Zehen" reads "Zehen". */
	const unitText = $derived(
		unit === null
			? m.cooking.form.units.none
			: Object.hasOwn(m.units.labels, unit)
				? unitLabel(unit, m.units.labels)
				: countingForm(unit, quantity)
	);

	/** Numbers only: anything else typed is taken out again at once. */
	const ALLOWED = /[^0-9.,/½⅓⅔¼¾⅛ ]/g;

	function typeNumber(event: Event & { currentTarget: HTMLInputElement }) {
		const typed = event.currentTarget.value;
		const kept = typed.replace(ALLOWED, '');
		refused = kept !== typed;
		number = kept;
		if (kept !== typed) event.currentTarget.value = kept;
	}

	function save() {
		if (!name.trim() || unreadable) return;
		onsave(
			{
				name: name.replace(/\s+/g, ' ').trim(),
				quantity,
				// A unit measures a quantity: without a number there is nothing to measure.
				unit: quantity === null ? null : unit,
				note: note.replace(/\s+/g, ' ').trim() || null
			},
			chosenPart
		);
		open = false;
	}

	function remove() {
		onremove?.();
		open = false;
	}
</script>

<BottomSheet bind:open eyebrow={t.eyebrow} title={name.trim() || ingredient.name || t.eyebrow}>
	<div class="field">
		<label class="label" for="{uid}-name">{t.name} <span class="hint">· {t.nameHint}</span></label>
		<input
			id="{uid}-name"
			class="input"
			bind:value={name}
			placeholder={t.namePlaceholder}
			maxlength={INGREDIENT_LINE_MAX}
			autocomplete="off"
		/>
	</div>

	<div class="field">
		<span class="label" id="{uid}-amount">{t.amount}</span>
		<div class="amount" role="group" aria-labelledby="{uid}-amount">
			<input
				class="input number"
				value={number}
				oninput={typeNumber}
				inputmode="decimal"
				placeholder={t.numberPlaceholder}
				aria-label={t.number}
				aria-invalid={unreadable ? 'true' : undefined}
				aria-describedby={refused || unreadable ? `${uid}-number-hint` : undefined}
				maxlength={10}
				autocomplete="off"
			/>
			<button
				type="button"
				class="input unit"
				aria-label={t.unitButton(unitText)}
				aria-haspopup="dialog"
				onclick={() => (choosing = true)}
			>
				<span class="unit-now">{unitText}</span>
				<ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
			</button>
		</div>
		{#if refused || unreadable}
			<p class="number-hint" id="{uid}-number-hint">{t.numberOnly}</p>
		{/if}
	</div>

	<div class="field">
		<label class="label" for="{uid}-note">{t.note} <span class="hint">· {t.noteHint}</span></label>
		<input
			id="{uid}-note"
			class="input"
			bind:value={note}
			placeholder={t.notePlaceholder}
			maxlength={INGREDIENT_NOTE_MAX}
			autocomplete="off"
		/>
	</div>

	{#if parts.length}
		<div class="field">
			<span class="label" id="{uid}-part">{t.part}</span>
			<div class="parts" role="group" aria-labelledby="{uid}-part">
				{#each parts as one (one)}
					<button
						type="button"
						class="part"
						aria-pressed={chosenPart === one}
						onclick={() => (chosenPart = one)}>{one}</button
					>
				{/each}
				<button
					type="button"
					class="part"
					aria-pressed={chosenPart === null}
					onclick={() => (chosenPart = null)}>{t.noPart}</button
				>
			</div>
		</div>
	{/if}

	<div class="foot">
		<!-- `Button` spreads onto a bare <button>: without the type it would submit the recipe. -->
		<Button type="button" onclick={save} disabled={!name.trim() || unreadable}>{t.done}</Button>
		{#if onremove}
			<button type="button" class="remove" onclick={remove}>{t.remove}</button>
		{/if}
	</div>

	{#if choosing}
		<UnitPanel
			name={name.trim() || ingredient.name}
			number={number.trim()}
			{quantity}
			current={unit}
			{own}
			onpick={(picked) => (unit = picked)}
			{onadded}
			onclose={() => (choosing = false)}
		/>
	{/if}
</BottomSheet>

<style>
	.field {
		display: flex;
		flex-direction: column;
		margin-top: 16px;
	}

	.field:first-child {
		margin-top: 4px;
	}

	.label {
		margin: 0 2px 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	/* "· what goes on the list": the label's own explanation, not shouted. */
	.hint {
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}

	.input {
		width: 100%;
		min-height: 50px;
		padding: 0 14px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: var(--fs-17);
		color: var(--ink);
	}

	.input::placeholder {
		color: var(--text-disabled);
	}

	.input:focus,
	.input:focus-visible {
		outline: none;
		border-color: var(--sage);
	}

	.amount {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.number {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.number[aria-invalid='true'] {
		border-color: var(--danger-border);
	}

	.unit {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-weight: 600;
		text-align: left;
		color: var(--ink);
	}

	.unit :global(svg) {
		flex: none;
		color: var(--text-4);
	}

	.unit-now {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.number-hint {
		margin: 8px 2px 0;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.parts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.part {
		min-height: 44px;
		padding: 0 14px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-chip);
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.part[aria-pressed='true'] {
		border-color: var(--sage);
		background: var(--sage);
		color: var(--on-sage);
	}

	.foot {
		margin-top: 22px;
	}

	.remove {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: 10px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--danger);
		text-align: center;
	}
</style>
