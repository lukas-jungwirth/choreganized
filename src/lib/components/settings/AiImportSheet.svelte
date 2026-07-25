<!--
	AI recipe import key [6a] — owner only (→ plan 13, SPEC §4.7). The household's
	own Google Gemini key, stored server-side and never sent back: this sheet only
	ever shows a masked hint of what's already there, and the field starts empty.
	The service checks the role again — this sheet is the affordance, not the guard.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { looksLikeGeminiKey } from '$lib/utils/household';

	type Props = {
		/** Whether a key is already stored — drives "Replace"/"Remove" vs "Save". */
		isSet: boolean;
		/** Masked hint (first four + last four) of the stored key, or null. Never the real key. */
		hint: string | null;
		onclose: () => void;
	};

	let { isSet, hint, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	// Always empty: the real key never reaches the client, so there's nothing to
	// prefill — typing a new one replaces whatever is stored.
	let key = $state('');
	let submitting = $state(false);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.settings.aiImport.title} eyebrow={m.settings.aiImport.eyebrow}>
	<p class="lead">{m.settings.aiImport.what}</p>
	<p class="cost">{m.settings.aiImport.cost}</p>
	<p class="get">
		<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
			{m.settings.aiImport.getKey}
		</a>
	</p>

	{#if isSet && hint}
		<p class="current">{m.settings.aiImport.current(hint)}</p>
	{/if}

	<form
		method="POST"
		action="?/saveAiKey"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<TextField
			label={m.settings.aiImport.keyLabel}
			name="key"
			bind:value={key}
			{error}
			placeholder={m.settings.aiImport.keyPlaceholder}
			autocapitalize="off"
			autocomplete="off"
			spellcheck={false}
		/>

		<div class="save">
			<Button type="submit" disabled={submitting || !looksLikeGeminiKey(key.trim())}>
				{isSet ? m.settings.aiImport.replace : m.common.saveChanges}
			</Button>
		</div>
	</form>

	{#if isSet}
		<form
			method="POST"
			action="?/removeAiKey"
			use:enhance={() => {
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') open = false;
				};
			}}
		>
			<button type="submit" class="remove">{m.settings.aiImport.remove}</button>
		</form>
	{/if}
</BottomSheet>

<style>
	.lead {
		margin: 0 2px 10px;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--text-2);
	}

	.cost {
		margin: 0 2px 10px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.get {
		margin: 0 2px 16px;
		font-size: 12.5px;
	}

	.get a {
		font-weight: 600;
		color: var(--sage);
	}

	.current {
		margin: 0 2px 12px;
		font-size: 12.5px;
		color: var(--text-4);
		font-variant-numeric: tabular-nums;
	}

	.save {
		margin-top: 4px;
	}

	.remove {
		display: block;
		width: 100%;
		margin-top: 14px;
		padding: 10px;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--danger);
		text-align: center;
	}
</style>
