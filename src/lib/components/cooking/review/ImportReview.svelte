<!--
	The import's review [R1]–[R3] (→ plan 45, SPEC §4.7): an imported recipe as
	it will look, not a form. Save is at the top and always works; what the
	gate could not vouch for is marked on the thing itself, counted in the
	banner, and settled where it stands with one tap. Tapping anything else
	edits that one thing in a sheet (an ingredient: plan 46's ingredient sheet;
	a step: its text, its links one tap further; the name line: name, time,
	servings). "Edit everything" opens the full editor on the same state.

	The rows and steps are drawn by the recipe view's own components
	(`RecipeIngredientRow`, `RecipeStepRow`, `viewRuns`), so the saved recipe
	looks like the review did.

	The draft lives in `sessionStorage` under the import's id (`?draft=`), so a
	reload, or the app going to the background while a message comes in, loses
	nothing; Save and Discard drop it. Nothing reaches the server before Save
	but the temp photo, and a unit word the household adds on purpose.

	A saved recipe's tidy (→ plan 48) is the same review under the recipe's own
	address, given the `recipe`: Save posts to that route, which updates the
	recipe in place; the photo, tags and diet shown and posted are the
	recipe's own, and Discard goes back to it.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeDetail } from '$lib/server/services/recipes';
	import { unitWordKey } from '$lib/utils/amounts';
	import {
		flatten,
		hasParts,
		linkTargets,
		partNames,
		postedFields,
		savedLinks,
		suggesting,
		type EditorStep
	} from '$lib/utils/recipe-editor';
	import {
		addUnitWord,
		chooseOther,
		counts,
		draftKey,
		editBasics,
		editIngredient,
		editStepText,
		findIngredient,
		findStep,
		freshKeys,
		itemsOn,
		keep,
		notes,
		openChecks,
		putBack,
		readStored,
		removeAdded,
		removeIngredient,
		removeStep,
		setServings,
		setStepLinks,
		sourceOf,
		startReview,
		stillLeftOut,
		useAnswer,
		withoutEmptySteps,
		usePageText,
		type Review,
		type ReviewItem,
		type StoredImport
	} from '$lib/utils/recipe-review';
	import { uploadUrl, type RecipeFormField } from '$lib/utils/recipes';
	import { viewRuns } from '$lib/utils/step-links';
	import { formatDuration } from '$lib/utils/timer-parse';
	import { onMount } from 'svelte';
	import IngredientSheet from '../IngredientSheet.svelte';
	import RecipeForm from '../RecipeForm.svelte';
	import RecipeIngredientRow from '../RecipeIngredientRow.svelte';
	import RecipeStepRow from '../RecipeStepRow.svelte';
	import StepLinkSheet from '../StepLinkSheet.svelte';
	import BasicsSheet from './BasicsSheet.svelte';
	import CheckBanner from './CheckBanner.svelte';
	import CheckRow from './CheckRow.svelte';
	import FoldList from './FoldList.svelte';
	import StepSheet from './StepSheet.svelte';

	type Props = {
		/** The import's id: its draft's key in `sessionStorage`. */
		id: string;
		/** The full editor, on the same draft ("Edit everything"). */
		edit: boolean;
		/** The household's own unit words, as added. */
		units: string[];
		/** A rejected save, and which field it is about. */
		error?: string;
		field?: RecipeFormField;
		/** The saved recipe this draft tidies (→ plan 48); absent for an import. */
		recipe?: RecipeDetail | null;
	};

	let { id, edit, units, error, field, recipe = null }: Props = $props();

	const m = messages();
	const t = m.cooking.import.review;

	/** Undefined until the browser has looked; null when this tab holds no such import. */
	let stored = $state<StoredImport | null | undefined>(undefined);
	let review = $state<Review | null>(null);
	/** Keys of this opening's own, so a put-back step never meets a stored one. */
	const key = freshKeys();

	let own = $state<string[]>([]);
	const known = $derived(new Set(own.map(unitWordKey)));

	onMount(() => {
		own = [...units];
		let raw: string | null = null;
		try {
			raw = sessionStorage.getItem(draftKey(id));
		} catch {
			// Storage refused (a private window): nothing to open.
		}
		// A tidy opens only under its own recipe's address (→ plan 48).
		const found = readStored(raw);
		const mine = found && (found.draft.recipeId ?? null) === (recipe?.id ?? null);
		stored = mine ? found : null;
		if (found && mine) review = found.review ?? startReview(found.draft, key, known);
	});

	// Every change is written back at once: a reload or a trip to another app keeps it.
	$effect(() => {
		if (!stored || !review) return;
		const value: StoredImport = { v: 1, draft: stored.draft, review: $state.snapshot(review) };
		try {
			sessionStorage.setItem(draftKey(id), JSON.stringify(value));
		} catch {
			// Full or refused: the review still works, it just won't survive a reload.
		}
	});

	function drop() {
		try {
			sessionStorage.removeItem(draftKey(id));
		} catch {
			// Nothing to drop.
		}
	}

	function discard() {
		drop();
		stored = null;
		void goto(home, { replaceState: true });
	}

	/* ── What the screen shows ── */

	const prefill = $derived(stored?.draft.prefill ?? null);
	/** What the draft was read from: the banner and the questions name it. */
	const from = $derived(stored ? sourceOf(stored.draft) : 'page');
	/** Where Discard goes: the recipe a tidy came from, or the library. */
	const home = $derived(recipe ? `/cooking/recipes/${recipe.id}` : '/cooking/recipes');
	const hero = $derived(
		recipe
			? recipe.imagePath
				? uploadUrl(recipe.imagePath)
				: null
			: (prefill?.photo?.preview ?? null)
	);
	const open = $derived(review ? openChecks(review) : []);
	const asked = $derived(review?.items.some((item) => item.level === 'check') ?? false);
	const withParts = $derived(review ? hasParts(review.editor) : false);
	const targets = $derived(review ? linkTargets(review.editor.ingredients) : []);
	/** The rows as the recipe view's step renderer reads them. */
	const rows = $derived(
		review
			? flatten(review.editor.ingredients).map(({ row }) => ({
					id: row.id,
					name: row.name,
					quantity: row.quantity,
					unit: row.unit
				}))
			: []
	);
	/** Steps numbered straight through, under their parts. */
	const stepParts = $derived.by(() => {
		let number = 0;
		return (review?.editor.steps ?? []).map((part) => ({
			...part,
			rows: part.rows.map((step) => ({ step, number: ++number }))
		}));
	});
	const recipeItems = $derived(
		review ? itemsOn(review, 'recipe').filter((item) => item.level === 'check') : []
	);
	const flags = $derived(
		new Set((review?.items ?? []).filter((item) => item.level === 'info').map((item) => item.kind))
	);

	/** The line under the count. */
	const line = $derived.by(() => {
		if (!review) return '';
		if (flags.has('no-ai')) return t.noAi;
		if (flags.has('from-photo')) return t.fromPhoto;
		if (open.length) return t.restMatches(from);
		if (asked) return t.ready;
		const { ingredients, steps } = counts(review);
		return t.allMatch(from, ingredients, steps);
	});

	const meta = $derived(
		review
			? [
					review.timeMinutes ? m.cooking.cookTime(review.timeMinutes) : null,
					review.servings ? m.cooking.serves(review.servings) : null,
					stored?.draft.site ?? null
				]
					.filter(Boolean)
					.join(' · ')
			: ''
	);

	/** A step as the saved recipe will hold it: its links, and the offers that save with it. */
	function asSaved(step: EditorStep) {
		return {
			text: step.text,
			uses: savedLinks(step, targets, known).map((link) => ({
				ingredientId: link.ingredient,
				quantity: link.quantity,
				phrase: link.phrase,
				amountPhrase: link.amountPhrase
			}))
		};
	}

	function timerOf(step: EditorStep, number: number): string | null {
		return step.timer
			? m.cooking.form.timerChip(
					step.timer.label ?? m.cooking.cook.timerForStep(number),
					formatDuration(step.timer.seconds)
				)
			: null;
	}

	function showFirst() {
		const first = document.querySelector<HTMLElement>('[data-open-check]');
		first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		first?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
	}

	/* ── Answers ── */

	function answer(change: (review: Review) => Review) {
		if (review) review = change(review);
	}

	/** The one-tap answers of one item, as `CheckRow` calls them. */
	function handlers(item: ReviewItem) {
		return {
			onkeep: () => answer((r) => keep(r, item.id)),
			onother: () => answer((r) => chooseOther(r, item.id)),
			onanswer: () => answer((r) => useAnswer(r, item.id)),
			onremove: () => answer((r) => removeAdded(r, item.id)),
			onpage: () => answer((r) => usePageText(r, item.id)),
			onedit: () => (editing = item.ingredient ?? null),
			onunit: (word: string) => {
				if (!own.some((one) => unitWordKey(one) === unitWordKey(word))) own = [...own, word];
				answer((r) => addUnitWord(r, item.id, word));
			},
			onservings: (servings: number) => answer((r) => setServings(r, servings)),
			onsteps: () => {
				answer((r) => keep(r, item.id));
				editEverything();
			}
		};
	}

	function editEverything() {
		void goto(`?draft=${encodeURIComponent(id)}&edit=1`, { replaceState: true });
	}

	/* ── Sheets ── */

	let editing = $state<string | null>(null);
	let stepping = $state<string | null>(null);
	let linking = $state<string | null>(null);
	let basics = $state(false);

	/* ── Save ── */

	let submitting = $state(false);
	const fields = $derived(review ? postedFields(review.editor, known) : []);
</script>

{#if edit && review && prefill}
	<RecipeForm
		{recipe}
		{prefill}
		units={own}
		back="?draft={encodeURIComponent(id)}"
		{error}
		{field}
		notice={stored?.draft.notice ?? undefined}
		opened={{
			name: review.name,
			timeMinutes: review.timeMinutes,
			servings: review.servings,
			editor: review.editor
		}}
		onchange={(state) => {
			if (review) review = { ...review, ...state, editor: withoutEmptySteps(state.editor) };
		}}
		onsaved={drop}
	/>
{:else if review && prefill}
	<form
		id="review-save"
		method="POST"
		action="?/save"
		enctype="multipart/form-data"
		use:enhance={({ cancel }) => {
			// "Save at the top always works": a nameless draft asks for its name first.
			if (!review?.name.trim()) {
				cancel();
				basics = true;
				return;
			}
			submitting = true;
			return async ({ result, update }) => {
				if (result.type === 'redirect') drop();
				await update({ reset: false });
				submitting = false;
			};
		}}
	>
		<input type="hidden" name="name" value={review.name} />
		<input type="hidden" name="timeMinutes" value={review.timeMinutes ?? ''} />
		<input type="hidden" name="servings" value={review.servings ?? ''} />
		{#each fields as [fieldName, value], at (at)}
			<input type="hidden" name={fieldName} {value} />
		{/each}
		<!-- A tidy keeps the recipe's own tags and diet; an import saves what it suggested. -->
		{#each (recipe ? recipe.tags : prefill.suggested?.tags) ?? [] as tag (tag)}
			<input type="hidden" name="tag" value={tag} />
		{/each}
		<input
			type="hidden"
			name="diet"
			value={(recipe ? recipe.diet : prefill.suggested?.diet) ?? ''}
		/>
		{#if prefill.photo && !recipe}
			<input type="hidden" name="importedPhoto" value={prefill.photo.path} />
		{/if}
	</form>

	<header>
		<button type="button" class="quiet" onclick={discard}>{t.discard}</button>
		<h1>{t.title}</h1>
		<button type="submit" form="review-save" class="save" disabled={submitting}>{t.save}</button>
	</header>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	{#if hero}
		<img class="hero" src={hero} alt="" />
	{/if}

	<button type="button" class="basics" aria-label={t.editBasics} onclick={() => (basics = true)}>
		<span class="name">{review.name}</span>
		{#if meta}<span class="meta">{meta}</span>{/if}
	</button>

	{#if stored?.draft.notice}
		<p class="notice">{stored.draft.notice}</p>
	{/if}

	<CheckBanner open={open.length} {asked} {line} onshow={showFirst} />

	{#if recipeItems.some((item) => item.kind === 'servings')}
		<h2 class="label">{t.recipe}</h2>
		<Card radius="md">
			<div class="recipe-items">
				{#each recipeItems.filter((item) => item.kind === 'servings') as item (item.id)}
					<CheckRow {item} {from} servings={review.servings} {...handlers(item)} />
				{/each}
			</div>
		</Card>
	{/if}

	{#if review.editor.ingredients.some((part) => part.rows.length)}
		<h2 class="label">{t.ingredients}</h2>
		{#each review.editor.ingredients.filter((part) => part.rows.length) as part (part.id)}
			{#if part.name}<h3 class="part">{part.name}</h3>{/if}
			<Card radius="md">
				<ul class="ingredients">
					{#each part.rows as row (row.id)}
						<RecipeIngredientRow
							name={row.name}
							note={row.note}
							amount={m.units.amount(row.quantity, row.unit)}
							label={t.editIngredient(row.name)}
							onclick={() => (editing = row.id)}
						>
							{#each itemsOn( review, { ingredient: row.id } ).filter((item) => item.level === 'check') as item (item.id)}
								<CheckRow {item} {from} {row} {...handlers(item)} />
							{/each}
						</RecipeIngredientRow>
					{/each}
				</ul>
			</Card>
		{/each}
	{/if}

	{#if stepParts.length || recipeItems.some((item) => item.kind === 'no-steps')}
		<h2 class="label">{t.steps}</h2>
		{#each recipeItems.filter((item) => item.kind === 'no-steps') as item (item.id)}
			<Card radius="md">
				<div class="recipe-items"><CheckRow {item} {from} {...handlers(item)} /></div>
			</Card>
		{/each}
		{#each stepParts as part (part.id)}
			{#if part.name}<h3 class="part">{part.name}</h3>{/if}
			<ol class="steps" start={part.rows[0]?.number}>
				{#each part.rows as { step, number } (step.id)}
					<RecipeStepRow
						{number}
						runs={viewRuns(asSaved(step), rows, 1)}
						timer={timerOf(step, number)}
						label={t.editStep(number)}
						onclick={() => (stepping = step.id)}
					>
						{#each itemsOn( review, { step: step.id } ).filter((item) => item.level === 'check') as item (item.id)}
							<CheckRow {item} {from} {...handlers(item)} />
						{/each}
					</RecipeStepRow>
				{/each}
			</ol>
		{/each}
	{/if}

	{@const left = stillLeftOut(review)}
	{@const quiet = notes(review)}
	{#if left.length || quiet.length}
		<h2 class="label">{t.also}</h2>
		{#if left.length}
			<FoldList
				title={t.leftOut}
				count={t.leftOutCount(left.length)}
				entries={left}
				quoted
				action={{ label: t.putBack, run: (one) => answer((r) => putBack(r, one, key)) }}
			/>
		{/if}
		{#if quiet.length}
			<FoldList
				title={t.notes}
				count={t.noteCount(quiet.length)}
				entries={quiet.map((item) => {
					const name = findIngredient(review!, item.ingredient)?.row.name ?? item.name ?? '';
					return {
						id: item.id,
						text: item.kind === 'converted' ? t.converted(name) : t.unused(name)
					};
				})}
			/>
		{/if}
	{/if}

	<button type="button" class="everything" onclick={editEverything}>{t.editEverything}</button>
{:else if stored === null}
	<div class="gone">
		{#if recipe}
			<p class="gone-title">{t.tidyGone}</p>
			<p>{t.tidyGoneHint}</p>
			<a class="again" href={home}>{t.backToRecipe}</a>
		{:else}
			<p class="gone-title">{t.gone}</p>
			<p>{t.goneHint}</p>
			<a class="again" href="/cooking/recipes/import">{t.again}</a>
		{/if}
	</div>
{/if}

{#if review && editing}
	{@const found = findIngredient(review, editing)}
	{#if found}
		{@const rowId = found.row.id}
		<IngredientSheet
			ingredient={found.row}
			part={found.part}
			parts={withParts ? partNames(review.editor) : []}
			{own}
			onsave={(fields, part) =>
				answer((r) => editIngredient(r, rowId, fields, part, key, withParts))}
			onremove={() => answer((r) => removeIngredient(r, rowId))}
			onadded={(word) => {
				if (!own.some((one) => unitWordKey(one) === unitWordKey(word))) own = [...own, word];
			}}
			onclose={() => (editing = null)}
		/>
	{/if}
{/if}

{#if review && stepping}
	{@const found = findStep(review, stepping)}
	{#if found}
		{@const stepId = found.step.id}
		<StepSheet
			number={found.number}
			text={found.step.text}
			onsave={(text) => answer((r) => editStepText(r, stepId, text))}
			onlinks={() => (linking = stepId)}
			onremove={() => answer((r) => removeStep(r, stepId))}
			onclose={() => (stepping = null)}
		/>
	{/if}
{/if}

{#if review && linking}
	{@const found = findStep(review, linking)}
	{#if found}
		{@const stepId = found.step.id}
		<StepLinkSheet
			index={found.number}
			text={found.step.text}
			links={found.step.links}
			dismissed={found.step.dismissed}
			suggesting={suggesting(found.step)}
			{targets}
			servings={review.servings}
			{known}
			onsave={(links, dismissed) => answer((r) => setStepLinks(r, stepId, links, dismissed))}
			onclose={() => (linking = null)}
		/>
	{/if}
{/if}

{#if review && basics}
	<BasicsSheet
		basics={{ name: review.name, timeMinutes: review.timeMinutes, servings: review.servings }}
		onsave={(next) => answer((r) => editBasics(r, next))}
		onclose={() => (basics = false)}
	/>
{/if}

<style>
	/* A navigation bar, as the editor's: Discard, the title and Save on one line,
	   so like a native one they stop growing early (→ DESIGN-SYSTEM "Type scale"). */
	header {
		position: sticky;
		top: 0;
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0 calc(var(--page-pad) * -1);
		padding: 4px var(--page-pad) 10px;
		background: var(--bg);
	}

	.quiet {
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
		padding: 0 18px;
		border-radius: var(--r-chip);
		background: var(--sage);
		font-size: min(var(--fs-17), 22px);
		font-weight: 700;
		color: var(--on-sage);
	}

	.save:disabled {
		opacity: 0.6;
	}

	.error {
		margin: 4px 0 10px;
		padding: 10px 13px;
		border-radius: var(--r-input);
		background: var(--danger-tint);
		font-size: var(--fs-15);
		color: var(--danger-deep);
	}

	.hero {
		display: block;
		width: calc(100% + 2 * var(--page-pad));
		height: 160px;
		margin: 0 calc(var(--page-pad) * -1);
		border-radius: 0 0 26px 26px;
		object-fit: cover;
		background: var(--sunken);
	}

	.basics {
		display: block;
		width: 100%;
		margin-top: 14px;
		text-align: left;
	}

	.name {
		display: block;
		font-family: var(--font-display);
		font-size: var(--fs-30);
		font-weight: 600;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.meta {
		display: block;
		margin-top: 6px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.notice {
		margin: 12px 0 0;
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--text-4);
	}

	.label {
		display: flex;
		margin: 24px 4px 8px;
		font-family: var(--font-body);
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	/* A part of the dish over its ingredients and its steps, as the recipe shows it. */
	.part {
		margin: 18px 4px 8px;
		font-family: var(--font-display);
		font-size: var(--fs-18);
		font-weight: 600;
	}

	.label + .part {
		margin-top: 4px;
	}

	.ingredients {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.recipe-items {
		padding: 4px 14px 12px;
	}

	.steps {
		margin: 0 0 8px;
		padding: 0;
		list-style: none;
	}

	.everything {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 48px;
		margin-top: 24px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-block);
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--sage-deep);
	}

	.gone {
		margin-top: 40px;
		text-align: center;
	}

	.gone p {
		margin: 0 0 10px;
		font-size: var(--fs-15);
		line-height: 1.5;
		color: var(--text-4);
	}

	.gone .gone-title {
		font-size: var(--fs-18);
		font-weight: 600;
		color: var(--ink);
	}

	.again {
		font-weight: 600;
		color: var(--sage);
	}
</style>
