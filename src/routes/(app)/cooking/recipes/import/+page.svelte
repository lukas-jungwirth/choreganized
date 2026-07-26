<!--
	Recipe import (→ SPEC §4.7, plans 12–14). The "Add a recipe" chooser routes
	here with a focused `mode`, so each method is its own clean screen rather than
	one stacked page:
	  - link  (default) — paste a URL; its Schema.org Recipe fills the editor, and
	           on a page with no recipe data the AI fallback is one tap away.
	  - photo — 1–3 cookbook photos, read by AI.
	  - text  — paste the recipe text, read by AI (the answer for 403 sites).
	Every success lands in the ordinary editor [3c] with an "AI-extracted — check
	before saving" note; the AI never saves on its own. The share target lands in
	link mode with the URL prefilled and auto-fetched.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AiCookingLoader from '$lib/components/cooking/AiCookingLoader.svelte';
	import MultiPhotoField from '$lib/components/cooking/MultiPhotoField.svelte';
	import RecipeForm from '$lib/components/cooking/RecipeForm.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipePrefill } from '$lib/utils/recipes';
	import Camera from '@lucide/svelte/icons/camera';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import FileText from '@lucide/svelte/icons/file-text';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	const mode = $derived(data.mode);

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

	// The draft (from a fetch or any AI action) is held in state so a *save* failure —
	// which returns no draft — doesn't drop the editor back to the entry screen and
	// lose the edits. A fresh result replaces it; the `$derived` picks it up the same
	// render, so there's no flash of the entry screen in between.
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
	const aiNotice = $derived(
		extractedByAi || (form && 'aiExtracted' in form && Boolean(form.aiExtracted))
	);

	// Seeded from the share-target link, or the URL kept on screen after a failed
	// fetch; under JS the bound value already survives a submit.
	let url = $state(untrack(() => fetchedUrl ?? data.url));
	// Pasted text kept across a failed extraction (state survives under JS; the seed
	// restores it on the no-JS reload).
	let pasteValue = $state(untrack(() => pastedText ?? ''));

	let fetchForm: HTMLFormElement | undefined = $state();
	let fetching = $state(false);
	let extracting = $state(false);
	/** The photos picked in photo mode — gates the submit and posts as `photos`. */
	let photos = $state<File[]>([]);

	/** The shared pending flag for the AI forms — only one submits at a time. */
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

	const headTitle = $derived(
		mode === 'photo'
			? m.cooking.add.photo
			: mode === 'text'
				? m.cooking.add.text
				: m.cooking.import.title
	);
</script>

<svelte:head>
	<title>{m.common.pageTitle(headTitle)}</title>
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
{:else if mode === 'photo'}
	<SubHeader
		title={m.cooking.add.photo}
		subtitle={m.cooking.add.photoSub}
		back="/cooking/recipes"
		backLabel={m.cooking.import.back}
	/>
	{#if data.aiEnabled}
		{#if aiError}{@render banner(aiError)}{/if}
		<form
			method="POST"
			action="?/extractPhotos"
			enctype="multipart/form-data"
			use:enhance={aiEnhance}
		>
			<MultiPhotoField bind:files={photos} max={3} />
			<p class="hint">{m.cooking.import.ai.photoHint}</p>
			<div class="submit">
				<Button type="submit" disabled={extracting || photos.length === 0}>
					<Camera size={16} strokeWidth={2} />
					{extracting ? m.cooking.import.ai.extracting : m.cooking.import.ai.photoSubmit}
				</Button>
			</div>
		</form>
	{:else}
		{@render aiSetup()}
	{/if}
{:else if mode === 'text'}
	<SubHeader
		title={m.cooking.add.text}
		subtitle={m.cooking.add.textSub}
		back="/cooking/recipes"
		backLabel={m.cooking.import.back}
	/>
	{#if data.aiEnabled}
		{#if aiError}{@render banner(aiError)}{/if}
		<form method="POST" action="?/extractText" use:enhance={aiEnhance}>
			<textarea
				name="text"
				bind:value={pasteValue}
				rows="10"
				placeholder={m.cooking.import.ai.pastePlaceholder}
				aria-label={m.cooking.import.ai.pasteLabel}
			></textarea>
			<div class="submit">
				<Button type="submit" disabled={extracting || !pasteValue.trim()}>
					{extracting ? m.cooking.import.ai.extracting : m.cooking.import.ai.pasteSubmit}
				</Button>
			</div>
		</form>
	{:else}
		{@render aiSetup()}
	{/if}
{:else}
	<SubHeader
		title={m.cooking.import.title}
		subtitle={m.cooking.import.subtitle}
		back="/cooking/recipes"
		backLabel={m.cooking.import.back}
	/>

	<p class="intro">{m.cooking.import.intro}</p>

	<!-- On a no-recipe result the AI block (or Settings hint) carries the message,
		 so the banner would only repeat it — show it for real errors. -->
	{#if fetchError && !noRecipe}{@render banner(fetchError)}{/if}

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

	{#if noRecipe}
		{#if data.aiEnabled}
			<div class="ai-page">
				<p class="ai-lead">{m.cooking.import.ai.pageLead}</p>
				<form method="POST" action="?/extractPage" use:enhance={aiEnhance}>
					<input type="hidden" name="url" value={url} />
					<Button type="submit" disabled={extracting || !url.trim()}>
						<Sparkles size={16} strokeWidth={2} />
						{extracting ? m.cooking.import.ai.extracting : m.cooking.import.ai.tryPage}
					</Button>
				</form>
				<p class="ai-alt">
					<a href="?mode=photo"><Camera size={14} strokeWidth={2} />{m.cooking.add.photo}</a>
					<a href="?mode=text"><FileText size={14} strokeWidth={2} />{m.cooking.add.text}</a>
				</p>
			</div>
		{:else}
			<p class="ai-hint-line">
				{m.cooking.import.ai.hintLead}<a href="/settings">{m.cooking.import.ai.hintLink}</a>{m.cooking
					.import.ai.hintRest}
			</p>
		{/if}
	{/if}

	<p class="manual">
		{m.cooking.import.manualLead}<a href="/cooking/recipes/new">{m.cooking.import.manualLink}</a>{m
			.cooking.import.manualRest}
	</p>
{/if}

<!-- The cozy wait while the model works — an overlay over whichever mode ran it. -->
{#if extracting}
	<AiCookingLoader />
{/if}

{#snippet banner(message: string)}
	<div class="banner">
		<Banner variant="danger" title={message}>
			{#snippet icon()}<CircleAlert size={20} strokeWidth={2} />{/snippet}
		</Banner>
	</div>
{/snippet}

{#snippet aiSetup()}
	<div class="ai-setup">
		<p>{m.cooking.import.ai.setupCopy}</p>
		<Button href="/settings" variant="secondary">{m.cooking.import.ai.setupCta}</Button>
	</div>
{/snippet}

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

	.submit {
		margin-top: 18px;
	}

	textarea {
		width: 100%;
		min-height: 200px;
		padding: 12px 14px;
		border: none;
		border-radius: var(--r-input);
		background: var(--card);
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

	.hint {
		margin: 12px 2px 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-5);
	}

	/* "Try AI extraction" on a fetched page with no recipe data. */
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

	.ai-alt {
		display: flex;
		gap: 20px;
		margin: 14px 2px 0;
		font-size: 13px;
	}

	.ai-alt a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
		color: var(--sage);
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

	.ai-setup {
		margin-top: 8px;
		padding: 20px;
		border-radius: var(--r-block);
		background: var(--sunken);
		text-align: center;
	}

	.ai-setup p {
		margin: 0 0 16px;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--text-4);
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
