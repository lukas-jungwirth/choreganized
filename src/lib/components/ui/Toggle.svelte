<!--
	Switch — "Alternate each time" [3b], "Going away?" [4c], the notification
	preferences [6a].

	A real (visually hidden) checkbox rather than a styled button: keyboard,
	focus ring and form submission all come for free, which matters because most
	of these live inside a form action.
-->
<script lang="ts">
	type Props = {
		checked?: boolean;
		/** Set when the toggle posts as part of a form. */
		name?: string;
		value?: string;
		disabled?: boolean;
		/** Required — the visible copy sits in the row, not in the control. */
		label: string;
		onchange?: (checked: boolean) => void;
	};

	let {
		checked = $bindable(false),
		name,
		value = 'on',
		disabled = false,
		label,
		onchange
	}: Props = $props();
</script>

<span class="toggle">
	<input
		type="checkbox"
		{name}
		{value}
		{disabled}
		aria-label={label}
		bind:checked
		onchange={() => onchange?.(checked)}
	/>
	<span class="track"><span class="knob"></span></span>
</span>

<style>
	.toggle {
		position: relative;
		display: inline-flex;
		flex: none;
	}

	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	input:disabled {
		cursor: default;
	}

	.track {
		display: block;
		width: 44px;
		height: 26px;
		border-radius: var(--r-chip);
		background: var(--border-dashed);
		transition: background 160ms ease-out;
	}

	.knob {
		display: block;
		width: 22px;
		height: 22px;
		margin: 2px;
		border-radius: 50%;
		background: var(--card);
		box-shadow: var(--shadow-knob);
		transition: transform 160ms ease-out;
	}

	input:checked + .track {
		background: var(--sage);
	}

	input:checked + .track .knob {
		transform: translateX(18px);
	}

	input:focus-visible + .track {
		outline: 2px solid var(--sage);
		outline-offset: 2px;
	}

	input:disabled + .track {
		opacity: 0.5;
	}

	@media (prefers-reduced-motion: reduce) {
		.track,
		.knob {
			transition: none;
		}
	}
</style>
