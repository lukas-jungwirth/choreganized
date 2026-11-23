<!--
	The recipe's name, time and servings, edited from the review (→ plan 45):
	tapping the name or the line under it opens this. Mounted per opening.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import { RECIPE_NAME_MAX, RECIPE_SERVINGS_MAX, RECIPE_TIME_MAX } from '$lib/utils/recipes';
	import { untrack } from 'svelte';

	type Basics = { name: string; timeMinutes: number | null; servings: number | null };

	type Props = {
		basics: Basics;
		onsave: (basics: Basics) => void;
		onclose: () => void;
	};

	let { basics, onsave, onclose }: Props = $props();

	const m = messages();
	const t = m.cooking.import.review;
	const uid = $props.id();

	let open = $state(true);
	let name = $state(untrack(() => basics.name));
	let time = $state(untrack(() => basics.timeMinutes?.toString() ?? ''));
	let servings = $state(untrack(() => basics.servings?.toString() ?? ''));

	$effect(() => {
		if (!open) onclose();
	});

	function count(value: string, max: number): number | null {
		const read = Math.trunc(Number(value));
		return value.trim() && Number.isFinite(read) && read > 0 ? Math.min(read, max) : null;
	}

	function save() {
		if (!name.trim()) return;
		onsave({
			name: name.replace(/\s+/g, ' ').trim(),
			timeMinutes: count(time, RECIPE_TIME_MAX),
			servings: count(servings, RECIPE_SERVINGS_MAX)
		});
		open = false;
	}
</script>

<BottomSheet bind:open title={t.basics}>
	<div class="field">
		<label class="label" for="{uid}-name">{t.name}</label>
		<input id="{uid}-name" class="input" bind:value={name} maxlength={RECIPE_NAME_MAX} />
	</div>
	<div class="pair">
		<div class="field">
			<label class="label" for="{uid}-time">{t.time}</label>
			<input
				id="{uid}-time"
				class="input"
				bind:value={time}
				inputmode="numeric"
				pattern="[0-9]*"
				maxlength={3}
			/>
		</div>
		<div class="field">
			<label class="label" for="{uid}-servings">{t.servings}</label>
			<input
				id="{uid}-servings"
				class="input"
				bind:value={servings}
				inputmode="numeric"
				pattern="[0-9]*"
				maxlength={2}
			/>
		</div>
	</div>
	<div class="foot">
		<Button type="button" onclick={save} disabled={!name.trim()}>{t.done}</Button>
	</div>
</BottomSheet>

<style>
	.field {
		display: flex;
		flex-direction: column;
		min-width: 0;
		margin-top: 16px;
	}

	.field:first-child {
		margin-top: 4px;
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8em, 1fr));
		gap: 0 10px;
	}

	.label {
		margin: 0 2px 8px;
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.input {
		width: 100%;
		min-height: 50px;
		padding: 0 14px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: var(--fs-17);
		color: var(--ink);
	}

	.input:focus {
		outline: none;
		border-color: var(--sage);
	}

	.foot {
		margin-top: 22px;
	}
</style>
