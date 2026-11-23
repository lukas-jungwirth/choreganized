<!--
	The top of the recipe editor [3c] (→ plan 46): photo, name, time, servings
	and tags. Behaviour as before the rebuild; split out of `RecipeForm` so the
	form is the parts and links it is about. Every field here posts by its own
	`name` inside the recipe's form.
-->
<script lang="ts">
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import type { RecipeDiet, RecipeTag } from '$lib/utils/recipe-tags';
	import {
		RECIPE_NAME_MAX,
		RECIPE_SERVINGS_MAX,
		RECIPE_TIME_MAX,
		type TagSuggestion
	} from '$lib/utils/recipes';
	import Camera from '@lucide/svelte/icons/camera';
	import RecipeImage from './RecipeImage.svelte';
	import RecipeTagsField from './RecipeTagsField.svelte';

	type Props = {
		name: string;
		time: string;
		servings: string;
		/** The photo shown now: a pick's preview, the stored one, or the import's. */
		photo: string | null;
		nameError?: string;
		photoError?: string;
		tags: RecipeTag[];
		diet: RecipeDiet | null;
		suggested?: TagSuggestion | null;
		onpick: (file: File | null) => void;
		ondrop: () => void;
	};

	let {
		name = $bindable(),
		time = $bindable(),
		servings = $bindable(),
		photo,
		nameError,
		photoError,
		tags,
		diet,
		suggested,
		onpick,
		ondrop
	}: Props = $props();

	const m = messages();

	let fileInput: HTMLInputElement | undefined = $state();

	/**
	 * Read out of the event rather than `bind:files`: clearing a file input means
	 * writing its `value`, and a two-way binding would then try to write the
	 * FileList back.
	 */
	function pickPhoto(event: Event & { currentTarget: HTMLInputElement }) {
		onpick(event.currentTarget.files?.[0] ?? null);
	}

	function dropPhoto() {
		if (fileInput) fileInput.value = '';
		ondrop();
	}
</script>

<label class="photo">
	<input
		bind:this={fileInput}
		type="file"
		name="photo"
		accept="image/*"
		aria-label={m.cooking.form.photo}
		onchange={pickPhoto}
	/>
	<!-- The same striped placeholder every other missing photo gets [3c]. -->
	<span class="art"><RecipeImage imagePath={null} stripe={7} /></span>
	{#if photo}
		<img src={photo} alt="" />
		<span class="change">{m.cooking.form.changePhoto}</span>
	{:else}
		<span class="lens" aria-hidden="true"><Camera size={20} strokeWidth={1.9} /></span>
		<span class="hint">{m.cooking.form.addPhoto}</span>
	{/if}
</label>

<div class="photo-foot">
	{#if photoError}<p class="photo-error">{photoError}</p>{/if}
	{#if photo}
		<button type="button" class="drop" onclick={dropPhoto}>{m.cooking.form.removePhoto}</button>
	{/if}
</div>

<TextField
	label={m.cooking.form.name}
	name="name"
	bind:value={name}
	error={nameError}
	placeholder={m.cooking.form.namePlaceholder}
	maxlength={RECIPE_NAME_MAX}
	autocomplete="off"
	required
/>

<div class="pair">
	<TextField
		label={m.cooking.form.time}
		name="timeMinutes"
		type="number"
		bind:value={time}
		placeholder="30"
		inputmode="numeric"
		min={0}
		max={RECIPE_TIME_MAX}
	/>
	<TextField
		label={m.cooking.form.servingsLabel}
		name="servings"
		type="number"
		bind:value={servings}
		placeholder="4"
		inputmode="numeric"
		min={0}
		max={RECIPE_SERVINGS_MAX}
	/>
</div>

<RecipeTagsField {tags} {diet} {suggested} />

<style>
	.photo {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 140px;
		overflow: hidden;
		border-radius: var(--r-card-lg);
		cursor: pointer;
	}

	.art {
		position: absolute;
		inset: 0;
	}

	.photo input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.photo:focus-within {
		outline: 2px solid var(--sage);
		outline-offset: 2px;
	}

	.photo img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.lens {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--sage);
	}

	.hint {
		font-size: var(--fs-14);
		font-weight: 600;
		color: var(--text-4);
	}

	/* Sits on the photo, so it needs its own surface to stay readable. */
	.change {
		position: relative;
		align-self: flex-end;
		margin: auto 12px 12px auto;
		padding: 7px 12px;
		border-radius: var(--r-chip);
		background: var(--tabbar-bg);
		backdrop-filter: blur(6px);
		font-size: var(--fs-14);
		font-weight: 700;
		color: var(--ink);
	}

	.photo-foot {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		min-height: 12px;
		margin-bottom: 12px;
	}

	.photo-error {
		margin: 0;
		padding-left: 4px;
		font-size: var(--fs-15);
		color: var(--danger-deep);
	}

	.drop {
		min-height: 44px;
		margin-left: auto;
		padding: 4px;
		font-size: var(--fs-14);
		font-weight: 600;
		color: var(--danger);
	}

	.pair {
		display: flex;
		gap: 14px;
		margin-top: 18px;
	}

	.pair > :global(*) {
		flex: 1;
		min-width: 0;
	}
</style>
