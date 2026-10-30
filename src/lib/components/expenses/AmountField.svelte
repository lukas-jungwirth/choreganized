<!--
	The settle-up amount [9d]: centred, in the display face, with the currency's
	mark beside it — sized like the add sheet's sentence [10b], not a hero. A decimal keypad on a phone; either
	separator reads (→ `utils/money` `parseAmount`).
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = HTMLInputAttributes & {
		value: string;
		currency: string;
		label: string;
		/** A line under the number, inside the box [9d]. */
		caption?: string;
	};

	let { value = $bindable(), currency, label, caption, ...rest }: Props = $props();

	const m = messages();
	const id = $props.id();
</script>

<div class="box">
	<label class="field" for={id}>
		<span class="symbol" class:after={m.expenses.symbolAfter(currency)} aria-hidden="true"
			>{m.expenses.symbol(currency)}</span
		>
		<input
			{id}
			bind:value
			inputmode="decimal"
			autocomplete="off"
			placeholder="0"
			aria-label={label}
			{...rest}
		/>
	</label>
	{#if caption}<p class="caption">{caption}</p>{/if}
</div>

<style>
	.box {
		padding: 14px 16px;
		border: 1.5px solid transparent;
		border-radius: 20px;
		background: var(--field);
		transition: border-color 0.15s ease;
	}

	.box:focus-within {
		border-color: var(--sage);
	}

	.field {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
	}

	.symbol {
		font-family: var(--font-display);
		font-size: var(--fs-24);
		font-weight: 600;
		color: var(--text-4);
	}

	.symbol.after {
		order: 1;
	}

	input {
		width: 100%;
		max-width: 100%;
		min-width: 2ch;
		padding: 0;
		border: none;
		background: none;
		font-family: var(--font-display);
		font-size: var(--fs-36);
		font-weight: 600;
		line-height: 1.1;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		field-sizing: content;
		outline: none;
	}

	input::placeholder {
		color: var(--text-disabled);
	}

	.caption {
		margin: 6px 0 0;
		font-size: var(--fs-14);
		text-align: center;
		color: var(--text-4);
	}
</style>
