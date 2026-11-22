<!--
	Avatar colour picker [5c]: a radio group of swatches. Colours another member
	already uses are disabled (SPEC §1.5) — the server re-checks on submit.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import { MEMBER_COLORS } from '$lib/member-colors';

	type Props = {
		value?: string;
		/** Hex values already used in the household. */
		taken?: string[];
		name?: string;
		label?: string;
	};

	let {
		value = $bindable(MEMBER_COLORS[0].value),
		taken = [],
		name = 'color',
		label
	}: Props = $props();

	const m = messages();

	/**
	 * Six to a row, spread across the width beside the avatar preview: eight in
	 * one line shrink below a touch target at 390px, and four left a third of
	 * the row empty (→ DECISIONS #296, #300).
	 */
	const COLUMNS = 6;
</script>

<div
	class="swatches"
	style:--columns={COLUMNS}
	role="radiogroup"
	aria-label={label ?? m.ui.yourColour}
>
	{#each MEMBER_COLORS as color (color.value)}
		{@const unavailable = taken.includes(color.value)}
		{@const colorName = m.ui.colours[color.key]}
		<label class="swatch" class:unavailable style:--swatch={color.value}>
			<input
				type="radio"
				{name}
				value={color.value}
				bind:group={value}
				disabled={unavailable}
				aria-label={unavailable ? m.ui.colourTaken(colorName) : colorName}
			/>
			<span class="dot"></span>
		</label>
	{/each}
</div>

<style>
	.swatches {
		display: grid;
		grid-template-columns: repeat(var(--columns), 38px);
		/* The row ends where the fields above it end; on a wider phone the
		   gaps stop growing at 16px rather than spreading the dots apart. */
		justify-content: space-between;
		row-gap: 12px;
		flex: 1;
		max-width: calc(var(--columns) * 38px + (var(--columns) - 1) * 16px);
		min-width: 0;
	}

	.swatch {
		display: inline-flex;
		cursor: pointer;
		/* Keeps the 38px dot inside a 44px touch target. */
		padding: 3px;
		margin: -3px;
	}

	.dot {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--swatch);
		transition: box-shadow 120ms ease-out;
	}

	input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	input:checked + .dot {
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--swatch);
	}

	input:focus-visible + .dot {
		box-shadow:
			0 0 0 2px var(--bg),
			0 0 0 4px var(--ink);
	}

	.unavailable {
		cursor: not-allowed;
	}

	.unavailable .dot {
		opacity: 0.3;
	}

	@media (prefers-reduced-motion: reduce) {
		.dot {
			transition: none;
		}
	}
</style>
