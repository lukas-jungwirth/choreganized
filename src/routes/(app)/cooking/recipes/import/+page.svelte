<!--
	Recipe import (→ SPEC §4.7, plans 12–14, 22). The "Add a recipe" chooser routes
	here with a focused `mode`, so each method is its own clean screen rather than
	one stacked page:
	  - link  (default) — paste a URL; the page's own recipe card fills the editor.
	           With **Improve with AI** on (→ plan 22) the model structures it —
	           amounts, which step uses what, timers — and reads pages that have
	           no card at all; off, a page with no card offers AI one tap away.
	  - photo — 1–3 cookbook photos, read by AI.
	  - text  — paste the recipe text, read by AI (the answer for 403 sites).
	Every AI path takes a line of instructions ("with tofu instead of meat") on
	top of the household's standing ones. Every success lands in the ordinary
	editor [3c] with a notice from the server; the AI never saves on its own. The
	share target lands in link mode with the URL prefilled and auto-fetched.
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
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { AI_INSTRUCTIONS_MAX } from '$lib/ai';
	import { messages } from '$lib/i18n';
	import type { RecipePrefill } from '$lib/utils/recipes';
	import Camera from '@lucide/svelte/icons/camera';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import FileText from '@lucide/svelte/icons/file-text';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { onMount, tick, untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();
	const t = m.cooking.import.ai;

	const mode = $derived(data.mode);

	// Five actions produce a handful of result shapes; tell them apart by their keys.
	const saveError = $derived(form && 'error' in form ? form.error : undefined);
	const saveField = $derived(form && 'field' in form ? form.field : undefined);
	const fetchError = $derived(form && 'fetchError' in form ? form.fetchError : undefined);
	const aiError = $derived(form && 'aiError' in form ? form.aiError : undefined);
	const noRecipe = $derived(form && 'noRecipe' in form ? Boolean(form.noRecipe) : false);
	const refused = $derived(form && 'refused' in form ? Boolean(form.refused) : false);
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
	/** The line above the draft the server wrote: made with AI, adapted, by the backup… */
	let savedNotice = $state<string | undefined>();
	$effect(() => {
		if (form && 'draft' in form && form.draft) {
			saved = form.draft;
			savedNotice = 'notice' in form && typeof form.notice === 'string' ? form.notice : undefined;
		}
	});
	const draft = $derived<RecipePrefill | null>(
		saved ?? (form && 'draft' in form ? (form.draft ?? null) : null)
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

	/**
	 * "Improve with AI" on a link (→ plan 22). **Off until someone turns it on**,
	 * then remembered on this device: turning it on is the explicit go-ahead a
	 * paid call needs (→ DECISIONS #112), so a first shared link never spends
	 * one nobody agreed to. Browser storage, because it is one person's habit
	 * on one phone — and a blocked storage just means "off".
	 */
	const IMPROVE_KEY = 'choreganized.import.improve';
	let improve = $state(false);

	function readImprove(): boolean {
		try {
			return localStorage.getItem(IMPROVE_KEY) === '1';
		} catch {
			return false;
		}
	}

	function rememberImprove(on: boolean) {
		try {
			localStorage.setItem(IMPROVE_KEY, on ? '1' : '0');
		} catch {
			// Private mode or blocked storage: it works, it just isn't remembered.
		}
	}

	/** The optional line for this import — always one tap away, never in the way. */
	let instructions = $state('');
	let showInstructions = $state(false);

	/** The shared pending flag for the AI forms — only one submits at a time. */
	function aiEnhance() {
		extracting = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			extracting = false;
		};
	}

	// The remembered choice, read once in the browser.
	onMount(() => {
		if (data.aiEnabled) improve = readImprove();
	});

	// A shared link auto-fetches once, so the recipe is on screen without a tap —
	// honouring the remembered choice too, read here *before* the submit: the
	// hidden `ai` field has to say so by the time the form goes, not after.
	let autoSubmitted = false;
	$effect(() => {
		if (autoSubmitted || draft || !data.url || !fetchForm) return;
		autoSubmitted = true;
		const form = fetchForm;
		untrack(() => {
			if (data.aiEnabled) improve = readImprove();
		});
		tick().then(() => form.requestSubmit());
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
		notice={savedNotice}
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
			<p class="hint">{t.photoHint}</p>
			{@render instructionsField()}
			<div class="submit">
				<Button type="submit" disabled={extracting || photos.length === 0}>
					<Camera size={16} strokeWidth={2} />
					{extracting ? t.extracting : t.photoSubmit}
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
				placeholder={t.pastePlaceholder}
				aria-label={t.pasteLabel}></textarea>
			{@render instructionsField()}
			<div class="submit">
				<Button type="submit" disabled={extracting || !pasteValue.trim()}>
					{extracting ? t.extracting : t.pasteSubmit}
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
			// With AI it's a model call, not a page load: the cooking loader says so.
			if (improve) extracting = true;
			return async ({ update }) => {
				await update({ reset: false });
				fetching = false;
				extracting = false;
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

		{#if data.aiEnabled}
			<input type="hidden" name="ai" value={improve ? '1' : ''} />
			<div class="improve">
				<div class="improve-copy">
					<span class="improve-label"><Sparkles size={15} strokeWidth={2} />{t.improve}</span>
					<span class="improve-hint">{t.improveHint}</span>
				</div>
				<Toggle bind:checked={improve} label={t.improve} onchange={rememberImprove} />
			</div>
			{#if improve}{@render instructionsField()}{/if}
		{/if}

		<div class="submit">
			<Button type="submit" disabled={fetching || !url.trim()}>
				{fetching ? m.cooking.import.fetching : m.cooking.import.fetch}
			</Button>
		</div>
	</form>

	<!-- A site that refuses the server: copy it over from the browser — pasted
		 text or a photo with AI; by hand (the line below) without. -->
	{#if refused && data.aiEnabled}
		<p class="ai-alt">
			<a href="?mode=text"><FileText size={14} strokeWidth={2} />{m.cooking.add.text}</a>
			<a href="?mode=photo"><Camera size={14} strokeWidth={2} />{m.cooking.add.photo}</a>
		</p>
	{/if}

	{#if noRecipe}
		{#if data.aiEnabled}
			<div class="ai-page">
				<p class="ai-lead">{t.pageLead}</p>
				<form method="POST" action="?/extractPage" use:enhance={aiEnhance}>
					<input type="hidden" name="url" value={url} />
					<input type="hidden" name="instructions" value={instructions} />
					<Button type="submit" disabled={extracting || !url.trim()}>
						<Sparkles size={16} strokeWidth={2} />
						{extracting ? t.extracting : t.tryPage}
					</Button>
				</form>
				<p class="ai-alt">
					<a href="?mode=photo"><Camera size={14} strokeWidth={2} />{m.cooking.add.photo}</a>
					<a href="?mode=text"><FileText size={14} strokeWidth={2} />{m.cooking.add.text}</a>
				</p>
			</div>
		{:else}
			<p class="ai-hint-line">
				{t.hintLead}<a href="/settings">{t.hintLink}</a>{t.hintRest}
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

<!-- The line for this import, behind a quiet link until it's wanted; the
	 household's standing line, when there is one, said underneath. -->
{#snippet instructionsField()}
	<div class="instructions">
		{#if showInstructions || instructions}
			<label class="instructions-label" for="ai-instructions">{t.instructionsLabel}</label>
			<textarea
				id="ai-instructions"
				class="short"
				name="instructions"
				rows="2"
				maxlength={AI_INSTRUCTIONS_MAX}
				placeholder={t.instructionsPlaceholder}
				bind:value={instructions}></textarea>
		{:else}
			<button type="button" class="instructions-toggle" onclick={() => (showInstructions = true)}>
				{t.instructionsToggle}
			</button>
		{/if}
		{#if data.aiInstructions}
			<p class="hint">{t.instructionsHousehold(data.aiInstructions)}</p>
		{/if}
	</div>
{/snippet}

{#snippet aiSetup()}
	<div class="ai-setup">
		<p>{t.setupCopy}</p>
		<Button href="/settings" variant="secondary">{t.setupCta}</Button>
	</div>
{/snippet}

<style>
	.intro {
		margin: 0 4px 20px;
		font-size: var(--fs-16);
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
		font-size: var(--fs-17);
		line-height: 1.5;
		color: var(--ink);
		resize: vertical;
	}

	textarea.short {
		min-height: 0;
	}

	textarea:focus {
		outline: 1.5px solid var(--sage);
	}

	textarea::placeholder {
		color: var(--text-disabled);
	}

	.hint {
		margin: 12px 2px 0;
		font-size: var(--fs-14);
		line-height: 1.5;
		color: var(--text-5);
	}

	/* "Improve with AI": a row like Settings' switches — what it does on the
	   left, the switch on the right. */
	.improve {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 16px;
		padding: 14px 16px;
		border-radius: var(--r-block);
		background: var(--card);
	}

	.improve-copy {
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
		min-width: 0;
	}

	.improve-label {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.improve-label :global(svg) {
		color: var(--sage);
	}

	.improve-hint {
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--text-4);
	}

	.instructions {
		margin-top: 14px;
	}

	.instructions-label {
		display: block;
		margin: 0 2px 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.instructions-toggle {
		padding: 2px;
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--sage);
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
		font-size: var(--fs-15);
		line-height: 1.5;
		color: var(--text-4);
	}

	.ai-alt {
		display: flex;
		gap: 20px;
		margin: 14px 2px 0;
		font-size: var(--fs-15);
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
		font-size: var(--fs-15);
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
		font-size: var(--fs-15);
		line-height: 1.5;
		color: var(--text-4);
	}

	.manual {
		margin: 22px 4px 0;
		font-size: var(--fs-15);
		line-height: 1.5;
		color: var(--text-4);
		text-align: center;
	}

	.manual a {
		font-weight: 600;
		color: var(--sage);
	}
</style>
