<!--
	New / edit recipe [3c], rebuilt around parts and links (→ plan 46, SPEC
	§4.4). A full-screen route rather than a sheet: it is the one form in the
	app you might spend five minutes in (→ docs/ARCHITECTURE.md "Conventions").

	This component owns the state and the wire; the screen is its parts:
	`RecipeBasics` (photo, name, time, servings, tags), `IngredientList` [E1]
	with `IngredientSheet` [E2] and `UnitPanel` [E2b], `StepList` of
	`StepCard`s [E3a] with `PartPickerSheet` [E3b], `StepLinkSheet` [E3] and
	`StepTimerSheet`. The sheets are mounted outside the <form>: nothing in them
	carries a field `name`, and forms do not nest.

	The state is parts of rows (`utils/recipe-editor.ts`): what the screen draws
	and what a drag moves across. What posts is computed from it in one place,
	`postedFields`, as hidden fields `readRecipeForm` reads back by position:
	each ingredient as its fields, each step with its links (an empty list
	included, so a save from here always says what a step uses).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeDetail } from '$lib/server/services/recipes';
	import { unitWordKey } from '$lib/utils/amounts';
	import {
		addPart,
		emptyState,
		fromPrefill,
		fromRecipe,
		hasParts,
		keyMaker,
		linkTargets,
		moveToPart,
		newStep,
		partNames,
		postedFields,
		recheckLinks,
		removeRow,
		renamePart,
		shiftRow,
		suggesting,
		suggestionsFor,
		updateRow,
		type EditorIngredient,
		type EditorOpening,
		type EditorPart,
		type EditorState,
		type EditorStep
	} from '$lib/utils/recipe-editor';
	import {
		INGREDIENTS_MAX,
		STEPS_MAX,
		uploadUrl,
		type RecipeFormField,
		type RecipePrefill
	} from '$lib/utils/recipes';
	import { freshKeys } from '$lib/utils/recipe-review';
	import { ruleRow } from '$lib/utils/rule-draft';
	import { plainName } from '$lib/utils/step-highlight';
	import { formatDuration, parseStepDuration } from '$lib/utils/timer-parse';
	import { tick, untrack } from 'svelte';
	import IngredientList from './IngredientList.svelte';
	import IngredientSheet from './IngredientSheet.svelte';
	import PartPickerSheet from './PartPickerSheet.svelte';
	import RecipeBasics from './RecipeBasics.svelte';
	import StepLinkSheet from './StepLinkSheet.svelte';
	import StepList from './StepList.svelte';
	import StepTimerSheet from './StepTimerSheet.svelte';

	type Props = {
		/** The recipe being edited; null when creating or importing. */
		recipe: RecipeDetail | null;
		/**
		 * An imported draft to open on [plan 12]: name, ingredient lines with
		 * their notes and parts, steps with their links, an already-downloaded
		 * photo. Seeded over a null `recipe`; nothing is saved before Save.
		 */
		prefill?: RecipePrefill;
		/** The household's own unit words, as added (→ plan 46, `services/units.ts`). */
		units: string[];
		/** Where Cancel returns to: the recipe, or wherever "New" was pressed. */
		back: string;
		/** Message from a rejected save, and which field it is about. */
		error?: string;
		field?: RecipeFormField;
		/** A one-line notice above the form: the AI import's "check before saving". */
		notice?: string;
		/**
		 * An import's review, opened in full ("Edit everything", → plan 45): the
		 * state to start from instead of reading `prefill` again, so nothing
		 * settled or edited in the review is lost.
		 */
		opened?: EditorOpening;
		/** Every change, so the review's draft survives a reload (→ plan 45). */
		onchange?: (state: EditorOpening) => void;
		/** A save that went through, just before the recipe opens. */
		onsaved?: () => void;
	};

	let {
		recipe,
		prefill,
		units,
		back,
		error,
		field,
		notice,
		opened: start,
		onchange,
		onsaved
	}: Props = $props();

	const m = messages();

	// A rejected photo must not redden the name field: they sit a screen apart.
	const nameError = $derived(field === 'photo' ? undefined : error);
	const photoError = $derived(field === 'photo' ? error : undefined);

	/**
	 * Keys from a counter: the server render and the browser agree on them. A
	 * review's state (only ever drawn in the browser) brings keys of its own, so
	 * new ones take a prefix of their own (→ `freshKeys`).
	 */
	const key = untrack(() => (start ? freshKeys() : keyMaker('r')));

	/** The household's own unit words: seeded, and grown by "Add your own". */
	let own = $state<string[]>(untrack(() => [...units]));
	const known = $derived(new Set(own.map(unitWordKey)));

	const basics = untrack(() => start ?? prefill ?? recipe);
	let name = $state(untrack(() => basics?.name ?? ''));
	let time = $state(untrack(() => numberField(basics?.timeMinutes)));
	let servings = $state(untrack(() => numberField(basics?.servings)));

	let editor = $state<EditorState>(
		untrack(() => {
			const opened = start
				? ($state.snapshot(start.editor) as EditorState)
				: prefill
					? fromPrefill(prefill, key, new Set(units.map(unitWordKey)))
					: recipe
						? fromRecipe(recipe, key)
						: emptyState(key);
			// Always somewhere to type the first ingredient into, and the first step.
			if (!opened.ingredients.length) opened.ingredients = [{ id: key(), name: null, rows: [] }];
			if (!opened.steps.length) opened.steps = [{ id: key(), name: null, rows: [newStep(key)] }];
			return opened;
		})
	);

	/** A stored count as the text its field shows: empty for "not stated". */
	function numberField(value: number | null | undefined): string {
		return value?.toString() ?? '';
	}

	/** A field's text as a count again: empty or unreadable is "not stated". */
	function countOf(value: string): number | null {
		const read = Math.trunc(Number(value));
		return value.trim() && Number.isFinite(read) && read > 0 ? read : null;
	}

	// The review's draft follows every change, so a reload keeps it (→ plan 45).
	$effect(() => {
		if (!onchange) return;
		const state: EditorOpening = {
			name,
			timeMinutes: countOf(time),
			servings: countOf(servings),
			editor: $state.snapshot(editor)
		};
		untrack(() => onchange(state));
	});

	const showParts = $derived(hasParts(editor));
	const targets = $derived(linkTargets(editor.ingredients));
	const byKey = $derived(new Map(targets.map((row) => [row.key, row])));
	const ingredientCount = $derived(
		editor.ingredients.reduce((sum, part) => sum + part.rows.length, 0)
	);
	const stepCount = $derived(editor.steps.reduce((sum, part) => sum + part.rows.length, 0));
	const fields = $derived(postedFields(editor, known));
	/** Servings as a number, for "Show for 4 / 8 people"; null when not stated. */
	const people = $derived.by(() => {
		const read = Math.trunc(Number(servings));
		return Number.isFinite(read) && read > 0 ? read : null;
	});

	/* ── The photo ── */

	let picked = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	/** The stored photo is on its way out: posted as `removePhoto`. */
	let removed = $state(false);
	let submitting = $state(false);

	// The chosen file, shown before it's uploaded; the object URL is revoked when
	// it's replaced or the form leaves.
	$effect(() => {
		if (!picked) {
			previewUrl = null;
			return;
		}
		const url = URL.createObjectURL(picked);
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	const photo = $derived(
		previewUrl ??
			(removed
				? null
				: recipe?.imagePath
					? uploadUrl(recipe.imagePath)
					: (prefill?.photo?.preview ?? null))
	);

	/* ── Which sheet is up, by row id ── */

	let editing = $state<string | null>(null);
	let linking = $state<string | null>(null);
	let timing = $state<string | null>(null);
	let moving = $state<string | null>(null);

	/** A row and the part it is in, by id. */
	function find<T extends { id: string }>(
		parts: EditorPart<T>[],
		id: string | null
	): { row: T; part: EditorPart<T>; number: number } | null {
		let number = 0;
		for (const part of parts) {
			for (const row of part.rows) {
				number += 1;
				if (row.id === id) return { row, part, number };
			}
		}
		return null;
	}

	/* ── Ingredients ── */

	function setRows(partId: string, rows: EditorIngredient[]) {
		editor.ingredients = editor.ingredients.map((part) =>
			part.id === partId ? { ...part, rows } : part
		);
	}

	function addLine(partId: string, line: string) {
		const read = ruleRow(line, known);
		if (!read) return;
		const row: EditorIngredient = { id: key(), ...read };
		editor.ingredients = editor.ingredients.map((part) =>
			part.id === partId ? { ...part, rows: [...part.rows, row] } : part
		);
	}

	function saveIngredient(id: string, fields: Omit<EditorIngredient, 'id'>, part: string | null) {
		const found = find(editor.ingredients, id);
		if (!found) return;
		let parts = updateRow(editor.ingredients, { id, ...fields });
		if (showParts && part !== found.part.name) parts = moveToPart(parts, id, part, key);
		editor.ingredients = parts;
		if (fields.quantity !== found.row.quantity || fields.unit !== found.row.unit) {
			editor.steps = recheckLinks(editor.steps, { key: id, ...fields });
		}
	}

	/** A removed ingredient takes its links with it: a link to nothing is a lie on screen. */
	function removeIngredient(id: string) {
		editor.ingredients = removeRow(editor.ingredients, id);
		editor.steps = editor.steps.map((part) => ({
			...part,
			rows: part.rows.map((step) => ({
				...step,
				links: step.links.filter((link) => link.ingredient !== id)
			}))
		}));
	}

	/** A part is one thing in the recipe: its name changes over both lists. */
	function rename(from: string, to: string) {
		editor.ingredients = renamePart(editor.ingredients, from, to);
		editor.steps = renamePart(editor.steps, from, to);
	}

	/* ── Steps ── */

	function setStep(id: string, change: Partial<EditorStep>) {
		editor.steps = editor.steps.map((part) => ({
			...part,
			rows: part.rows.map((step) => (step.id === id ? { ...step, ...change } : step))
		}));
	}

	async function addStep() {
		const step = newStep(key);
		const parts = editor.steps.length ? editor.steps : [{ id: key(), name: null, rows: [] }];
		const last = parts.length - 1;
		editor.steps = parts.map((part, at) =>
			at === last ? { ...part, rows: [...part.rows, step] } : part
		);
		await tick();
		document.querySelector<HTMLTextAreaElement>(`[data-step="${step.id}"] textarea`)?.focus();
	}

	function removeStep(id: string) {
		if (linking === id) linking = null;
		if (timing === id) timing = null;
		editor.steps = removeRow(editor.steps, id);
		// Never an empty list: an empty list has nothing to type into.
		if (!editor.steps.some((part) => part.rows.length)) void addStep();
	}

	/** What a step's two rows say. */
	function describe(step: EditorStep, number: number) {
		const linked = [
			...new Set(step.links.flatMap((link) => byKey.get(link.ingredient)?.name ?? []))
		];
		const suggested = suggesting(step)
			? [
					...new Set(
						suggestionsFor(step, targets, known).flatMap(
							(offer) => byKey.get(offer.ingredient)?.name ?? []
						)
					)
				].filter((one) => !linked.includes(one))
			: [];
		const timer = step.timer
			? m.cooking.form.timerChip(
					step.timer.label ?? m.cooking.cook.timerForStep(number),
					formatDuration(step.timer.seconds)
				)
			: null;
		return { linked, suggested, timer };
	}

	/** The step's ingredients by their short names: the timer sheet's one-tap names. */
	function timerNames(step: EditorStep, number: number): string[] {
		const said = describe(step, number);
		return [...new Set([...said.linked, ...said.suggested].map(plainName))];
	}

	/** The parts the step picker lists, each with the steps it holds now. */
	const pickerParts = $derived.by(() => {
		const ranges = new Map<string, [number, number]>();
		let number = 0;
		for (const part of editor.steps) {
			for (const _ of part.rows) {
				number += 1;
				if (!part.name) continue;
				const held = ranges.get(part.name);
				ranges.set(part.name, held ? [held[0], number] : [number, number]);
			}
		}
		return partNames(editor).map((one) => {
			const range = ranges.get(one);
			return { name: one, holds: range ? m.cooking.form.movePart.steps(...range) : null };
		});
	});
</script>

<form
	method="POST"
	action="?/save"
	enctype="multipart/form-data"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			// A successful save redirects; a rejected one comes back with `error`
			// and everything typed still on screen.
			if (result.type === 'redirect') onsaved?.();
			await update({ reset: false });
			submitting = false;
		};
	}}
>
	<header>
		<!-- From an import's review, back to it in place: the two are one screen in history. -->
		<a class="cancel" href={back} data-sveltekit-replacestate={start ? true : undefined}
			>{m.common.cancel}</a
		>
		<h1>{recipe ? m.cooking.form.edit : m.cooking.form.new}</h1>
		<button type="submit" class="save" disabled={submitting || !name.trim()}>
			{m.cooking.form.save}
		</button>
	</header>

	{#if notice}
		<!-- The AI import's quiet reminder [plan 13]: a starting point, not a saved recipe. -->
		<p class="notice">{notice}</p>
	{/if}

	<RecipeBasics
		bind:name
		bind:time
		bind:servings
		{photo}
		{nameError}
		{photoError}
		tags={recipe?.tags ?? []}
		diet={recipe?.diet ?? null}
		suggested={prefill?.suggested}
		onpick={(file) => {
			picked = file;
			if (file) removed = false;
		}}
		ondrop={() => {
			picked = null;
			removed = true;
		}}
	/>
	<input type="hidden" name="removePhoto" value={removed ? '1' : ''} />
	{#if prefill?.photo}
		<!-- The already-downloaded photo's temp path: the save attaches it unless a
			 fresh pick or a removal supersedes it (→ plan 12). -->
		<input type="hidden" name="importedPhoto" value={prefill.photo.path} />
	{/if}

	<h2 class="label">{m.cooking.form.ingredients}</h2>
	<IngredientList
		parts={editor.ingredients}
		{showParts}
		canAdd={ingredientCount < INGREDIENTS_MAX}
		onrows={setRows}
		onaddline={addLine}
		onedit={(id) => (editing = id)}
		onrename={rename}
		onaddpart={(part) => (editor.ingredients = addPart(editor.ingredients, part, key))}
	/>

	<h2 class="label">{m.cooking.form.steps}</h2>
	<StepList
		parts={editor.steps}
		{showParts}
		canAdd={stepCount < STEPS_MAX}
		{describe}
		ontext={(id, text) => setStep(id, { text })}
		onlinks={(id) => (linking = id)}
		ontimer={(id) => (timing = id)}
		onmove={(id, direction) => (editor.steps = shiftRow(editor.steps, id, direction))}
		onmovepart={(id) => (moving = id)}
		onremove={removeStep}
		onadd={addStep}
		onrename={rename}
		onaddpart={(part) => (editor.steps = addPart(editor.steps, part, key))}
	/>

	<!-- What posts: each ingredient as its fields, each step with its links, all
		 lined up by position (→ `postedFields`, `readRecipeForm`). -->
	{#each fields as [fieldName, value], at (at)}
		<input type="hidden" name={fieldName} {value} />
	{/each}

	<div class="submit">
		<Button type="submit" disabled={submitting || !name.trim()}>
			{recipe ? m.common.saveChanges : m.cooking.form.saveRecipe}
		</Button>
	</div>
</form>

{#if editing}
	{@const found = find(editor.ingredients, editing)}
	{#if found}
		{@const id = found.row.id}
		<IngredientSheet
			ingredient={found.row}
			part={found.part.name}
			parts={showParts ? partNames(editor) : []}
			{own}
			onsave={(fields, part) => saveIngredient(id, fields, part)}
			onremove={() => removeIngredient(id)}
			onadded={(word) => {
				if (!own.some((one) => unitWordKey(one) === unitWordKey(word))) own = [...own, word];
			}}
			onclose={() => (editing = null)}
		/>
	{/if}
{/if}

{#if linking}
	{@const found = find(editor.steps, linking)}
	{#if found}
		{@const id = found.row.id}
		<StepLinkSheet
			index={found.number}
			text={found.row.text}
			links={found.row.links}
			dismissed={found.row.dismissed}
			suggesting={suggesting(found.row)}
			{targets}
			servings={people}
			{known}
			onsave={(links, dismissed) => setStep(id, { links, dismissed })}
			onclose={() => (linking = null)}
		/>
	{/if}
{/if}

{#if timing}
	{@const found = find(editor.steps, timing)}
	{#if found}
		{@const id = found.row.id}
		<StepTimerSheet
			index={found.number}
			timer={found.row.timer}
			suggestedSeconds={parseStepDuration(found.row.text)}
			names={timerNames(found.row, found.number)}
			onsave={(timer) => setStep(id, { timer })}
			onremove={() => setStep(id, { timer: null })}
			onclose={() => (timing = null)}
		/>
	{/if}
{/if}

{#if moving}
	{@const found = find(editor.steps, moving)}
	{#if found}
		{@const id = found.row.id}
		<PartPickerSheet
			eyebrow={m.cooking.form.movePart.eyebrow(found.number)}
			current={found.part.name}
			parts={pickerParts}
			onpick={(part) => (editor.steps = moveToPart(editor.steps, id, part, key))}
			onclose={() => (moving = null)}
		/>
	{/if}
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 0 14px;
	}

	/* A navigation bar: Cancel, the title and Save share one line, so like a
	   native one they stop growing early (→ DESIGN-SYSTEM "Type scale"). */
	.cancel {
		display: flex;
		align-items: center;
		min-height: 44px;
		font-size: min(var(--fs-17), 22px);
		font-weight: 600;
		color: var(--text-4);
	}

	h1 {
		min-width: 0;
		font-size: min(var(--fs-20), 26px);
		text-align: center;
	}

	.save {
		min-height: 44px;
		font-size: min(var(--fs-17), 22px);
		font-weight: 700;
		color: var(--sage);
	}

	.save:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.notice {
		margin: 0 0 14px;
		padding: 10px 13px;
		border-radius: var(--r-input);
		background: var(--sunken);
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--text-4);
	}

	.label {
		margin: 26px 4px 8px;
		font-family: var(--font-body);
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.submit {
		margin-top: 28px;
	}
</style>
