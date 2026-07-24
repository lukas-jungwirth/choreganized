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
</script>

<div class="swatches" role="radiogroup" aria-label={label ?? m.ui.yourColour}>
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
		display: flex;
		gap: 12px;
	}

	.swatch {
		display: inline-flex;
		cursor: pointer;
		/* Keeps the 34px dot inside a 44px touch target. */
		padding: 5px;
		margin: -5px;
	}

	.dot {
		width: 34px;
		height: 34px;
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
