<!--
	"Sort your recipes" (→ plan 41, sketch phone 6): one untagged recipe per
	card, the same tag questions as the form, Skip or Next.

	Each card opens with a suggestion already ticked and dotted — the AI's when
	"Let the AI suggest tags" has run, else the diet the ingredients point to —
	and nothing is saved until Next. The AI's suggestions are kept here, in the
	page, while the cards go by: Next is a redirect back to this same route, so
	the component (and what it holds) stays.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import RecipeImage from '$lib/components/cooking/RecipeImage.svelte';
	import RecipeTagChips from '$lib/components/cooking/RecipeTagChips.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProgressBar from '$lib/components/ui/ProgressBar.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeDiet, RecipeTag } from '$lib/utils/recipe-tags';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	type Guess = { tags: RecipeTag[]; diet: RecipeDiet | null };

	/** The AI's suggestions by recipe id, kept across cards; null until asked. */
	let suggestions = $state<Record<string, Guess> | null>(null);
	let asking = $state(false);

	$effect(() => {
		const answered = form && 'suggestions' in form ? form.suggestions : null;
		if (answered) untrack(() => (suggestions = answered));
	});

	/** What this card opens on: the AI's suggestion, else the guessed diet. */
	function opening(): { tags: RecipeTag[]; diet: RecipeDiet | null; dots: string[] } {
		const ai = suggestions?.[data.recipe.id];
		if (ai) {
			return {
				tags: [...ai.tags],
				diet: ai.diet,
				dots: [...ai.tags, ...(ai.diet ? [`diet:${ai.diet}`] : [])]
			};
		}
		return { tags: [], diet: data.guess, dots: data.guess ? [`diet:${data.guess}`] : [] };
	}

	/** A new card, or suggestions arriving for this one: the chips start over. */
	const cardKey = $derived(`${data.recipe.id}:${suggestions?.[data.recipe.id] ? 'ai' : 'guess'}`);

	/**
	 * What this card opens on, read fresh whenever `cardKey` changes — derived,
	 * not copied into state by an effect, so the chips remounted by `{#key}`
	 * never start from the previous card's dots.
	 */
	const current = $derived.by(() => {
		void cardKey;
		return opening();
	});

	const source = $derived(
		suggestions?.[data.recipe.id] ? 'ai' : current.dots.length ? 'guess' : null
	);

	const meta = $derived(
		[
			data.recipe.timeMinutes ? m.cooking.cookTime(data.recipe.timeMinutes) : null,
			data.recipe.ingredients.length
				? m.cooking.sort.ingredients(
						data.recipe.ingredients.length,
						data.recipe.ingredients.slice(0, 4).join(', ')
					)
				: null
		]
			.filter(Boolean)
			.join(' · ')
	);

	/** A named action on this same address, keeping `?total=` and `?skip=`. */
	function action(name: string): string {
		const query = page.url.searchParams.toString();
		return query ? `?${query}&/${name}` : `?/${name}`;
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.cooking.sort.title)}</title>
</svelte:head>

<SubHeader
	title={m.cooking.sort.title}
	subtitle={m.cooking.sort.progress(data.done, data.total)}
	back="/cooking/recipes"
	backLabel={m.cooking.sort.back}
/>

<div class="progress">
	<ProgressBar
		value={data.done / data.total}
		label={m.cooking.sort.progressLabel(data.done, data.total)}
	/>
</div>

{#if data.aiEnabled && suggestions === null}
	<form
		method="POST"
		action={action('suggest')}
		class="ai"
		use:enhance={() => {
			asking = true;
			return async ({ update }) => {
				await update({ reset: false, invalidateAll: false });
				asking = false;
			};
		}}
	>
		<button type="submit" disabled={asking}>
			<Sparkles size={17} strokeWidth={2} aria-hidden="true" />
			<span>
				<b>{asking ? m.cooking.sort.aiBusy : m.cooking.sort.ai}</b>
				<small>{m.cooking.sort.aiSub}</small>
			</span>
		</button>
		{#if form && 'aiError' in form}<p class="error" role="alert">{form.aiError}</p>{/if}
	</form>
{:else if suggestions !== null}
	<p class="ai-done" role="status">
		{m.cooking.sort.aiDone(Object.keys(suggestions).length)}
	</p>
{/if}

<form method="POST" action={action('next')} class="card" use:enhance>
	<input type="hidden" name="recipeId" value={data.recipe.id} />
	<input type="hidden" name="total" value={data.total} />

	<div class="photo"><RecipeImage imagePath={data.recipe.imagePath} /></div>
	<div class="body">
		<h2>{data.recipe.name}</h2>
		{#if meta}<p class="meta">{meta}</p>{/if}

		{#key cardKey}
			<RecipeTagChips tags={current.tags} diet={current.diet} suggested={current.dots} />
		{/key}

		{#if source}
			<p class="from">
				<span class="dot" aria-hidden="true"></span>{m.cooking.tags.suggestedFrom[source]}
			</p>
		{/if}
	</div>

	<div class="foot">
		<a class="skip" href={data.skipHref}>{m.cooking.sort.skip}</a>
		<Button type="submit">{m.cooking.sort.next}</Button>
	</div>
</form>

<style>
	.progress {
		margin: 4px 0 16px;
	}

	.ai {
		margin-bottom: 14px;
	}

	.ai button {
		display: flex;
		align-items: flex-start;
		gap: 11px;
		width: 100%;
		padding: 13px 14px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-block);
		text-align: left;
		color: var(--sage-deep);
	}

	.ai button:disabled {
		opacity: 0.7;
	}

	.ai span {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.ai b {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.ai small {
		font-size: var(--fs-13);
		color: var(--text-4);
	}

	.error {
		margin: 8px 4px 0;
		font-size: var(--fs-14);
		color: var(--danger);
	}

	.ai-done {
		margin: 0 4px 14px;
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.card {
		overflow: hidden;
		border-radius: var(--r-card-lg);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.photo {
		height: 108px;
	}

	.body {
		padding: 14px 16px 4px;
	}

	h2 {
		font-size: var(--fs-24);
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 4px 0 10px;
		font-size: var(--fs-14);
		color: var(--text-4);
	}

	.from {
		display: flex;
		align-items: baseline;
		gap: 9px;
		margin: 0 0 12px;
		padding: 10px 12px;
		border-radius: var(--r-input);
		background: var(--sunken);
		font-size: var(--fs-14);
		color: var(--text-2);
	}

	.from .dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--gold);
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px 16px;
		border-top: 1px solid var(--divider);
	}

	.foot :global(.button) {
		flex: 1;
	}

	.skip {
		padding: 12px 10px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--text-2);
		text-decoration: none;
	}
</style>
