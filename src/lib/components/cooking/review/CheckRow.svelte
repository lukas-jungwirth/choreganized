<!--
	One thing the import asks about [R1] [R3] (→ plan 45): the question in a
	gold box under the row or step it is about, and its answers, one tap each.
	The first answer is what the draft already has (keep the page's amount,
	keep the first of an either/or, keep the word in the note), so an item left
	alone saves exactly that. Answered, it gives way to a quiet "Checked".

	A new unit word is added through Settings' `addUnit`, as the unit panel
	does (→ plan 46): the household's word is the one thing a review stores
	before Save, and only on that tap.
-->
<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { messages } from '$lib/i18n';
	import type { EditorIngredient } from '$lib/utils/recipe-editor';
	import type { ReviewItem } from '$lib/utils/recipe-review';
	import Check from '@lucide/svelte/icons/check';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { RECIPE_SERVINGS_MAX, type ImportSource } from '$lib/utils/recipes';

	type Props = {
		item: ReviewItem;
		/** What the draft was read from: the questions name it ("the page", "the saved recipe"). */
		from: ImportSource;
		/** The row it is about, as it is now. */
		row?: EditorIngredient | null;
		/** The recipe's servings, for the `servings` question. */
		servings?: number | null;
		onkeep: () => void;
		/** `choice`: the other one. */
		onother?: () => void;
		/** `amount-differs`: the model's amount. */
		onanswer?: () => void;
		/** `line-added`: take the row out. */
		onremove?: () => void;
		/** `reworded`: the page's sentence. */
		onpage?: () => void;
		/** `name-differs`: open the row's sheet. */
		onedit?: () => void;
		/** `new-unit`: the word as the household now has it. */
		onunit?: (word: string) => void;
		/** `servings`: a new count. */
		onservings?: (servings: number) => void;
		/** `no-steps`: the full editor, to write them. */
		onsteps?: () => void;
	};

	let {
		item,
		from,
		row = null,
		servings = null,
		onkeep,
		onother,
		onanswer,
		onremove,
		onpage,
		onedit,
		onunit,
		onservings,
		onsteps
	}: Props = $props();

	const m = messages();
	const t = m.cooking.import.review;

	let adding = $state(false);
	/** Settings refused the word: its reason, under the question. */
	let unitError = $state<string | null>(null);

	const name = $derived(row?.name ?? item.name ?? '');
	const amount = $derived(row ? m.units.amount(row.quantity, row.unit) : '');
	const answer = $derived(
		item.answer ? m.units.amount(item.answer.quantity, item.answer.unit) || t.noAmount : t.noAmount
	);
</script>

{#if item.kind === 'servings'}
	<!-- The count stays to hand once answered: one tap settles it, the next ones
		 still count up or down. -->
	<div class="check" class:answered={item.settled} data-open-check={item.settled ? undefined : ''}>
		<div class="servings">
			<p class="question">{t.servingsQuestion}</p>
			<div class="stepper">
				<button
					type="button"
					class="step"
					aria-label={m.ui.decrease(t.servings)}
					disabled={!servings || servings <= 1}
					onclick={() => onservings?.(Math.max(1, (servings ?? 1) - 1))}
				>
					<Minus size={16} strokeWidth={2.4} />
				</button>
				<b aria-live="polite">{servings ?? '?'}</b>
				<button
					type="button"
					class="step"
					aria-label={m.ui.increase(t.servings)}
					disabled={(servings ?? 0) >= RECIPE_SERVINGS_MAX}
					onclick={() => onservings?.(Math.min(RECIPE_SERVINGS_MAX, (servings ?? 0) + 1))}
				>
					<Plus size={16} strokeWidth={2.4} />
				</button>
			</div>
		</div>
		{#if item.settled}
			<p class="done"><Check size={15} strokeWidth={2.4} aria-hidden="true" />{t.checked}</p>
		{:else}
			<p>{item.page ? t.servingsPage(from, item.page) : t.servingsWhy}</p>
			{#if servings}
				<div class="opts">
					<button type="button" class="opt" onclick={onkeep}>{t.servingsKeep(servings)}</button>
				</div>
			{/if}
		{/if}
	</div>
{:else if item.settled}
	{#if item.level === 'check'}
		<p class="done"><Check size={15} strokeWidth={2.4} aria-hidden="true" />{t.checked}</p>
	{/if}
{:else}
	<div class="check" data-open-check>
		{#if item.kind === 'choice'}
			<p>{t.choice(from, name, item.alternative ?? '')}</p>
			<div class="opts">
				<button type="button" class="opt" onclick={onkeep}>{name}</button>
				<button type="button" class="opt" onclick={onother}>{item.alternative}</button>
			</div>
		{:else if item.kind === 'amount-differs'}
			<p>{t.amountDiffers(from, item.page ?? '', answer)}</p>
			<div class="opts">
				<button type="button" class="opt" onclick={onkeep}
					>{t.keepAmount(amount || t.noAmount)}</button
				>
				<button type="button" class="opt" onclick={onanswer}>{t.useAmount(answer)}</button>
			</div>
		{:else if item.kind === 'name-differs'}
			<p>{t.nameDiffers(from, item.page ?? '')}</p>
			<div class="opts">
				<button type="button" class="opt" onclick={onkeep}>{t.keep}</button>
				<button type="button" class="opt" onclick={onedit}>{t.edit}</button>
			</div>
		{:else if item.kind === 'line-added'}
			<p>{t.lineAdded(from, item.page ?? name)}</p>
			<div class="opts">
				<button type="button" class="opt" onclick={onkeep}>{t.keep}</button>
				<button type="button" class="opt" onclick={onremove}>{t.remove}</button>
			</div>
		{:else if item.kind === 'reworded'}
			<p>{item.page ? t.reworded(from, item.page) : t.rewordedUnknown(from)}</p>
			<div class="opts">
				{#if item.page}
					<button type="button" class="opt" onclick={onpage}>{t.usePageText(from)}</button>
				{/if}
				<button type="button" class="opt" onclick={onkeep}>{t.keep}</button>
			</div>
		{:else if item.kind === 'new-unit'}
			<p>{t.newUnit(item.word ?? '')}</p>
			<!-- Posts to Settings, where the household's words are kept and listed;
				 the answer is the word as stored, and the row takes it at once. -->
			<form
				class="opts"
				method="POST"
				action="/settings?/addUnit"
				use:enhance={() => {
					adding = true;
					unitError = null;
					return async ({ result }) => {
						adding = false;
						if (result.type === 'success' && result.data?.unit) {
							onunit?.(String((result.data.unit as { word: string }).word));
						} else if (result.type === 'failure') {
							// Settings' own words ("too long"); keeping it in the note still works.
							unitError = String(result.data?.unitError ?? '') || null;
						} else {
							await applyAction(result);
						}
					};
				}}
			>
				<input type="hidden" name="word" value={item.word ?? ''} />
				<button type="submit" class="opt" disabled={adding}>{t.addUnit}</button>
				<button type="button" class="opt" onclick={onkeep}>{t.keepInNote}</button>
			</form>
			{#if unitError}<p role="alert">{unitError}</p>{/if}
		{:else if item.kind === 'no-steps'}
			<p>{t.noSteps(from)}</p>
			<div class="opts">
				<button type="button" class="opt" onclick={onsteps}>{t.addSteps}</button>
				<button type="button" class="opt" onclick={onkeep}>{t.saveWithout}</button>
			</div>
		{:else if item.kind === 'shares-exceed'}
			<p>{t.sharesExceed(name)}</p>
			<div class="opts">
				<button type="button" class="opt" onclick={onkeep}>{t.keep}</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.check {
		display: grid;
		gap: 8px;
		margin-top: 10px;
		padding: 10px 12px;
		border-radius: var(--r-input);
		background: var(--gold-tint);
	}

	/* Answered: the count stays, the question's gold goes. */
	.check.answered {
		padding: 0;
		background: none;
	}

	p {
		margin: 0;
		font-size: var(--fs-15);
		line-height: 1.4;
		color: var(--gold-deep);
		overflow-wrap: anywhere;
	}

	.opts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.opt {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 6px 14px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: var(--fs-15);
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
		text-align: left;
		overflow-wrap: anywhere;
	}

	.opt:disabled {
		opacity: 0.55;
	}

	.servings {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
	}

	.question {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.stepper b {
		min-width: 2ch;
		font-size: var(--fs-18);
		text-align: center;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}

	.step {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--ink);
	}

	.step:disabled {
		opacity: 0.45;
	}

	.done {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		font-size: var(--fs-14);
		color: var(--sage-deep);
	}
</style>
