<!--
	New / edit recipe [3c] — a full-screen route rather than a sheet, because
	it's the one form in the app you might spend five minutes in and want to be
	able to link to (→ docs/ARCHITECTURE.md "Conventions").

	Ingredients are typed the way you'd write them on paper ("400 g pasta") and
	parsed on the server (→ `$lib/utils/ingredients`), so this form posts plain
	lines: one `ingredient` field per row, one `step` per step, in DOM order.
	That also makes reordering nothing more than reordering an array.

	Each row shows what that parse made of it, in the column [7a] prints the
	amount in — and after hydration that chip opens `IngredientSheet`, which
	takes the line apart and hands one back. Structured entry without a
	structured wire: the line is still the only thing that posts
	(→ DECISIONS #100).

	The design draws a drag grip on each row. This ships the arrows plan 03 chose
	for the store list (→ DECISIONS #36): they work on touch, with a keyboard and
	without JavaScript-level pointer maths.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeDetail } from '$lib/server/services/recipes';
	import { parseIngredient, RECIPE_UNITS } from '$lib/utils/ingredients';
	import { unitLabel } from '$lib/utils/shopping';
	import {
		INGREDIENTS_MAX,
		INGREDIENT_LINE_MAX,
		RECIPE_NAME_MAX,
		RECIPE_SERVINGS_MAX,
		RECIPE_TIME_MAX,
		STEPS_MAX,
		STEP_TEXT_MAX,
		uploadUrl,
		type RecipeFormField,
		type RecipePrefill,
		type StepChoice,
		type StepUseDraft
	} from '$lib/utils/recipes';
	import { highlightStep } from '$lib/utils/step-highlight';
	import Camera from '@lucide/svelte/icons/camera';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import IngredientSheet from './IngredientSheet.svelte';
	import RecipeImage from './RecipeImage.svelte';
	import StepIngredientsSheet from './StepIngredientsSheet.svelte';

	type Props = {
		/** The recipe being edited; null when creating or importing. */
		recipe: RecipeDetail | null;
		/**
		 * An imported draft to open on [plan 12] — name, raw ingredient/step text
		 * and an already-downloaded photo, seeded over a null `recipe`. The preview
		 * _is_ the editor, so every imperfect parse is a two-second fix (→ SPEC §4.7).
		 */
		prefill?: RecipePrefill;
		/** Where Cancel returns to — the recipe, or wherever "New" was pressed. */
		back: string;
		/** Message from a rejected save, and which field it is about. */
		error?: string;
		field?: RecipeFormField;
		/**
		 * A one-line notice above the form — the AI import's "check before saving"
		 * reminder (→ plan 13). Absent for the new/edit routes.
		 */
		notice?: string;
	};

	let { recipe, prefill, back, error, field, notice }: Props = $props();

	const m = messages();

	// A rejected photo must not redden the name field: they sit a screen apart,
	// and marking a perfectly good name `aria-invalid` sends a screen reader
	// after the wrong thing.
	const nameError = $derived(field === 'photo' ? undefined : error);
	const photoError = $derived(field === 'photo' ? error : undefined);

	/** A row keeps its own key so reordering moves the DOM node, not the text. */
	type Row = { key: string; text: string };
	/**
	 * A step also carries what it uses (→ SPEC §4.4): null while it reads its own
	 * text, a list — possibly empty — once someone has said. Pins name ingredient
	 * *rows*, so they survive a reorder and go away with a removal.
	 */
	type StepRow = Row & { uses: StepUseDraft[] | null };

	let nextKey = 0;
	/** A counter rather than randomness: the server and the browser agree on it. */
	const row = (text = ''): Row => ({ key: `r${nextKey++}`, text });
	const stepRow = (text = '', uses: StepUseDraft[] | null = null): StepRow => ({
		...row(text),
		uses
	});

	/**
	 * Which row each *stored* ingredient became, filled while the rows below are
	 * seeded — the one moment a saved step's pins (which name ids) can be
	 * translated into the keys this form works in.
	 */
	const rowForIngredientId = new Map<string, string>();

	// Seeded from the import draft when there is one, else from the recipe being
	// edited, else empty. An imported ingredient stays the *raw line* the site
	// wrote — the editor parses it for the amount chip exactly as it parses a
	// typed line, so an imperfect parse is visible and fixable (→ SPEC §4.7).
	let name = $state(untrack(() => prefill?.name ?? recipe?.name ?? ''));
	let time = $state(
		untrack(() => numberField(prefill ? prefill.timeMinutes : recipe?.timeMinutes))
	);
	let servings = $state(untrack(() => numberField(prefill ? prefill.servings : recipe?.servings)));
	let ingredients = $state<Row[]>(
		untrack(() => {
			if (prefill) {
				return prefill.ingredientLines.length
					? prefill.ingredientLines.map((line) => row(line))
					: [row()];
			}

			if (!recipe?.ingredients.length) return [row()];

			return recipe.ingredients.map((ingredient) => {
				const created = row(m.units.ingredient(ingredient));
				rowForIngredientId.set(ingredient.id, created.key);
				return created;
			});
		})
	);
	let steps = $state<StepRow[]>(
		untrack(() => {
			// An imported draft has text and nothing else, which is exactly what the
			// matcher is for: its steps arrive reading themselves.
			if (prefill) {
				return prefill.steps.length ? prefill.steps.map((text) => stepRow(text)) : [stepRow()];
			}

			if (!recipe?.steps.length) return [stepRow()];

			return recipe.steps.map((step) =>
				stepRow(
					step.text,
					// A pin whose ingredient is gone (deleted on the other phone between
					// the save and this load) is dropped rather than shown as a blank.
					step.uses?.flatMap((use) => {
						const key = rowForIngredientId.get(use.ingredientId);
						return key ? [{ ingredient: key, quantity: use.quantity }] : [];
					}) ?? null
				)
			);
		})
	);

	/** A stored count as the text its field shows — empty for "not stated". */
	function numberField(value: number | null | undefined): string {
		return value?.toString() ?? '';
	}

	let fileInput: HTMLInputElement | undefined = $state();
	let picked = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	/** The stored photo is on its way out — posted as `removePhoto`. */
	let removed = $state(false);
	let submitting = $state(false);

	/**
	 * The chosen file, shown before it's uploaded. The object URL is revoked when
	 * it's replaced or the form leaves — a few megabytes of image per pick that
	 * the browser would otherwise hold until a reload.
	 */
	$effect(() => {
		if (!picked) {
			previewUrl = null;
			return;
		}

		const url = URL.createObjectURL(picked);
		previewUrl = url;

		return () => URL.revokeObjectURL(url);
	});

	/** The imported photo's preview [plan 12], shown until a pick or a removal. */
	const initialPhoto = $derived(prefill?.photo?.preview ?? null);

	const photo = $derived(
		previewUrl ?? (removed ? null : recipe?.imagePath ? uploadUrl(recipe.imagePath) : initialPhoto)
	);

	/**
	 * Read out of the event rather than `bind:files`: clearing a file input means
	 * writing its `value`, and a two-way binding would then try to write the
	 * FileList back.
	 */
	function pickPhoto(event: Event & { currentTarget: HTMLInputElement }) {
		picked = event.currentTarget.files?.[0] ?? null;
		if (picked) removed = false;
	}

	function dropPhoto() {
		if (fileInput) fileInput.value = '';
		picked = null;
		removed = true;
	}

	const uid = $props.id();
	const fieldId = (kind: 'ingredient' | 'step', key: string) => `${uid}-${kind}-${key}`;
	const amountId = (key: string) => `${uid}-amount-${key}`;

	/**
	 * Which row's sheet is up — `null` for none. Keyed rather than indexed, so
	 * reordering a row while its sheet is open can't retarget it. One per sheet:
	 * an ingredient's amount, and a step's ingredients.
	 */
	let editing = $state<string | null>(null);
	let pinning = $state<string | null>(null);

	/** Insert after `index`, then put the caret in it — Enter walks down the list. */
	function add<T extends Row>(
		rows: T[],
		kind: 'ingredient' | 'step',
		make: () => T,
		index = rows.length - 1
	): T[] {
		const fresh = make();
		const next = [...rows.slice(0, index + 1), fresh, ...rows.slice(index + 1)];

		// After the DOM has the new row: focus is the whole point of adding one.
		requestAnimationFrame(() => document.getElementById(fieldId(kind, fresh.key))?.focus());

		return next;
	}

	/** Never leave the list empty — an empty list has nothing to type into. */
	function remove<T extends Row>(rows: T[], index: number, make: () => T): T[] {
		const next = rows.filter((_, at) => at !== index);
		return next.length ? next : [make()];
	}

	function move<T extends Row>(rows: T[], index: number, direction: -1 | 1): T[] {
		const to = index + direction;
		if (to < 0 || to >= rows.length) return rows;

		const next = [...rows];
		[next[index], next[to]] = [next[to], next[index]];
		return next;
	}

	/**
	 * A removed ingredient takes its pins with it. Not strictly required — the
	 * save drops a pin whose row is gone either way — but a chip for a line that
	 * is no longer on screen is a lie while you're still looking at it.
	 */
	function unpin(key: string) {
		for (const step of steps) {
			if (step.uses) step.uses = step.uses.filter((use) => use.ingredient !== key);
		}
	}

	/**
	 * The ingredient rows as they'd be stored — what the sheet offers and what the
	 * matcher reads steps against. Blank lines are left out: they aren't
	 * ingredients yet, and the save drops them.
	 */
	const choices = $derived<StepChoice[]>(
		ingredients.flatMap((item) => {
			const parsed = item.text.trim() ? parseIngredient(item.text) : null;
			return parsed ? [{ key: item.key, ...parsed }] : [];
		})
	);

	/** Where each row currently sits — the index the pins post as. */
	const positions = $derived(new Map(ingredients.map((item, at) => [item.key, at])));

	/**
	 * What a step's text reads as, for a step nobody has pinned. The same
	 * `highlightStep` cook mode runs, so the chips under the field are the
	 * underlines you'll get — and the seed the sheet opens on.
	 */
	function suggest(text: string): StepUseDraft[] {
		return highlightStep(text, choices).used.map((choice) => ({
			ingredient: choice.key,
			quantity: null
		}));
	}

	/** The chips under one step: its pins, or its reading, as name + amount. */
	function chips(step: StepRow): { key: string; name: string; amount: string }[] {
		return (step.uses ?? suggest(step.text)).flatMap((use) => {
			const choice = choices.find((item) => item.key === use.ingredient);
			if (!choice) return [];

			return [
				{
					key: choice.key,
					name: choice.name,
					// Only a share worth saying: a pin that takes the whole row says
					// nothing, because the ingredient list already does.
					amount: use.quantity === null ? '' : m.units.amount(use.quantity, choice.unit)
				}
			];
		});
	}

	/**
	 * One step's pins on the wire: row keys become the indices the save maps back
	 * to ingredients, and an empty string means "read the text" (→
	 * `readRecipeForm`). A pin whose row was deleted just after the sheet closed
	 * is dropped here rather than posted as a dangling index.
	 */
	function postedUses(step: StepRow): string {
		if (!step.uses) return '';

		return JSON.stringify(
			step.uses.flatMap((use) => {
				const at = positions.get(use.ingredient);
				return at === undefined ? [] : [{ ingredient: at, quantity: use.quantity }];
			})
		);
	}

	/** Textareas grow with their step instead of scrolling inside two lines. */
	function autogrow(node: HTMLTextAreaElement) {
		const resize = () => {
			node.style.height = 'auto';
			node.style.height = `${node.scrollHeight}px`;
		};

		resize();
		node.addEventListener('input', resize);
		return { destroy: () => node.removeEventListener('input', resize) };
	}
</script>

<form
	method="POST"
	action="?/save"
	enctype="multipart/form-data"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			// A successful save redirects; a rejected one comes back with `error`
			// and everything typed still on screen.
			await update({ reset: false });
			submitting = false;
		};
	}}
>
	<header>
		<a class="cancel" href={back}>{m.common.cancel}</a>
		<h1>{recipe ? m.cooking.form.edit : m.cooking.form.new}</h1>
		<button type="submit" class="save" disabled={submitting || !name.trim()}>
			{m.cooking.form.save}
		</button>
	</header>

	{#if notice}
		<!-- The AI import's quiet reminder [plan 13]: extraction is a starting point,
			 not a saved recipe. Not a Banner — it's a note, not a failure. -->
		<p class="notice">{notice}</p>
	{/if}

	<label class="photo">
		<input
			bind:this={fileInput}
			type="file"
			name="photo"
			accept="image/*"
			aria-label={m.cooking.form.photo}
			onchange={pickPhoto}
		/>
		<!-- The same striped placeholder every other missing photo gets [3c]. -->
		<span class="art"><RecipeImage imagePath={null} stripe={7} /></span>
		{#if photo}
			<img src={photo} alt="" />
			<span class="change">{m.cooking.form.changePhoto}</span>
		{:else}
			<span class="lens" aria-hidden="true"><Camera size={20} strokeWidth={1.9} /></span>
			<span class="hint">{m.cooking.form.addPhoto}</span>
		{/if}
	</label>

	<div class="photo-foot">
		{#if photoError}<p class="photo-error">{photoError}</p>{/if}
		{#if photo}
			<button type="button" class="drop" onclick={dropPhoto}>{m.cooking.form.removePhoto}</button>
		{/if}
	</div>
	<input type="hidden" name="removePhoto" value={removed ? '1' : ''} />
	{#if prefill?.photo}
		<!-- The already-downloaded photo's temp path — the save action attaches it
			 unless a fresh pick or a removal supersedes it (→ plan 12). -->
		<input type="hidden" name="importedPhoto" value={prefill.photo.path} />
	{/if}

	<TextField
		label={m.cooking.form.name}
		name="name"
		bind:value={name}
		error={nameError}
		placeholder={m.cooking.form.namePlaceholder}
		maxlength={RECIPE_NAME_MAX}
		autocomplete="off"
		required
	/>

	<div class="pair">
		<TextField
			label={m.cooking.form.time}
			name="timeMinutes"
			type="number"
			bind:value={time}
			placeholder="30"
			inputmode="numeric"
			min={0}
			max={RECIPE_TIME_MAX}
		/>
		<TextField
			label={m.cooking.form.servingsLabel}
			name="servings"
			type="number"
			bind:value={servings}
			placeholder="4"
			inputmode="numeric"
			min={0}
			max={RECIPE_SERVINGS_MAX}
		/>
	</div>

	<h2 class="label">{m.cooking.form.ingredients}</h2>
	<ul class="rows">
		{#each ingredients as item, index (item.key)}
			{@const parsed = item.text.trim() ? parseIngredient(item.text) : null}
			{@const amount = parsed ? m.units.amount(parsed.quantity, parsed.unit) : ''}
			<li class="row">
				<input
					id={fieldId('ingredient', item.key)}
					class="line"
					type="text"
					name="ingredient"
					bind:value={item.text}
					placeholder={m.cooking.form.ingredientPlaceholder}
					aria-label={m.cooking.form.ingredientLabel(index + 1)}
					aria-describedby={item.text.trim() ? amountId(item.key) : undefined}
					maxlength={INGREDIENT_LINE_MAX}
					autocomplete="off"
					onkeydown={(event) => {
						if (event.key !== 'Enter') return;
						// Enter in a single-line field would submit the whole form;
						// walking to the next ingredient is what's meant here.
						event.preventDefault();
						if (ingredients.length < INGREDIENTS_MAX) {
							ingredients = add(ingredients, 'ingredient', () => row(), index);
						}
					}}
				/>
				{#if item.text.trim()}
					<!-- The receipt: what the line was understood to measure, rendered
						 by the same `m.units.amount` the recipe [7a] and the peek sheet
						 [7b] use — so the form says what the recipe will say.

						 A plain button, not one gated on hydration: the reorder and remove
						 controls beside it, and "Add ingredient" below, all need a script
						 too, and none of them pretends otherwise. -->
					<button
						type="button"
						id={amountId(item.key)}
						class="amount"
						class:empty={!amount}
						aria-label={m.cooking.form.amountLabel(amount)}
						onclick={() => (editing = item.key)}
					>
						<!-- The em dash a Stepper shows for "no quantity", same reason. -->
						{amount || '—'}
					</button>
				{/if}
				{@render controls(index, ingredients.length, 'ingredient', (direction) => {
					if (direction) {
						ingredients = move(ingredients, index, direction);
						return;
					}

					// A row removed under an open sheet would strand `editing`, and its
					// chips would outlive it on every step that named it.
					if (ingredients[index].key === editing) editing = null;
					unpin(ingredients[index].key);
					ingredients = remove(ingredients, index, () => row());
				})}
			</li>
		{/each}
	</ul>

	{#if ingredients.length < INGREDIENTS_MAX}
		<button
			type="button"
			class="add"
			onclick={() => (ingredients = add(ingredients, 'ingredient', () => row()))}
		>
			<Plus size={16} strokeWidth={2.2} />{m.cooking.form.addIngredient}
		</button>
	{/if}

	<p class="units">
		{m.cooking.form.ingredientsNote(
			RECIPE_UNITS.map((unit) => unitLabel(unit, m.units.labels)).join(' · ')
		)}
	</p>

	<h2 class="label">{m.cooking.form.steps}</h2>
	<ol class="steps">
		{#each steps as step, index (step.key)}
			{@const uses = chips(step)}
			<li class="step">
				<span class="number" aria-hidden="true">{index + 1}</span>
				<div class="field">
					<textarea
						id={fieldId('step', step.key)}
						name="step"
						bind:value={step.text}
						use:autogrow
						rows="2"
						placeholder={m.cooking.form.stepPlaceholder}
						aria-label={m.cooking.form.stepLabel(index + 1)}
						maxlength={STEP_TEXT_MAX}></textarea>

					<!-- What cook mode will show while you're on this step. Read out of
						 the text until it's pinned (→ SPEC §4.4, DECISIONS #127), which
						 is what the "auto" marker says — and why the whole row is one
						 button rather than a chip apiece: the sheet does the editing, and
						 a wet thumb wants one target, not six. -->
					<button
						type="button"
						class="uses"
						class:pinned={step.uses !== null}
						aria-label={m.cooking.form.usesLabel(index + 1)}
						onclick={() => (pinning = step.key)}
					>
						{#if uses.length}
							{#each uses as use (use.key)}
								<span class="chip">
									{use.name}{#if use.amount}<b>{use.amount}</b>{/if}
								</span>
							{/each}
						{:else}
							<span class="chip empty">
								{step.uses ? m.cooking.form.usesNothing : m.cooking.form.usesNone}
							</span>
						{/if}
						<!-- Only where there is a reading to explain: on an empty step it
							 would be labelling the invitation. -->
						{#if step.uses === null && uses.length}
							<span class="auto">{m.cooking.form.usesAuto}</span>
						{/if}
					</button>

					<!-- One per step, always — `readRecipeForm` lines the two lists up by
						 position, so a step that reads its own text still has to post. -->
					<input type="hidden" name="stepUses" value={postedUses(step)} />
				</div>
				<span class="step-controls">
					{@render controls(index, steps.length, 'step', (direction) => {
						if (direction) {
							steps = move(steps, index, direction);
							return;
						}

						if (steps[index].key === pinning) pinning = null;
						steps = remove(steps, index, () => stepRow());
					})}
				</span>
			</li>
		{/each}
	</ol>

	{#if steps.length < STEPS_MAX}
		<button type="button" class="add" onclick={() => (steps = add(steps, 'step', () => stepRow()))}>
			<Plus size={16} strokeWidth={2.2} />{m.cooking.form.addStep}
		</button>
	{/if}

	<div class="submit">
		<Button type="submit" disabled={submitting || !name.trim()}>
			{recipe ? m.common.saveChanges : m.cooking.form.saveRecipe}
		</Button>
	</div>
</form>

<!-- Outside the <form> on purpose: nothing in the sheet carries a `name`, so no
	 field of it can reach `form.getAll('ingredient')` and Enter inside it cannot
	 submit the recipe (→ DECISIONS #100). -->
{#if editing}
	{@const at = ingredients.findIndex((item) => item.key === editing)}
	{#if at >= 0}
		<IngredientSheet
			line={ingredients[at].text}
			index={at + 1}
			onsave={(line) => (ingredients[at].text = line)}
			onclose={() => (editing = null)}
		/>
	{/if}
{/if}

{#if pinning}
	{@const at = steps.findIndex((step) => step.key === pinning)}
	{#if at >= 0}
		<StepIngredientsSheet
			index={at + 1}
			ingredients={choices}
			uses={steps[at].uses}
			suggested={suggest(steps[at].text)}
			onsave={(uses) => (steps[at].uses = uses)}
			onauto={() => (steps[at].uses = null)}
			onclose={() => (pinning = null)}
		/>
	{/if}
{/if}

<!-- The reorder/remove trio beside every ingredient and every step. Each label
	 names the row it acts on, because thirty identical chevrons read out as
	 thirty identical chevrons. -->
{#snippet controls(
	index: number,
	total: number,
	kind: 'ingredient' | 'step',
	act: (direction: -1 | 1 | 0) => void
)}
	{@const labels =
		kind === 'ingredient'
			? {
					up: m.cooking.form.moveIngredientUp,
					down: m.cooking.form.moveIngredientDown,
					remove: m.cooking.form.removeIngredient
				}
			: {
					up: m.cooking.form.moveStepUp,
					down: m.cooking.form.moveStepDown,
					remove: m.cooking.form.removeStep
				}}
	<button
		type="button"
		class="control"
		disabled={index === 0}
		aria-label={labels.up(index + 1)}
		onclick={() => act(-1)}
	>
		<ChevronUp size={15} strokeWidth={2.2} />
	</button>
	<button
		type="button"
		class="control"
		disabled={index === total - 1}
		aria-label={labels.down(index + 1)}
		onclick={() => act(1)}
	>
		<ChevronDown size={15} strokeWidth={2.2} />
	</button>
	<button
		type="button"
		class="control"
		aria-label={labels.remove(index + 1)}
		onclick={() => act(0)}
	>
		<X size={15} strokeWidth={2.2} />
	</button>
{/snippet}

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 0 14px;
	}

	.cancel {
		font-size: calc(15px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	h1 {
		font-size: calc(17px * var(--fs));
	}

	.save {
		font-size: calc(15px * var(--fs));
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
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		color: var(--text-4);
	}

	.photo {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 140px;
		overflow: hidden;
		border-radius: var(--r-card-lg);
		cursor: pointer;
	}

	.art {
		position: absolute;
		inset: 0;
	}

	.photo input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.photo:focus-within {
		outline: 2px solid var(--sage);
		outline-offset: 2px;
	}

	.photo img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.lens {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--sage);
	}

	.hint {
		font-size: calc(12.5px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	/* Sits on the photo, so it needs its own surface to stay readable. */
	.change {
		position: relative;
		align-self: flex-end;
		margin: auto 12px 12px auto;
		padding: 7px 12px;
		border-radius: var(--r-chip);
		background: var(--tabbar-bg);
		backdrop-filter: blur(6px);
		font-size: calc(12.5px * var(--fs));
		font-weight: 700;
		color: var(--ink);
	}

	.photo-foot {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		min-height: 12px;
		margin-bottom: 12px;
	}

	.photo-error {
		margin: 0;
		padding-left: 4px;
		font-size: calc(13px * var(--fs));
		color: var(--danger-deep);
	}

	.drop {
		margin-left: auto;
		padding: 4px;
		font-size: calc(12.5px * var(--fs));
		font-weight: 600;
		color: var(--danger);
	}

	.pair {
		display: flex;
		gap: 14px;
		margin-top: 18px;
	}

	.pair > :global(*) {
		flex: 1;
		min-width: 0;
	}

	.label {
		margin: 24px 0 8px;
		font-family: var(--font-body);
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.rows {
		margin: 0;
		padding: 0;
		overflow: hidden;
		border-radius: var(--r-block);
		background: var(--card);
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px 4px 14px;
	}

	.row + .row {
		border-top: 1px solid var(--divider);
	}

	.line {
		flex: 1;
		min-width: 0;
		padding: 12px 0;
		border: none;
		background: none;
		font-size: calc(14.5px * var(--fs));
		font-weight: 500;
		color: var(--ink);
	}

	.line:focus {
		outline: none;
	}

	.line::placeholder {
		color: var(--text-disabled);
	}

	/* Sits where [7a] prints the amount. Quiet — it confirms, it doesn't ask. */
	.amount {
		flex: none;
		max-width: 76px;
		overflow: hidden;
		margin-left: 8px;
		padding: 5px 9px;
		border-radius: var(--r-chip);
		background: var(--sunken);
		font-size: calc(12.5px * var(--fs));
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
		/* The digits must not jitter while the reading updates under a thumb. */
		font-variant-numeric: tabular-nums;
		color: var(--text-4);
	}

	.amount.empty {
		background: none;
		color: var(--text-disabled);
	}

	.amount:active {
		background: var(--sunken-2);
	}

	.control {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		color: var(--text-5);
	}

	.control:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.control:not(:disabled):active {
		background: var(--sunken);
	}

	.add {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 12px 0 0 4px;
		padding: 4px;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}

	.units {
		margin: 10px 4px 0;
		font-size: calc(12px * var(--fs));
		line-height: 1.5;
		color: var(--text-5);
	}

	.steps {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.step {
		display: flex;
		align-items: flex-start;
		gap: 11px;
		margin-bottom: 10px;
	}

	/* The step's text and what it uses are one field with two parts, so the
	   controls beside them stay a column against the pair. */
	.field {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}

	.number {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 24px;
		height: 24px;
		margin-top: 10px;
		border-radius: 50%;
		background: var(--sunken);
		font-size: calc(12px * var(--fs));
		font-weight: 700;
		color: var(--text-4);
	}

	textarea {
		/* Grown by `autogrow`; this is the floor, not the ceiling — and it's the
		   height of the three controls beside it, so a one-line step doesn't
		   leave them dangling below the field. */
		min-height: 84px;
		padding: 12px 14px;
		border: none;
		border-radius: var(--r-input);
		background: var(--card);
		font-size: calc(14px * var(--fs));
		line-height: 1.4;
		color: var(--text-2);
		resize: none;
	}

	textarea:focus {
		outline: 1.5px solid var(--sage);
	}

	textarea::placeholder {
		color: var(--text-disabled);
	}

	/* Under the step, indented to its text: the same left edge, so the chips read
	   as belonging to the sentence above them rather than to the list. */
	.uses {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
		padding: 4px 6px 2px;
		text-align: left;
	}

	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 5px;
		padding: 4px 10px;
		border-radius: var(--r-chip);
		background: var(--sunken);
		font-size: calc(12px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
		overflow-wrap: anywhere;
	}

	/* Pinned by hand — the same sage the app uses everywhere for "chosen". */
	.pinned .chip {
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.chip b {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.chip.empty {
		background: none;
		padding-left: 0;
		font-weight: 500;
		color: var(--text-disabled);
	}

	/* Says where the chips came from, quietly. It disappears the moment the list
	   is the cook's own. */
	.auto {
		font-size: calc(10px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.step-controls {
		display: flex;
		flex-direction: column;
		flex: none;
		margin-top: 6px;
	}

	.submit {
		margin-top: 28px;
	}
</style>
