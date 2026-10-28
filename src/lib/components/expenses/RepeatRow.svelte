<!--
	"Repeats · Never" [9b] (→ SPEC §11.9): the row names the choice, the device's
	own picker makes it — a native select over the whole row, like DateRow's
	date input, so there is nothing to keep in sync and the keyboard works.

	The quick choices are the cadences a household bill has — weekly, monthly,
	quarterly, yearly. "Custom…" opens a count + unit pair under the row, the
	way a chore's repeat does [3b] (→ SPEC §5.2): every 2 months, every 6 weeks.
	The row posts what it adds up to as two fields, `name` (the unit, or
	"never") and `interval`, since one select can't post two values.

	Editing a series offers no "Never": ending one is "Stop repeating"
	[9h-stop], a decision of its own rather than another option here.
-->
<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import RepeatIcon from '$lib/components/icons/RepeatIcon.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import { messages } from '$lib/i18n';
	import {
		CUSTOM_REPEAT,
		REPEAT_INTERVAL_MAX,
		REPEAT_PRESETS,
		REPEAT_UNITS,
		repeatChoice,
		type Repeat,
		type RepeatUnit
	} from '$lib/utils/expenses';
	import { untrack } from 'svelte';

	type Props = {
		/** What the row starts on; null = "Never". Owned by the row from then on. */
		initial: Repeat | null;
		/** The field the unit posts as. */
		name: string;
		/** Offer "Never" — false when the row edits a series. */
		never?: boolean;
	};

	let { initial, name, never = true }: Props = $props();

	const m = messages();
	const id = $props.id();

	let choice = $state<string>(untrack(() => (initial ? repeatChoice(initial) : 'never')));
	let customUnit = $state<RepeatUnit>(untrack(() => initial?.unit ?? 'month'));
	let customInterval = $state<number | null>(
		untrack(() => (initial && repeatChoice(initial) === CUSTOM_REPEAT ? initial.interval : 2))
	);

	const repeat = $derived.by((): Repeat | null => {
		if (choice === CUSTOM_REPEAT) return { unit: customUnit, interval: customInterval ?? 1 };
		return REPEAT_PRESETS.find((preset) => preset.value === choice) ?? null;
	});
</script>

<label class="row" for={id}>
	<RepeatIcon size={17} strokeWidth={1.8} />
	<span class="label">{m.expenses.form.repeats}</span>
	<span class="value">
		{repeat ? m.expenses.form.repeat(repeat.unit, repeat.interval) : m.expenses.form.never}
	</span>
	<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
	<select {id} bind:value={choice}>
		{#if never}<option value="never">{m.expenses.form.never}</option>{/if}
		{#each REPEAT_PRESETS as preset (preset.value)}
			<option value={preset.value}>{m.expenses.form.repeat(preset.unit, preset.interval)}</option>
		{/each}
		<option value={CUSTOM_REPEAT}>{m.expenses.form.repeatCustom}</option>
	</select>
</label>

{#if choice === CUSTOM_REPEAT}
	<div class="custom">
		<div class="count">
			<Stepper
				label={m.expenses.form.every}
				bind:value={customInterval}
				min={1}
				max={REPEAT_INTERVAL_MAX}
			/>
		</div>
		<div class="unit">
			<Select
				label={m.expenses.form.unit}
				bind:value={customUnit}
				options={REPEAT_UNITS.map((value) => ({
					value,
					label: m.expenses.form.units(value, customInterval ?? 1)
				}))}
			/>
		</div>
	</div>
{/if}

<input type="hidden" {name} value={repeat?.unit ?? 'never'} />
<input type="hidden" name="interval" value={repeat?.interval ?? 1} />

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

	.custom {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		padding: 12px 16px 14px;
	}

	.count {
		flex: none;
		width: 148px;
	}

	.unit {
		flex: 1;
		min-width: 0;
	}
</style>
