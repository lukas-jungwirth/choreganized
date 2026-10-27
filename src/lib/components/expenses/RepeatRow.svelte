<!--
	"Repeats · Never" [9b] (→ SPEC §11.9): the row names the choice, the device's
	own picker makes it — a native select over the whole row, like DateRow's
	date input, so there is nothing to keep in sync and the keyboard works.

	Editing a series offers only the three units: ending one is "Stop repeating"
	[9h-stop], a decision of its own rather than a fourth option here.
-->
<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import RepeatIcon from '$lib/components/icons/RepeatIcon.svelte';
	import { messages } from '$lib/i18n';
	import { REPEAT_UNITS, type RepeatUnit } from '$lib/utils/expenses';

	type Props = {
		value: RepeatUnit | 'never';
		name: string;
		/** Offer "Never" — false when the row edits a series. */
		never?: boolean;
	};

	let { value = $bindable(), name, never = true }: Props = $props();

	const m = messages();
	const id = $props.id();
</script>

<label class="row" for={id}>
	<RepeatIcon size={17} strokeWidth={1.8} />
	<span class="label">{m.expenses.form.repeats}</span>
	<span class="value">{m.expenses.form.repeat[value]}</span>
	<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
	<select {id} {name} bind:value>
		{#if never}<option value="never">{m.expenses.form.repeat.never}</option>{/if}
		{#each REPEAT_UNITS as unit (unit)}
			<option value={unit}>{m.expenses.form.repeat[unit]}</option>
		{/each}
	</select>
</label>

<style>
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 16px;
		color: var(--text-3);
		cursor: pointer;
	}

	.label {
		flex: none;
		font-size: calc(14.5px * var(--fs));
		font-weight: 600;
		color: var(--ink);
	}

	.value {
		flex: 1;
		min-width: 0;
		font-size: calc(13px * var(--fs));
		text-align: right;
		color: var(--text-4);
	}

	select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.row:focus-within {
		outline: 2px solid var(--sage);
		outline-offset: -2px;
		border-radius: inherit;
	}
</style>
