<!--
	Pick the unit [E2b] (→ plan 46, DECISIONS #321): everything visible, nothing
	to type or scroll. The eight units, the everyday counting words of the
	reader's language (the catalog's dozen), the household's own words after
	those, outlined, then "No unit" and "Add your own".

	One list for everyone: a unit is one of the eight, a counting word the
	reader knows, or a word the household added. "Add your own" is the only way
	a new word comes in; it asks for the word right here, in a field that takes
	the button's place (→ DECISIONS #324), and posts it to Settings' `addUnit`
	action, so the household has it at once, here and in every other recipe.

	The row's current word is always shown, also one the reader knows that the
	panel doesn't list ("Tasse"), so opening the panel never hides what is set.
	A counting word is shown in the number that fits the amount ("2 Zehen");
	picking it stores its one form. Mounted per opening, like every sheet.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { messages } from '$lib/i18n';
	import {
		countingBase,
		countingForm,
		countingWord,
		RECIPE_UNITS,
		unitFromWord,
		unitWordKey,
		UNIT_WORD_MAX
	} from '$lib/utils/amounts';
	import { unitLabel } from '$lib/utils/shopping';
	import { tick } from 'svelte';

	type Props = {
		/** The ingredient's name and number, for the eyebrow: "Faschiertes · 500". */
		name: string;
		number: string;
		/** The amount, so a counting word is shown in the number that fits it. */
		quantity: number | null;
		/** The row's unit as the form holds it, or null. */
		current: string | null;
		/** The household's own words, as added. */
		own: string[];
		onpick: (unit: string | null) => void;
		/** A word the household just added: the form keeps it for every row. */
		onadded: (word: string) => void;
		onclose: () => void;
	};

	let { name, number, quantity, current, own, onpick, onadded, onclose }: Props = $props();

	const m = messages();
	const t = m.cooking.form.units;
	const uid = $props.id();

	let open = $state(true);
	let adding = $state(false);
	let word = $state('');
	let error = $state<string | null>(null);
	let pending = $state(false);
	let field: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (!open) onclose();
	});

	/** What a word is for comparing: the unit's key, a counting word's key, or itself. */
	function sameAs(a: string | null, b: string | null): boolean {
		if (!a || !b) return a === b;
		const unitA = unitFromWord(a);
		if (unitA) return unitA === unitFromWord(b);
		const countA = countingWord(a);
		if (countA) return countA === countingWord(b);
		return unitWordKey(a) === unitWordKey(b);
	}

	const everyday = $derived(t.everyday as readonly string[]);

	/**
	 * The counted-in grid: the everyday dozen, the household's own words, and the
	 * row's current word when it is in neither (and not one of the eight).
	 */
	const counted = $derived.by(() => {
		const words = [
			...everyday.map((one) => ({ word: one, own: false })),
			...own
				.filter((one) => !everyday.some((day) => sameAs(day, one)))
				.map((one) => ({ word: one, own: true }))
		];
		if (current && !unitFromWord(current) && !words.some((one) => sameAs(one.word, current))) {
			words.push({ word: countingWord(current) ? countingBase(current) : current, own: false });
		}
		return words;
	});

	function pick(unit: string | null) {
		onpick(unit);
		open = false;
	}

	async function startAdding() {
		adding = true;
		error = null;
		await tick();
		field?.focus();
	}
</script>

<BottomSheet bind:open eyebrow={t.eyebrow(name, number)} title={t.title}>
	<p class="label" id="{uid}-units">{t.units}</p>
	<div class="grid four" role="group" aria-labelledby="{uid}-units">
		{#each RECIPE_UNITS as unit (unit)}
			<button
				type="button"
				class="option"
				aria-pressed={sameAs(unit, current)}
				onclick={() => pick(unit)}
			>
				{unitLabel(unit, m.units.labels)}
			</button>
		{/each}
	</div>

	<p class="label" id="{uid}-counted">{t.counted}</p>
	<div class="grid three" role="group" aria-labelledby="{uid}-counted">
		{#each counted as one (one.word)}
			<button
				type="button"
				class="option"
				class:own={one.own}
				aria-pressed={sameAs(one.word, current)}
				aria-label={one.own ? t.ownMark(one.word) : undefined}
				onclick={() => pick(one.word)}
			>
				{one.own ? one.word : countingForm(one.word, quantity)}
			</button>
		{/each}
	</div>

	<div class="pair">
		<button type="button" class="option" aria-pressed={current === null} onclick={() => pick(null)}>
			{t.none}
		</button>
		{#if !adding}
			<button type="button" class="option add" onclick={startAdding}>+ {t.addOwn}</button>
		{/if}
	</div>

	{#if adding}
		<!-- Posts to Settings, where the household's words are kept and listed;
			 the answer is the word as stored, and the row takes it at once. -->
		<form
			class="own-form"
			method="POST"
			action="/settings?/addUnit"
			use:enhance={() => {
				pending = true;
				error = null;
				return async ({ result }) => {
					pending = false;
					if (result.type === 'success' && result.data?.unit) {
						const added = (result.data.unit as { word: string }).word;
						onadded(added);
						pick(added);
					} else if (result.type === 'failure') {
						error = String(result.data?.unitError ?? '');
					}
				};
			}}
		>
			<label class="label" for="{uid}-own">{t.ownLabel}</label>
			<div class="own-row">
				<input
					bind:this={field}
					id="{uid}-own"
					name="word"
					bind:value={word}
					placeholder={t.ownPlaceholder}
					maxlength={UNIT_WORD_MAX}
					autocomplete="off"
					autocapitalize="words"
					aria-invalid={error ? 'true' : undefined}
					aria-describedby={error ? `${uid}-own-error` : undefined}
				/>
				<button type="submit" class="confirm" disabled={pending || !word.trim()}>
					{t.ownAdd}
				</button>
			</div>
			{#if error}<p class="error" id="{uid}-own-error">{error}</p>{/if}
		</form>
	{/if}
</BottomSheet>

<style>
	.label {
		margin: 14px 2px 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.label:first-child {
		margin-top: 2px;
	}

	.grid {
		display: grid;
		gap: 8px;
	}

	.four {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 14px;
	}

	.option {
		min-height: 46px;
		padding: 4px 6px;
		border-radius: 12px;
		background: var(--sunken);
		font-size: var(--fs-16);
		font-weight: 600;
		line-height: 1.15;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.option[aria-pressed='true'] {
		background: var(--sage);
		color: var(--on-sage);
	}

	/* A household's own word: the same tile, outlined, so it reads as added. */
	.own {
		background: none;
		box-shadow: inset 0 0 0 1.5px var(--border-dashed);
	}

	.add {
		background: none;
		box-shadow: inset 0 0 0 1.5px var(--border-dashed);
		color: var(--sage-deep);
	}

	.own-form {
		margin-top: 14px;
	}

	.own-row {
		display: flex;
		gap: 8px;
	}

	.own-row input {
		flex: 1;
		min-width: 0;
		min-height: 48px;
		padding: 0 14px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: var(--fs-17);
		color: var(--ink);
	}

	.own-row input:focus {
		outline: none;
		border-color: var(--sage);
	}

	.confirm {
		flex: none;
		min-height: 48px;
		padding: 0 18px;
		border-radius: var(--r-button);
		background: var(--sage);
		font-size: var(--fs-16);
		font-weight: 700;
		color: var(--on-sage);
	}

	.confirm:disabled {
		opacity: 0.45;
	}

	.error {
		margin: 8px 2px 0;
		font-size: var(--fs-15);
		color: var(--danger-deep);
	}
</style>
