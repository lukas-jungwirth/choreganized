<!--
	A part's heading in the editor (→ plan 46), its name edited in place: ✎
	turns the heading into a field, Enter or leaving it keeps the new name, and
	an emptied name dissolves the part into the one above. A part is one thing
	in the recipe, so the name changes over its ingredients and its steps alike.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import { RECIPE_SECTION_MAX } from '$lib/utils/recipes';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { tick } from 'svelte';

	type Props = { name: string; onrename: (from: string, to: string) => void };

	let { name, onrename }: Props = $props();

	const m = messages();
	const t = m.cooking.form.part;
	const uid = $props.id();

	let editing = $state(false);
	let value = $state('');
	let field: HTMLInputElement | undefined = $state();

	async function start() {
		value = name;
		editing = true;
		await tick();
		field?.select();
	}

	function commit() {
		if (!editing) return;
		editing = false;
		if (value.replace(/\s+/g, ' ').trim() !== name) onrename(name, value);
	}
</script>

{#if editing}
	<div class="editing">
		<input
			bind:this={field}
			aria-label={t.name}
			bind:value
			maxlength={RECIPE_SECTION_MAX}
			enterkeyhint="done"
			autocomplete="off"
			aria-describedby="{uid}-hint"
			onblur={commit}
			onkeydown={(event) => {
				if (event.key === 'Escape') {
					editing = false;
					return;
				}
				if (event.key !== 'Enter') return;
				event.preventDefault();
				commit();
			}}
		/>
		<p class="hint" id="{uid}-hint">{t.renameHint}</p>
	</div>
{:else}
	<h3 class="heading">
		<span class="text">{name}</span>
		<button type="button" class="edit" aria-label={t.rename(name)} onclick={start}>
			<Pencil size={16} strokeWidth={2} aria-hidden="true" />
		</button>
	</h3>
{/if}

<style>
	.heading {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 18px 4px 6px;
		font-family: var(--font-display);
		font-size: var(--fs-20);
		font-weight: 600;
	}

	.text {
		min-width: 0;
	}

	.edit {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		margin-left: auto;
		border-radius: 12px;
		color: var(--text-4);
	}

	.editing {
		margin: 14px 0 8px;
	}

	input {
		width: 100%;
		min-height: 48px;
		padding: 0 14px;
		border: 1.5px solid var(--sage);
		border-radius: var(--r-input);
		background: var(--card);
		font-family: var(--font-display);
		font-size: var(--fs-20);
		font-weight: 600;
		color: var(--ink);
	}

	input:focus {
		outline: none;
	}

	.hint {
		margin: 6px 4px 0;
		font-size: var(--fs-14);
		color: var(--text-4);
	}
</style>
