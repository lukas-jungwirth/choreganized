<!--
	"+ Add part" at the end of the editor's ingredients and of its steps
	(→ plan 46). The quiet way in for a recipe that has no parts yet: tapping it
	asks for a name right where the button was, and the new part's heading goes
	below what is already there. Not a <form>: it sits inside the recipe's, and
	forms do not nest, so Enter and the button confirm by hand.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import { RECIPE_SECTION_MAX } from '$lib/utils/recipes';
	import { tick } from 'svelte';

	type Props = { onadd: (name: string) => void };

	let { onadd }: Props = $props();

	const m = messages();
	const t = m.cooking.form.part;
	const uid = $props.id();

	let naming = $state(false);
	let name = $state('');
	let field: HTMLInputElement | undefined = $state();

	async function start() {
		naming = true;
		await tick();
		field?.focus();
	}

	function confirm() {
		const clean = name.replace(/\s+/g, ' ').trim();
		if (!clean) return;
		onadd(clean);
		name = '';
		naming = false;
	}
</script>

{#if naming}
	<div class="naming">
		<label class="label" for="{uid}-name">{t.name}</label>
		<div class="row">
			<input
				bind:this={field}
				id="{uid}-name"
				bind:value={name}
				placeholder={t.namePlaceholder}
				maxlength={RECIPE_SECTION_MAX}
				enterkeyhint="done"
				autocomplete="off"
				onkeydown={(event) => {
					if (event.key === 'Escape') naming = false;
					if (event.key !== 'Enter') return;
					// Enter in a single-line field would submit the recipe.
					event.preventDefault();
					confirm();
				}}
			/>
			<button type="button" class="confirm" disabled={!name.trim()} onclick={confirm}>
				{t.confirm}
			</button>
		</div>
	</div>
{:else}
	<button type="button" class="dashed" onclick={start}>+ {t.add}</button>
{/if}

<style>
	.dashed {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 48px;
		margin-top: 12px;
		border: 1.5px dashed var(--border-dashed);
		border-radius: var(--r-card);
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--sage-deep);
	}

	.naming {
		margin-top: 14px;
	}

	.label {
		display: block;
		margin: 0 4px 8px;
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
		background: var(--card);
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
