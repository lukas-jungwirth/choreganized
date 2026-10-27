<!--
	CodeInput — a one-time code as a row of boxes, one digit each (the sign-in
	code, plan 31). It is ONE real input laid over the boxes, not one per digit:
	iOS's "from Mail" autofill, pasting the whole code, and a screen reader all
	see a single field, which six inputs would each break. The boxes only draw
	what the input holds; the box after the last digit shows where typing goes.
-->
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'value'> & {
		label: string;
		value?: string;
		/** How many digits — the boxes, and where a longer paste is cut. */
		length?: number;
		/** Outlines every box in danger red — the code was refused. */
		invalid?: boolean;
		/** Called once the last digit is in, typed or filled in. */
		oncomplete?: (code: string) => void;
	};

	let {
		label,
		value = $bindable(''),
		length = 6,
		invalid = false,
		oncomplete,
		disabled,
		...rest
	}: Props = $props();

	const id = $props.id();
	let focused = $state(false);

	const slots = $derived(Array.from({ length }, (_, i) => value[i] ?? ''));
	/** The box typing goes into next; none once the code is whole. */
	const current = $derived(value.length < length ? value.length : -1);

	function oninput(event: Event & { currentTarget: HTMLInputElement }) {
		// Digits only, whatever was typed, pasted or autofilled ("123 456" too).
		// No `maxlength` on purpose: it would cut that paste to "123 45" first.
		value = event.currentTarget.value.replace(/\D/g, '').slice(0, length);
		event.currentTarget.value = value;
		if (value.length === length) oncomplete?.(value);
	}
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<div class="boxes" class:disabled>
		{#each slots as digit, i (i)}
			<span
				class="box"
				class:filled={digit !== ''}
				class:current={focused && i === current}
				class:invalid
				aria-hidden="true">{digit}</span
			>
		{/each}
		<input
			{id}
			class="input"
			type="text"
			inputmode="numeric"
			autocomplete="one-time-code"
			pattern="[0-9]*"
			aria-invalid={invalid ? 'true' : undefined}
			{value}
			{disabled}
			{oninput}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
			{...rest}
		/>
	</div>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
	}

	/* Same micro-label as TextField. */
	.label {
		margin-bottom: 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.boxes {
		position: relative;
		display: flex;
		gap: 8px;
	}

	.box {
		display: grid;
		flex: 1;
		place-items: center;
		height: 56px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-input);
		background: var(--input-surface, var(--card));
		font-size: calc(22px * var(--fs));
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}

	.box.current {
		border-color: var(--sage);
	}

	.box.invalid {
		border-color: var(--danger-border);
	}

	.disabled .box {
		color: var(--text-4);
	}

	/*
	 * The real input covers the whole row, invisible: a tap anywhere focuses it,
	 * and its own text and caret never show — the boxes draw the digits. 16px
	 * keeps iOS from zooming in on focus.
	 */
	.input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		padding: 0;
		border: none;
		background: transparent;
		font-size: calc(16px * var(--fs));
		color: transparent;
		caret-color: transparent;
		outline: none;
	}

	.input::selection {
		background: transparent;
	}
</style>
