<!--
	Browse all recipes — the grid behind "Browse all · 24" [04], and [7e] when
	there's nothing in it yet.

	The search field is a real GET form, so a search is a URL: SvelteKit routes
	the submission client-side, and typing just submits it on a short delay.
	Without JavaScript the same field still works — it just needs Enter.
-->
<script lang="ts">
	import RecipeCard from '$lib/components/cooking/RecipeCard.svelte';
	import PotIcon from '$lib/components/icons/PotIcon.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import SearchField from '$lib/components/ui/SearchField.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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
	<title>Recipes · Choreganized</title>
</svelte:head>

<SubHeader
	title="Recipes"
	subtitle={data.total === 1 ? '1 saved' : `${data.total} saved`}
	back="/cooking"
	backLabel="Back to the week"
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
			label="Search recipes"
			placeholder="Search recipes"
			name="q"
			bind:value={query}
			oninput={schedule}
		/>
		<!-- The submit the debounce presses for you; also the no-JS path. -->
		<button type="submit" class="sr-only">Search</button>
	</form>
{/if}

{#if data.total === 0}
	<div class="empty">
		<EmptyState title="Build your cookbook">
			{#snippet icon()}<PotIcon size={40} strokeWidth={1.6} />{/snippet}
			Save the meals you cook often. Then drop them onto any day of the week in a tap.
			{#snippet action()}
				<div class="cta">
					<Button href="/cooking/recipes/new">
						<Plus size={17} strokeWidth={2.4} />Add a recipe
					</Button>
				</div>
			{/snippet}
		</EmptyState>
	</div>
{:else if data.recipes.length === 0}
	<p class="none">Nothing matches “{data.search}”.</p>
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
	<FAB label="New recipe" href="/cooking/recipes/new">
		<Plus size={24} strokeWidth={2.4} />
	</FAB>
{/if}

<style>
	.search {
		margin-bottom: 18px;
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
