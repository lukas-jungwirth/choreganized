<!--
	Move to part [E3b] (→ plan 46): every part of the recipe, however many, the
	current one marked, then "No part" and "New part". The row lands at the end
	of the part picked; "New part" asks for its name right here and makes it.
	Lukas asked for a list after the sketch's first draft ("what if there are
	three different parts?"). Mounted per opening.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { messages } from '$lib/i18n';
	import { RECIPE_SECTION_MAX } from '$lib/utils/recipes';
	import { tick } from 'svelte';

	type Props = {
		eyebrow: string;
		/** The row's part now, null for none. */
		current: string | null;
		/** Every part, with what it holds ("steps 1 to 3") when it holds anything. */
		parts: { name: string; holds: string | null }[];
		onpick: (part: string | null) => void;
		onclose: () => void;
	};

	let { eyebrow, current, parts, onpick, onclose }: Props = $props();

	const m = messages();
	const t = m.cooking.form.movePart;
	const uid = $props.id();

	let open = $state(true);
	let naming = $state(false);
	let name = $state('');
	let field: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (!open) onclose();
	});

	function pick(part: string | null) {
		onpick(part);
		open = false;
	}

	async function startNaming() {
		naming = true;
		await tick();
		field?.focus();
	}

	function confirm(event: SubmitEvent) {
		event.preventDefault();
		const clean = name.replace(/\s+/g, ' ').trim();
		if (clean) pick(clean);
	}
</script>

<BottomSheet bind:open {eyebrow} title={t.title}>
	<div class="list" role="radiogroup" aria-label={t.title}>
		{#each parts as part (part.name)}
			<button
				type="button"
				role="radio"
				aria-checked={current === part.name}
				onclick={() => pick(part.name)}
			>
				<span class="radio" aria-hidden="true"></span>
				<span class="name">{part.name}</span>
				{#if part.holds}<small>{part.holds}</small>{/if}
			</button>
		{/each}
		<button type="button" role="radio" aria-checked={current === null} onclick={() => pick(null)}>
			<span class="radio" aria-hidden="true"></span>
			<span class="name">{t.none}</span>
		</button>
	</div>

	{#if naming}
		<form class="new-form" onsubmit={confirm}>
			<label class="label" for="{uid}-name">{m.cooking.form.part.name}</label>
			<div class="row">
				<input
					bind:this={field}
					id="{uid}-name"
					bind:value={name}
					placeholder={m.cooking.form.part.namePlaceholder}
					maxlength={RECIPE_SECTION_MAX}
					autocomplete="off"
				/>
				<button type="submit" class="confirm" disabled={!name.trim()}>
					{m.cooking.form.part.confirm}
				</button>
			</div>
		</form>
	{:else}
		<button type="button" class="new" onclick={startNaming}>+ {t.add}</button>
	{/if}
</BottomSheet>

<style>
	.list {
		display: grid;
	}

	.list button,
	.new {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 52px;
		padding: 6px 4px;
		border-top: 1px solid var(--divider-sheet);
		font-size: var(--fs-17);
		font-weight: 500;
		text-align: left;
		color: var(--ink);
	}

	.list button:first-child {
		border-top: 0;
	}

	.name {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	small {
		margin-left: auto;
		font-size: var(--fs-15);
		color: var(--text-4);
		text-align: right;
	}

	.radio {
		display: grid;
		place-items: center;
		flex: none;
		width: 22px;
		height: 22px;
		border: 1.7px solid var(--border-dashed);
		border-radius: 50%;
	}

	[aria-checked='true'] .radio {
		border-color: var(--sage);
	}

	[aria-checked='true'] .radio::after {
		content: '';
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--sage);
	}

	.new {
		font-weight: 600;
		color: var(--sage-deep);
	}

	.new-form {
		margin-top: 12px;
	}

	.label {
		display: block;
		margin: 0 2px 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.row {
		display: flex;
		gap: 8px;
	}

	.row input {
		flex: 1;
		min-width: 0;
		min-height: 48px;
		padding: 0 14px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: var(--fs-17);
		color: var(--ink);
	}

	.row input:focus {
		outline: none;
		border-color: var(--sage);
	}

	.confirm {
		flex: none;
		min-height: 48px;
		padding: 0 18px;
		border-radius: var(--r-button);
		background: var(--sage);
		font-size: var(--fs-16);
		font-weight: 700;
		color: var(--on-sage);
	}

	.confirm:disabled {
		opacity: 0.45;
	}
</style>
