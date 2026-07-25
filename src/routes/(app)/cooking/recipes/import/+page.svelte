<!--
	Recipe import (→ SPEC §4.7, plans 12 & 13). One screen, two states: the entry
	screen (paste a link, and — when AI import is set up — paste text or add photos),
	then the ordinary recipe editor [3c] prefilled from whatever was read. The
	preview *is* the editor, so every imperfect parse is a two-second fix before Save.

	Plan 12's link import needs no key. Plan 13's three fallbacks (read a page with
	no recipe data, pasted text, photos) each call the household's Gemini key and
	are only offered when one is set (`data.aiEnabled`). Every one lands here with an
	"AI-extracted — check before saving" note.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import RecipeForm from '$lib/components/cooking/RecipeForm.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipePrefill } from '$lib/utils/recipes';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	// Five actions produce a handful of result shapes; tell them apart by their keys.
	const saveError = $derived(form && 'error' in form ? form.error : undefined);
	const saveField = $derived(form && 'field' in form ? form.field : undefined);
	const fetchError = $derived(form && 'fetchError' in form ? form.fetchError : undefined);
	const aiError = $derived(form && 'aiError' in form ? form.aiError : undefined);
	const noRecipe = $derived(form && 'noRecipe' in form ? Boolean(form.noRecipe) : false);
	const fetchedUrl = $derived(
		form && 'url' in form && typeof form.url === 'string' ? form.url : undefined
	);
	const pastedText = $derived(
		form && 'aiText' in form && typeof form.aiText === 'string' ? form.aiText : undefined
	);

	/** Which AI section a returned error belongs to, so it re-opens with its message. */
	const aiErrorSource = $derived.by<'page' | 'paste' | 'photo' | null>(() => {
		if (!aiError) return null;
		if (pastedText !== undefined) return 'paste';
		if (noRecipe) return 'page';
		return 'photo';
	});

	// The draft (from a fetch or any AI action) is held in state so a *save* failure —
	// which returns no draft — doesn't drop the editor back to the entry screen and
	// lose the edits. A fresh result replaces it; the `$derived` picks it up in the
	// same render, so there's no flash of the entry screen in between.
	let saved = $state<RecipePrefill | null>(null);
	let extractedByAi = $state(false);
	$effect(() => {
		if (form && 'draft' in form && form.draft) {
			saved = form.draft;
			extractedByAi = 'aiExtracted' in form && Boolean(form.aiExtracted);
		}
	});
	const draft = $derived<RecipePrefill | null>(
		saved ?? (form && 'draft' in form ? (form.draft ?? null) : null)
	);
	/** The AI note shows from the first render (state is set in an effect, a tick later). */
	const aiNotice = $derived(
		extractedByAi || (form && 'aiExtracted' in form && Boolean(form.aiExtracted))
	);

	// Seeded from the share-target link, or the URL kept on screen after a failed
	// fetch; under JS the bound value already survives a submit.
	let url = $state(untrack(() => fetchedUrl ?? data.url));
	// Pasted text kept across a failed extraction (state survives under JS; the
	// seed restores it on the no-JS reload).
	let pasteValue = $state(untrack(() => pastedText ?? ''));

	let fetchForm: HTMLFormElement | undefined = $state();
	let fetching = $state(false);
	let extracting = $state(false);
	let pasteOpen = $state(false);
	let photoOpen = $state(false);

	// Re-open the section a failed extraction came from, so its error and input show.
	$effect(() => {
		if (aiErrorSource === 'paste') pasteOpen = true;
		else if (aiErrorSource === 'photo') photoOpen = true;
	});

	/** The shared pending flag for the three AI forms — only one submits at a time. */
	function aiEnhance() {
		extracting = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			extracting = false;
		};
	}

	// A shared link auto-fetches once, so the recipe is on screen without a tap.
	let autoSubmitted = false;
	$effect(() => {
		if (autoSubmitted || draft || !data.url || !fetchForm) return;
		autoSubmitted = true;
		fetchForm.requestSubmit();
	});
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.cooking.import.title)}</title>
</svelte:head>

{#if draft}
	<RecipeForm
		recipe={null}
		prefill={draft}
		back="/cooking/recipes"
		error={saveError}
		field={saveField}
		notice={aiNotice ? m.cooking.import.ai.note : undefined}
	/>
{:else}
	<SubHeader
		title={m.cooking.import.title}
		subtitle={m.cooking.import.subtitle}
		back="/cooking/recipes"
		backLabel={m.cooking.import.back}
	/>

	<p class="intro">{m.cooking.import.intro}</p>

	<!-- On a no-recipe result the AI block (or the Settings hint) carries the
		 message, so the banner would only repeat it — show it for real errors. -->
	{#if fetchError && !noRecipe}
		<div class="banner">
			<Banner variant="danger" title={fetchError}>
				{#snippet icon()}<CircleAlert size={20} strokeWidth={2} />{/snippet}
			</Banner>
		</div>
	{/if}

	<form
		method="POST"
		action="?/fetch"
		bind:this={fetchForm}
		use:enhance={() => {
			fetching = true;
			return async ({ update }) => {
				await update();
				fetching = false;
			};
		}}
	>
		<TextField
			label={m.cooking.import.urlLabel}
			name="url"
			type="url"
			bind:value={url}
			placeholder={m.cooking.import.urlPlaceholder}
			inputmode="url"
			autocapitalize="off"
			autocomplete="off"
			spellcheck={false}
		/>
		<div class="submit">
			<Button type="submit" disabled={fetching || !url.trim()}>
				{fetching ? m.cooking.import.fetching : m.cooking.import.fetch}
			</Button>
		</div>
	</form>

	{#if data.aiEnabled}
		{#if aiError}
			<div class="banner ai-banner">
				<Banner variant="danger" title={aiError}>
					{#snippet icon()}<CircleAlert size={20} strokeWidth={2} />{/snippet}
				</Banner>
			</div>
		{/if}

		{#if noRecipe}
			<!-- The page fetched but had no recipe data — offer to read it with AI. -->
			<div class="ai-page">
				<p class="ai-lead">{m.cooking.import.ai.pageLead}</p>
				<form method="POST" action="?/extractPage" use:enhance={aiEnhance}>
					<input type="hidden" name="url" value={url} />
					<Button type="submit" disabled={extracting || !url.trim()}>
						<Sparkles size={16} strokeWidth={2} />
						{extracting ? m.cooking.import.ai.extracting : m.cooking.import.ai.tryPage}
					</Button>
				</form>
			</div>
		{/if}

		<details class="ai-section" bind:open={pasteOpen}>
			<summary>{m.cooking.import.ai.pasteToggle}</summary>
			<div class="ai-body">
				<form method="POST" action="?/extractText" use:enhance={aiEnhance}>
					<textarea
						name="text"
						bind:value={pasteValue}
						rows="7"
						placeholder={m.cooking.import.ai.pastePlaceholder}
						aria-label={m.cooking.import.ai.pasteLabel}
					></textarea>
					<div class="ai-submit">
						<Button type="submit" disabled={extracting || !pasteValue.trim()}>
							{extracting ? m.cooking.import.ai.extracting : m.cooking.import.ai.pasteSubmit}
						</Button>
					</div>
				</form>
			</div>
		</details>

		<details class="ai-section" bind:open={photoOpen}>
			<summary>{m.cooking.import.ai.photoToggle}</summary>
			<div class="ai-body">
				<form
					method="POST"
					action="?/extractPhotos"
					enctype="multipart/form-data"
					use:enhance={aiEnhance}
				>
					<input
						class="file"
						type="file"
						name="photos"
						accept="image/*"
						multiple
						aria-label={m.cooking.import.ai.photoLabel}
					/>
					<p class="ai-hint">{m.cooking.import.ai.photoHint}</p>
					<div class="ai-submit">
						<Button type="submit" disabled={extracting}>
							{extracting ? m.cooking.import.ai.extracting : m.cooking.import.ai.photoSubmit}
						</Button>
					</div>
				</form>
			</div>
		</details>
	{:else if noRecipe}
		<!-- No key set: the only AI affordance is the pointer to Settings (→ SPEC §4.7). -->
		<p class="ai-hint-line">
			{m.cooking.import.ai.hintLead}<a href="/settings">{m.cooking.import.ai.hintLink}</a>{m.cooking
				.import.ai.hintRest}
		</p>
	{/if}

	<p class="manual">
		{m.cooking.import.manualLead}<a href="/cooking/recipes/new">{m.cooking.import.manualLink}</a>{m
			.cooking.import.manualRest}
	</p>
{/if}

<style>
	.intro {
		margin: 0 4px 20px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.banner {
		margin-bottom: 18px;
	}

	.ai-banner {
		margin-top: 18px;
		margin-bottom: 0;
	}

	.submit {
		margin-top: 18px;
	}

	/* "Try AI extraction" on a page with no recipe data — sits right under the URL. */
	.ai-page {
		margin-top: 20px;
		padding: 16px;
		border-radius: var(--r-block);
		background: var(--sunken);
	}

	.ai-lead {
		margin: 0 0 12px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.ai-section {
		margin-top: 12px;
		border-radius: var(--r-block);
		background: var(--card);
		overflow: hidden;
	}

	.ai-section summary {
		padding: 15px 16px;
		font-size: 14px;
		font-weight: 600;
		color: var(--ink);
		cursor: pointer;
		list-style: none;
	}

	.ai-section summary::-webkit-details-marker {
		display: none;
	}

	.ai-section summary::after {
		content: '+';
		float: right;
		font-size: 17px;
		font-weight: 500;
		color: var(--text-5);
	}

	.ai-section[open] summary::after {
		content: '–';
	}

	.ai-body {
		padding: 0 16px 16px;
	}

	textarea {
		width: 100%;
		min-height: 150px;
		padding: 12px 14px;
		border: none;
		border-radius: var(--r-input);
		background: var(--sunken);
		font-family: inherit;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink);
		resize: vertical;
	}

	textarea:focus {
		outline: 1.5px solid var(--sage);
	}

	textarea::placeholder {
		color: var(--text-disabled);
	}

	.file {
		width: 100%;
		font-size: 13px;
		color: var(--text-4);
	}

	.ai-hint {
		margin: 10px 2px 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-5);
	}

	.ai-submit {
		margin-top: 14px;
	}

	.ai-hint-line {
		margin: 20px 4px 0;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.ai-hint-line a {
		font-weight: 600;
		color: var(--sage);
	}

	.manual {
		margin: 22px 4px 0;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--text-4);
		text-align: center;
	}

	.manual a {
		font-weight: 600;
		color: var(--sage);
	}
</style>
