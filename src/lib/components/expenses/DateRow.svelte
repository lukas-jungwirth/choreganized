<!--
	"Date · Today" [9b] [9d]: a row whose chip names the day, over the device's
	own date picker. Never later than today — an expense is something that
	already happened (→ SPEC §11.3).
-->
<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import { messages } from '$lib/i18n';
	import type { CalendarDate } from '$lib/utils/dates';

	type Props = {
		value: CalendarDate;
		today: CalendarDate;
		name?: string;
	};

	let { value = $bindable(), today, name = 'date' }: Props = $props();

	const m = messages();
	const id = $props.id();

	const chip = $derived(value === today ? m.expenses.form.today : m.date.shortAuto(value, today));
</script>

<label class="row" for={id}>
	<Calendar size={17} strokeWidth={1.8} aria-hidden="true" />
	<span class="label">{m.expenses.form.date}</span>
	<span class="chip">{chip}</span>
	<input
		{id}
		type="date"
		{name}
		bind:value
		max={today}
		required
		onclick={(event) => event.currentTarget.showPicker?.()}
	/>
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
		flex: 1;
		font-size: calc(14.5px * var(--fs));
		font-weight: 600;
		color: var(--ink);
	}

	.chip {
		padding: 5px 12px;
		border-radius: var(--r-chip);
		background: var(--sage-tint);
		font-size: calc(13px * var(--fs));
		font-weight: 700;
		color: var(--sage-deep);
	}

	/* The real control, over the whole row: the device's own picker, the
	   keyboard's own date entry, and nothing to keep in sync. */
	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.row:focus-within .chip {
		outline: 2px solid var(--sage);
		outline-offset: 2px;
	}
</style>
