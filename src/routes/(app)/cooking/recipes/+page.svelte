<!--
	Browse all recipes — the grid behind "Browse all · 24" [04], and [7e] when
	there's nothing in it yet.

	The search field is a real GET form, so a search is a URL: SvelteKit routes
	the submission client-side, and typing just submits it on a short delay.
	Without JavaScript the same field still works — it just needs Enter.
-->
<script lang="ts">
	import RecipeCard from '$lib/components/cooking/RecipeCard.svelte';
	import ChefHatIcon from '$lib/components/icons/ChefHatIcon.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import SearchField from '$lib/components/ui/SearchField.svelte';
	import { messages } from '$lib/i18n';
	import Link from '@lucide/svelte/icons/link';
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	/** Long enough that a word isn't four navigations, short enough to feel live. */
	const DEBOUNCE_MS = 220;

	// Seeded from the URL and then owned by the field — `untrack` says so out
	// loud: re-syncing it on every load would overwrite whatever was typed while
	// a search was still in flight.
	let query = $state(untrack(() => data.search));
	let form: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout>;

	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(() => form?.requestSubmit(), DEBOUNCE_MS);
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.cooking.recipes.title)}</title>
</svelte:head>

<SubHeader
	title={m.cooking.recipes.title}
	subtitle={m.cooking.recipes.saved(data.total)}
	back="/cooking"
	backLabel={m.cooking.recipes.back}
/>

{#if data.total > 0}
	<form
		bind:this={form}
		method="GET"
		class="search"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		data-sveltekit-noscroll
	>
		<SearchField
			label={m.cooking.recipes.search}
			placeholder={m.cooking.recipes.search}
			name="q"
			bind:value={query}
			oninput={schedule}
		/>
		<!-- The submit the debounce presses for you; also the no-JS path. -->
		<button type="submit" class="sr-only">{m.ui.search}</button>
	</form>

	<!-- The second way to add a recipe, beside the New FAB (→ plan 12). -->
	<a class="import" href="/cooking/recipes/import">
		<Link size={15} strokeWidth={2} />{m.cooking.import.entry}
	</a>
{/if}

{#if data.total === 0}
	<div class="empty">
		<EmptyState title={m.cooking.recipes.emptyTitle}>
			{#snippet icon()}<ChefHatIcon size={40} strokeWidth={1.6} />{/snippet}
			{m.cooking.recipes.emptyCopy}
			{#snippet action()}
				<div class="cta">
					<Button href="/cooking/recipes/new">
						<Plus size={17} strokeWidth={2.4} />{m.cooking.recipes.emptyCta}
					</Button>
					<a class="import-empty" href="/cooking/recipes/import">{m.cooking.import.entryEmpty}</a>
				</div>
			{/snippet}
		</EmptyState>
	</div>
{:else if data.recipes.length === 0}
	<p class="none">{m.cooking.recipes.noMatch(data.search)}</p>
{:else}
	<ul class="grid">
		{#each data.recipes as recipe (recipe.id)}
			<li>
				<RecipeCard {recipe} today={data.today} timezone={data.household.timezone} />
			</li>
		{/each}
	</ul>
{/if}

{#if data.total > 0}
	<FAB label={m.cooking.recipes.newRecipe} href="/cooking/recipes/new">
		<Plus size={24} strokeWidth={2.4} />
	</FAB>
{/if}

<style>
	.search {
		margin-bottom: 12px;
	}

	/* The quiet second entry point, under the search and above the grid. */
	.import {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		margin: 0 4px 18px;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--sage);
	}

	/* Its twin under the empty state's primary CTA [7e]. */
	.import-empty {
		display: inline-block;
		margin-top: 14px;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--sage);
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Two cards side by side share a baseline even when one title wraps. */
	.grid li,
	.grid li > :global(.card) {
		height: 100%;
	}

	.none {
		margin: 30px 4px;
		font-size: 14px;
		color: var(--text-4);
		text-align: center;
	}

	.empty {
		/* [7e] floats the pan at 46% of the screen; this lands near it without
		   pinning anything to a viewport height the shell doesn't own. */
		margin-top: 12vh;
	}

	.cta :global(.button) {
		width: auto;
		margin: 0 auto;
		padding: 13px 22px;
		border-radius: var(--r-input);
		font-size: 15px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
