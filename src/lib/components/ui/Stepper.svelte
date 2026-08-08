<!--
	− n + inside a sunken well [3a]. Quantity today, cook mode's manual timer
	later (→ DECISIONS #14).

	The number is a real `<input type="number">` rather than the design's static
	text: it posts with the form, takes a typed "12" instead of twelve taps, and
	gives the buttons something to label. Its spinners are hidden — the two
	buttons are the spinner.

	`clearable` turns the low end into "no quantity at all", which is what an
	optional field needs: a shopping item that never had a quantity must be
	editable without acquiring one.
-->
<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { messages } from '$lib/i18n';

	type Props = {
		label: string;
		name?: string;
		/** `null` = empty. Only reachable when `clearable`. */
		value?: number | null;
		min?: number;
		max?: number;
		/** Below `min`, step down to nothing instead of stopping. */
		clearable?: boolean;
		/** What an empty field shows in place of a number. */
		placeholder?: string;
		/** `dark` for the cook-mode sheets, where white cards would glare. */
		tone?: 'light' | 'dark';
	};

	let {
		label,
		name,
		value = $bindable(null),
		min = 1,
		max = 999,
		clearable = false,
		placeholder = '—',
		tone = 'light'
	}: Props = $props();

	const m = messages();
	const id = $props.id();

	const canDecrease = $derived(value !== null && (clearable || value > min));
	const canIncrease = $derived(value === null || value < max);

	function decrease() {
		if (value === null) return;
		value = value > min ? value - 1 : clearable ? null : min;
	}

	function increase() {
		value = value === null ? min : Math.min(value + 1, max);
	}

	/**
	 * `<input type="number">` hands back `null` for both "" and "not a number",
	 * so the binding already models empty. Everything else is clamping: typing
	 * 4000 into a field that stops at 999 must not survive the blur.
	 *
	 * A typed 0 means "none" where that's allowed — which is also why the `min`
	 * attribute drops to 0 there: at `min="1"` the browser would refuse to submit
	 * the form and demand a number ≥ 1 from someone who wants no number at all.
	 */
	function normalize() {
		if (value === null) {
			if (!clearable) value = min;
			return;
		}
		if (clearable && value <= 0) {
			value = null;
			return;
		}
		value = Math.min(Math.max(Math.round(value), min), max);
	}
</script>

<div class="field" class:dark={tone === 'dark'}>
	<label class="label" for={id}>{label}</label>
	<div class="well">
		<button
			type="button"
			class="step"
			onclick={decrease}
			disabled={!canDecrease}
			aria-label={m.ui.decrease(label)}
			aria-controls={id}
		>
			<Minus size={14} strokeWidth={2.4} />
		</button>
		<input
			{id}
			{name}
			class="value"
			type="number"
			inputmode="numeric"
			min={clearable ? 0 : min}
			{max}
			step="1"
			{placeholder}
			bind:value
			onblur={normalize}
		/>
		<button
			type="button"
			class="step plus"
			onclick={increase}
			disabled={!canIncrease}
			aria-label={m.ui.increase(label)}
			aria-controls={id}
		>
			<Plus size={14} strokeWidth={2.4} />
		</button>
	</div>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.label {
		margin-bottom: 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.well {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 8px 10px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--input-surface, var(--card));
	}

	.well:focus-within {
		border-color: var(--sage);
	}

	.step {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--text-4);
		transition: transform 120ms ease-out;
	}

	.plus {
		color: var(--sage);
	}

	.step:active:not(:disabled) {
		transform: scale(0.92);
	}

	.step:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.value {
		width: 100%;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		font-size: calc(16px * var(--fs));
		font-weight: 700;
		text-align: center;
		color: var(--ink);
		/* The two buttons are the spinner; the native one would crowd them. */
		appearance: textfield;
	}

	.value::-webkit-inner-spin-button,
	.value::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}

	.value::placeholder {
		color: var(--text-disabled);
	}

	/* Cook mode's palette. The sunken well and the raised buttons of the light
		 stepper both come from a paper background that isn't there [7b]. */
	.dark .label {
		color: var(--cook-muted);
	}

	.dark .well {
		background: transparent;
	}

	.dark .well:focus-within {
		border-color: var(--cook-amber);
	}

	.dark .step {
		background: var(--cook-surface);
		box-shadow: none;
		color: var(--cook-text);
	}

	.dark .plus {
		color: var(--cook-amber);
	}

	.dark .value {
		color: var(--cook-text);
	}

	.value:focus {
		outline: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.step {
			transition: none;
		}
		.step:active:not(:disabled) {
			transform: none;
		}
	}
</style>
