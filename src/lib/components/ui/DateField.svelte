<!--
	The date row [3b] "First due" and [4c] "Pick a date…": micro-label, sunken
	field, calendar icon, and a friendly reading of the value on the right
	("Tomorrow · Jul 17").

	A real `<input type="date">` under the styling, for the same reasons Select
	wraps a real `<select>`: it posts with the form action, opens the platform's
	own picker on a phone, and keyboards for free. The design draws a chevron
	suggesting the whole row opens a picker, so the browser's picker button is
	stretched invisibly across the field — tapping anywhere in the row opens it,
	while the value stays visible and typeable.
-->
<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = HTMLInputAttributes & {
		label: string;
		/** 'YYYY-MM-DD', or '' for no date. */
		value?: string;
		/** How the value reads in words — "Tomorrow · Jul 17". */
		caption?: string;
	};

	// `class` is destructured out rather than left in `rest`: spreading it would
	// replace the base class instead of adding to it (as in Chip, Select, Button).
	let { label, value = $bindable(''), caption, class: className = '', ...rest }: Props = $props();

	const id = $props.id();
</script>

<div class="field">
	<label class="label" for={id}>{label}</label>
	<div class="row">
		<span class="icon" aria-hidden="true"><Calendar size={17} strokeWidth={1.9} /></span>
		<!-- Spread first: `bind:value` must win over a stray `value` in `rest`. -->
		<input {id} type="date" {...rest} class="date {className}" bind:value />
		{#if caption}<span class="caption">{caption}</span>{/if}
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

	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 13px 14px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--input-surface, var(--card));
	}

	.row:focus-within {
		border-color: var(--sage);
	}

	.icon {
		display: flex;
		flex: none;
		color: var(--text-4);
	}

	.date {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font-family: inherit;
		font-size: calc(14px * var(--fs));
		font-weight: 500;
		color: var(--ink);
	}

	.date:focus {
		outline: none;
	}

	/* The design's chevron promises "tap the row, get a picker"; this is that
	   promise, made out of the button the browser already ships. */
	.date::-webkit-calendar-picker-indicator {
		position: absolute;
		inset: 0;
		width: auto;
		height: auto;
		margin: 0;
		padding: 0;
		opacity: 0;
		cursor: pointer;
	}

	.caption {
		flex: none;
		font-size: calc(13px * var(--fs));
		color: var(--text-4);
	}
</style>
