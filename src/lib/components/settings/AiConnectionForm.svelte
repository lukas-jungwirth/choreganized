<!--
	Setting up one AI connection [6a] (→ plan 20, SPEC §6): provider, key, model.
	Lives inside `AiFeaturesSheet` — the sheet swaps to this view rather than
	stacking a second sheet on top of the first.

	**The model list is the provider's own**, fetched with the key the moment
	one is pasted (`?/aiModels`), so a model released yesterday is already on it
	and none of the choices can go stale. Loading it is also the key check — a
	refused key says so here, before anything is saved. A recommended model is
	preselected so "paste key, Save" is the whole setup; "Other model…" takes a
	typed id for the rare case the list can't be loaded.

	The key field is never prefilled: the stored key never reaches the browser.
	Editing a connection without retyping it keeps the stored one, and the list
	loads with that one server-side.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import SheetOption from '$lib/components/settings/SheetOption.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import {
		AI_KEY_URLS,
		AI_PROVIDERS,
		looksLikeApiKey,
		looksLikeModelId,
		type AiProvider,
		type AiSlot
	} from '$lib/ai';
	import { messages } from '$lib/i18n';
	import type { ModelInfo } from '$lib/server/ai/types';
	import type { AiConnectionStatus } from '$lib/server/services/ai';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { onMount, tick, untrack } from 'svelte';

	type Props = {
		slot: AiSlot;
		/** What the slot holds now, or null for a new one. */
		current: AiConnectionStatus | null;
		/** Saved — the sheet goes back to its overview, which the reload has refreshed. */
		onsaved: () => void;
	};

	let { slot, current, onsaved }: Props = $props();

	const m = messages();
	const t = m.settings.ai.connection;

	/** The `<select>` value that reveals the typed-id field. */
	const OTHER = '__other';
	/** How long typing has to pause before a pasted key is tried. */
	const KEY_SETTLE_MS = 500;

	let provider = $state<AiProvider>(untrack(() => current?.provider ?? 'gemini'));
	let key = $state('');
	let models = $state<ModelInfo[] | null>(null);
	let recommended = $state<string | null>(null);
	let loading = $state(false);
	let listError = $state<string | undefined>();
	let picked = $state('');
	let typedModel = $state('');
	let saving = $state(false);
	let saveError = $state<string | undefined>();

	let form: HTMLFormElement | undefined = $state();
	let loadButton: HTMLButtonElement | undefined = $state();

	/** The stored key still counts while the provider is the one it belongs to. */
	const keepsStoredKey = $derived(!!current && current.provider === provider && !key.trim());
	const keyUsable = $derived(looksLikeApiKey(key.trim()) || keepsStoredKey);

	const model = $derived(picked === OTHER ? typedModel.trim() : picked);
	const vision = $derived.by(() => {
		const info = models?.find((entry) => entry.id === picked);
		return info?.vision === true ? '1' : info?.vision === false ? '0' : '';
	});

	const options = $derived([
		...(models ?? []).map((entry) => ({
			value: entry.id,
			label:
				entry.id === recommended
					? t.recommended(entry.label)
					: entry.free
						? t.free(entry.label)
						: entry.label
		})),
		{ value: OTHER, label: t.otherModel }
	]);

	const canSave = $derived(keyUsable && looksLikeModelId(model) && !saving && !loading);

	function choose(next: AiProvider) {
		if (next === provider) return;
		provider = next;
		// A key belongs to its provider; the list does too.
		key = '';
		models = null;
		recommended = null;
		listError = undefined;
		picked = '';
		typedModel = '';
		// Back on the saved provider: its list loads with the stored key — once the
		// hidden `provider` field says so, or the request would ask for the old one.
		if (current?.provider === next) tick().then(loadModels);
	}

	function loadModels() {
		if (!keyUsable || !form || !loadButton) return;
		form.requestSubmit(loadButton);
	}

	/** Once a listing arrives: keep the current model, else take the recommendation. */
	function pickFrom(list: ModelInfo[], best: string | null) {
		const keep = current?.provider === provider ? current.model : null;
		if (keep && list.some((entry) => entry.id === keep)) picked = keep;
		else if (keep) {
			picked = OTHER;
			typedModel = keep;
		} else picked = best ?? list[0]?.id ?? OTHER;
	}

	// A pasted key is tried as soon as typing settles — no extra tap to find out
	// whether it works.
	$effect(() => {
		const typed = key.trim();
		if (!looksLikeApiKey(typed)) return;
		const timer = setTimeout(() => untrack(loadModels), KEY_SETTLE_MS);
		return () => clearTimeout(timer);
	});

	// Editing a saved connection: its list loads with the stored key straight away.
	onMount(() => {
		if (current) loadModels();
	});
</script>

<form
	method="POST"
	action="?/saveAiConnection"
	bind:this={form}
	use:enhance={({ action }) => {
		const listing = action.search.includes('aiModels');
		if (listing) {
			loading = true;
			listError = undefined;
		} else {
			saving = true;
			saveError = undefined;
		}

		return async ({ result, update }) => {
			if (listing) {
				// The listing changes nothing on the page; read it here, no `update`.
				loading = false;
				if (result.type === 'success' && result.data?.aiModels) {
					const listed = result.data.aiModels as {
						provider: AiProvider;
						models: ModelInfo[];
						recommended: string | null;
					};
					// A provider switched mid-request answers for the old one.
					if (listed.provider !== provider) return;
					models = listed.models;
					recommended = listed.recommended;
					pickFrom(listed.models, listed.recommended);
				} else if (result.type === 'failure') {
					const message = result.data?.aiModelsError;
					listError = typeof message === 'string' ? message : m.ai.error.failed('');
					models = null;
					picked = OTHER;
				}
				return;
			}

			await update({ reset: false });
			saving = false;
			if (result.type === 'failure') {
				const message = result.data?.aiError ?? result.data?.error;
				saveError = typeof message === 'string' ? message : m.ai.error.failed('');
				return;
			}
			if (result.type === 'success') onsaved();
		};
	}}
>
	<input type="hidden" name="slot" value={slot} />
	<input type="hidden" name="provider" value={provider} />
	<input type="hidden" name="model" value={model} />
	<input type="hidden" name="vision" value={vision} />

	<h3 class="label">{t.provider}</h3>
	<RowGroup surface="sunken">
		{#each AI_PROVIDERS as option (option)}
			<SheetOption
				label={m.ai.providers[option].name}
				detail={m.ai.providers[option].hint}
				selected={provider === option}
				onclick={() => choose(option)}
			/>
		{/each}
	</RowGroup>

	<p class="get">
		<a href={AI_KEY_URLS[provider]} target="_blank" rel="noopener noreferrer">
			{t.getKey(m.ai.providers[provider].short)}
			<ExternalLink size={13} strokeWidth={2.2} />
		</a>
	</p>

	<TextField
		label={t.keyLabel}
		name="key"
		bind:value={key}
		placeholder={t.keyPlaceholder}
		autocapitalize="off"
		autocomplete="off"
		spellcheck={false}
		error={key.trim() && !looksLikeApiKey(key.trim()) ? t.invalidKey : undefined}
	/>
	{#if current && current.provider === provider}
		<p class="hint">{t.keyKeep(current.hint)}</p>
	{/if}

	<div class="models">
		<!-- The submitter a pasted key's automatic load goes through. -->
		<button type="submit" formaction="?/aiModels" bind:this={loadButton} hidden aria-hidden="true"
		></button>

		{#if models}
			<Select label={t.modelLabel} {options} bind:value={picked} hint={t.modelsHint} />
		{:else if !listError}
			<button type="submit" class="load" formaction="?/aiModels" disabled={!keyUsable || loading}>
				{loading ? t.loadingModels : keyUsable ? t.loadModels : t.needKey}
			</button>
		{/if}

		{#if listError}
			<p class="error" role="alert">
				<CircleAlert size={14} strokeWidth={2.4} />
				{listError}
			</p>
		{/if}

		{#if picked === OTHER}
			<div class="typed">
				<TextField
					label={t.modelIdLabel}
					bind:value={typedModel}
					placeholder={t.modelIdPlaceholder}
					autocapitalize="off"
					autocomplete="off"
					spellcheck={false}
					error={typedModel.trim() && !looksLikeModelId(typedModel.trim())
						? t.invalidModel
						: undefined}
				/>
			</div>
		{/if}
	</div>

	{#if saveError}
		<p class="error" role="alert">
			<CircleAlert size={14} strokeWidth={2.4} />
			{saveError}
		</p>
	{/if}

	<div class="save">
		<Button type="submit" disabled={!canSave}>{saving ? t.saving : t.save}</Button>
	</div>
</form>

<style>
	.label {
		font-family: var(--font-body);
		margin: 0 2px 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.get {
		margin: 12px 2px 16px;
		font-size: calc(12.5px * var(--fs));
	}

	.get a {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-weight: 600;
		color: var(--sage);
	}

	.hint {
		margin: 8px 2px 0;
		font-size: calc(12.5px * var(--fs));
		color: var(--text-4);
		font-variant-numeric: tabular-nums;
	}

	.models {
		margin-top: 16px;
	}

	.load {
		display: inline-flex;
		align-items: center;
		padding: 9px 14px;
		border-radius: var(--r-chip);
		background: var(--sunken);
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}

	.load:disabled {
		color: var(--text-4);
		cursor: default;
	}

	.typed {
		margin-top: 14px;
	}

	.error {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin: 10px 2px 0;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		color: var(--danger-deep);
	}

	.error :global(svg) {
		flex: none;
		margin-top: 2px;
	}

	.save {
		margin-top: 20px;
	}
</style>
