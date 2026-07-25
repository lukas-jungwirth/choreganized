<!--
	Recipe import (→ SPEC §4.7, plan 12). Two states of one screen: paste a link
	and fetch it, then — on success — the ordinary recipe editor [3c], prefilled
	from what the page's Schema.org data said. The preview is the editor, so every
	imperfect parse is a two-second fix before Save.

	The share target (`static/manifest.webmanifest`) lands here with the link in
	`?url=` (or `?text=`); the field is prefilled and auto-submitted.
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
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	// The two actions produce three result shapes; tell them apart by their keys.
	const saveError = $derived(form && 'error' in form ? form.error : undefined);
	const saveField = $derived(form && 'field' in form ? form.field : undefined);
	const fetchError = $derived(form && 'fetchError' in form ? form.fetchError : undefined);
	const fetchedUrl = $derived(form && 'fetchError' in form ? form.url : undefined);

	// The draft is held in state so a *save* failure — which returns no draft —
	// doesn't drop the editor back to the URL screen and lose the edits. A fresh
	// fetch replaces it; the `$derived` picks a new fetch up in the same render, so
	// there's no flash of the URL screen between fetching and the editor.
	let saved = $state<RecipePrefill | null>(null);
	$effect(() => {
		if (form && 'draft' in form && form.draft) saved = form.draft;
	});
	const draft = $derived<RecipePrefill | null>(
		saved ?? (form && 'draft' in form ? (form.draft ?? null) : null)
	);

	// Seeded from the share-target link, or the rejected URL kept on screen after a
	// failed fetch (the no-JS path — under JS the bound value already survives).
	let url = $state(untrack(() => fetchedUrl ?? data.url));

	let fetchForm: HTMLFormElement | undefined = $state();
	let fetching = $state(false);

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
	/>
{:else}
	<SubHeader
		title={m.cooking.import.title}
		subtitle={m.cooking.import.subtitle}
		back="/cooking/recipes"
		backLabel={m.cooking.import.back}
	/>

	<p class="intro">{m.cooking.import.intro}</p>

	{#if fetchError}
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

	.submit {
		margin-top: 18px;
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
