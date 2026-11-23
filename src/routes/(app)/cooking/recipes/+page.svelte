<!--
	Browse all recipes — the grid behind "Browse all · 24" [04], and [7e] when
	there's nothing in it yet.

	The search field is a real GET form, so a search is a URL: SvelteKit routes
	the submission client-side, and typing just submits it on a short delay.
	Without JavaScript the same field still works — it just needs Enter.

	The filters (→ plan 40, `$lib/utils/recipe-filter`) are the same kind of
	thing: each chip in the row is a link to the next list, and the search form
	carries the active filters as hidden fields so typing keeps them. Only the
	Filter sheet needs JavaScript; everything it can set, a URL can say.
-->
<script lang="ts">
	import AddRecipeSheet from '$lib/components/cooking/AddRecipeSheet.svelte';
	import RecipeCard from '$lib/components/cooking/RecipeCard.svelte';
	import RecipeFilterSheet from '$lib/components/cooking/RecipeFilterSheet.svelte';
	import { atomName } from '$lib/components/cooking/tag-names';
	import ChefHatIcon from '$lib/components/icons/ChefHatIcon.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import FAB from '$lib/components/ui/FAB.svelte';
	import SearchField from '$lib/components/ui/SearchField.svelte';
	import { messages } from '$lib/i18n';
	import {
		atomKey,
		emptyFilter,
		filterAtoms,
		hasAtom,
		matchesRecipeFilter,
		QUICK_ATOMS,
		quickAtomUseful,
		recipeFilterHref,
		recipeFilterParams,
		withAtom,
		withoutAtom,
		type FilterAtom
	} from '$lib/utils/recipe-filter';
	import Clock from '@lucide/svelte/icons/clock';
	import Heart from '@lucide/svelte/icons/heart';
	import Leaf from '@lucide/svelte/icons/leaf';
	import Plus from '@lucide/svelte/icons/plus';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import Tag from '@lucide/svelte/icons/tag';
	import X from '@lucide/svelte/icons/x';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	/** The "Add a recipe" chooser — the one door to link / photo / text / by hand. */
	let adding = $state(false);
	let filtering = $state(false);

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

	const atoms = $derived(filterAtoms(data.filter));
	/** The filters as the search form re-posts them — everything but `q`. */
	const carried = $derived([...recipeFilterParams(data.filter)]);
	/**
	 * The quick chips that could find something and aren't on yet. A time cap
	 * is one value, so with "Under 45 min" on there is no "Under 30 min" chip
	 * beside it to replace it by surprise.
	 */
	const quick = $derived(
		QUICK_ATOMS.filter(
			(atom) =>
				quickAtomUseful(atom, data.facets) &&
				!hasAtom(data.filter, atom) &&
				!(atom.group === 'max' && data.filter.max !== null)
		)
	);
	const narrowed = $derived(atoms.length > 0 || data.search !== '');

	/**
	 * The ways out of "nothing fits": each active filter dropped, with what it
	 * would bring back, counted against the same searched library the sheet
	 * counts — leaving out the ones that would still find nothing.
	 */
	const waysOut = $derived(
		atoms
			.map((atom) => {
				const looser = withoutAtom(data.filter, atom);
				return {
					atom,
					href: recipeFilterHref(looser, data.search),
					count: data.index.filter((recipe) => matchesRecipeFilter(recipe, looser)).length
				};
			})
			.filter((way) => way.count > 0)
	);

	const ICONS = { favourites: Heart, max: Clock, diets: Leaf } as const;

	function quickIcon(atom: FilterAtom) {
		return ICONS[atom.group as keyof typeof ICONS];
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
			label={m.cooking.filters.search}
			placeholder={m.cooking.filters.search}
			name="q"
			bind:value={query}
			oninput={schedule}
		/>
		{#each carried as [name, value], index (index)}
			<input type="hidden" {name} {value} />
		{/each}
		<!-- The submit the debounce presses for you; also the no-JS path. -->
		<button type="submit" class="sr-only">{m.ui.search}</button>
	</form>

	<div class="chips">
		<Chip
			class="filter-chip"
			onclick={() => (filtering = true)}
			aria-label={atoms.length ? m.cooking.filters.openCount(atoms.length) : undefined}
		>
			<SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />{m.cooking.filters.open}
			{#if atoms.length}<span class="badge" aria-hidden="true">{atoms.length}</span>{/if}
		</Chip>
		{#each atoms as atom (atomKey(atom))}
			{@const name = atomName(atom, m)}
			<Chip
				selected
				href={recipeFilterHref(withoutAtom(data.filter, atom), data.search)}
				aria-label={m.cooking.filters.remove(name)}
			>
				{name}<X size={14} strokeWidth={2.6} aria-hidden="true" />
			</Chip>
		{/each}
		{#each quick as atom (atomKey(atom))}
			{@const Icon = quickIcon(atom)}
			<Chip href={recipeFilterHref(withAtom(data.filter, atom), data.search)}>
				<Icon size={15} strokeWidth={2} aria-hidden="true" />{atomName(atom, m)}
			</Chip>
		{/each}
	</div>

	{#if narrowed || data.filter.sort !== 'new'}
		<p class="result">
			<span>
				{#if narrowed}{m.cooking.filters.count(data.recipes.length, data.total)}{/if}
				{#if narrowed && data.filter.sort !== 'new'}·{/if}
				{#if data.filter.sort !== 'new'}{m.cooking.filters.sorts[data.filter.sort]}{/if}
			</span>
			{#if atoms.length}
				<a
					href={recipeFilterHref({ ...emptyFilter(), sort: data.filter.sort }, data.search)}
					data-sveltekit-noscroll
				>
					{m.cooking.filters.clear}
				</a>
			{/if}
		</p>
	{/if}
{/if}

{#if data.total === 0}
	<div class="empty">
		<EmptyState title={m.cooking.recipes.emptyTitle}>
			{#snippet icon()}<ChefHatIcon size={40} strokeWidth={1.6} />{/snippet}
			{m.cooking.recipes.emptyCopy}
			{#snippet action()}
				<div class="cta">
					<Button onclick={() => (adding = true)}>
						<Plus size={17} strokeWidth={2.4} />{m.cooking.recipes.emptyCta}
					</Button>
				</div>
			{/snippet}
		</EmptyState>
	</div>
{:else if data.recipes.length === 0}
	{#if atoms.length}
		<div class="none">
			<h2>{m.cooking.filters.noneTitle}</h2>
			{#if waysOut.length}
				<p>{m.cooking.filters.noneCopy}</p>
				<ul class="ways">
					{#each waysOut as way (atomKey(way.atom))}
						<li>
							<a href={way.href} data-sveltekit-noscroll>
								<span class="x" aria-hidden="true"><X size={13} strokeWidth={2.6} /></span>
								<span class="way">{m.cooking.filters.without(atomName(way.atom, m))}</span>
								<span class="n">{m.cooking.filters.recipes(way.count)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<p class="nomatch">{m.cooking.filters.noMatch(data.search)}</p>
	{/if}
{:else}
	<ul class="grid">
		{#each data.recipes as recipe (recipe.id)}
			<li>
				<RecipeCard {recipe} today={data.today} timezone={data.household.timezone} />
			</li>
		{/each}
	</ul>

	{#if data.untagged > 0 && !narrowed}
		<!-- Untagged recipes are invisible to every filter; this is the way in (→ plan 41). -->
		<a class="sort" href="/cooking/recipes/sort">
			<Tag size={20} strokeWidth={1.9} aria-hidden="true" />
			<span class="sort-text">
				<b>{m.cooking.sort.row(data.untagged)}</b>
				<small>{m.cooking.sort.rowSub}</small>
			</span>
			<span class="sort-cta">{m.cooking.sort.rowCta}</span>
		</a>
	{/if}
{/if}

{#if data.total > 0}
	<FAB label={m.cooking.add.title} onclick={() => (adding = true)}>
		<Plus size={24} strokeWidth={2.4} />
	</FAB>

	<RecipeFilterSheet
		bind:open={filtering}
		filter={data.filter}
		search={data.search}
		index={data.index}
		facets={data.facets}
	/>
{/if}

{#if adding}
	<AddRecipeSheet aiEnabled={data.aiEnabled} onclose={() => (adding = false)} />
{/if}

<style>
	/* The row scrolls sideways out to the screen's edges rather than wrapping:
	   one line of chips, however many are on. */
	.chips {
		display: flex;
		gap: 8px;
		margin: 12px calc(var(--page-pad) * -1) 0;
		padding: 2px var(--page-pad) 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.chips::-webkit-scrollbar {
		display: none;
	}

	.chips :global(.chip) {
		flex: none;
		padding: 7px 13px;
		font-size: var(--fs-15);
	}

	.chips :global(.filter-chip) {
		color: var(--ink);
	}

	.badge {
		display: grid;
		place-items: center;
		min-width: 1.3em;
		height: 1.3em;
		padding: 0 5px;
		border-radius: var(--r-chip);
		background: var(--sage);
		color: var(--on-sage);
		font-size: var(--fs-13);
	}

	.result {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		margin: 10px 4px 0;
		font-size: var(--fs-14);
		font-weight: 500;
		color: var(--text-4);
	}

	.result a {
		font-weight: 600;
		color: var(--sage);
		text-decoration: none;
	}

	/* Two columns, or one once a column would be narrower than 7em — a reader
	   at a large text size gets whole recipe names instead of "mushroo-m". */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(max(7em, calc((100% - 12px) / 2)), 1fr));
		gap: 12px;
		margin: 14px 0 0;
		padding: 0;
		list-style: none;
	}

	/* Two cards side by side share a baseline even when one title wraps. */
	.grid li,
	.grid li > :global(.card) {
		height: 100%;
	}

	/* The last thing on the page, so it keeps clear of the FAB (56px + its 16px gap)
	   when scrolled to the bottom — its "Sort" sits right under it otherwise. */
	.sort {
		display: flex;
		align-items: center;
		gap: 11px;
		margin: 14px 0 72px;
		padding: 13px 14px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-block);
		color: var(--text-2);
		text-decoration: none;
	}

	.sort-text {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.sort-text b {
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--ink);
	}

	.sort-text small {
		font-size: var(--fs-13);
		color: var(--text-4);
	}

	.sort-cta {
		flex: none;
		font-size: var(--fs-15);
		font-weight: 700;
		color: var(--sage);
	}

	.nomatch {
		margin: 30px 4px;
		font-size: var(--fs-16);
		color: var(--text-4);
		text-align: center;
	}

	.none {
		margin: 30px 0 0;
		text-align: center;
	}

	.none h2 {
		font-size: var(--fs-22);
		line-height: 1.2;
	}

	.none p {
		margin: 6px 0 0;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.ways {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 18px 0 0;
		padding: 0;
		list-style: none;
		text-align: left;
	}

	.ways a {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 13px 14px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: var(--fs-16);
		color: var(--ink);
		text-decoration: none;
	}

	.x {
		display: grid;
		place-items: center;
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--sunken);
		color: var(--text-4);
	}

	.way {
		flex: 1;
		min-width: 0;
	}

	.n {
		flex: none;
		font-size: var(--fs-14);
		color: var(--text-4);
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
		font-size: var(--fs-17);
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
