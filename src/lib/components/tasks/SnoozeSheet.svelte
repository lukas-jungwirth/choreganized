<!--
	Snooze / reschedule [4c], and the holiday pause that shares the sheet with it
	(→ SPEC §5.5).

	Two forms, deliberately: snoozing moves one task, going away pauses all of
	yours. The presets and the date picker are one value — a preset is simply the
	date it would set, so choosing "In 1 week" and then nudging the picker never
	leaves two controls disagreeing about what the CTA is about to do.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import type { TaskListItem } from '$lib/server/services/tasks';
	import { addDays, formatDateLabel, formatShortDate, type CalendarDate } from '$lib/utils/dates';
	import { DEFAULT_AWAY_DAYS, SNOOZE_PRESETS } from '$lib/utils/tasks';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import { tick, untrack } from 'svelte';

	type Props = {
		task: TaskListItem;
		today: CalendarDate;
		/** The signed-in member's holiday state — the toggle's starting position. */
		awayUntil: CalendarDate | null;
		onclose: () => void;
	};

	let { task, today, awayUntil, onclose }: Props = $props();

	let open = $state(true);
	// The gentlest of the presets: you came here to push it a little, not to
	// lose it for a fortnight.
	let dueDate = $state(untrack(() => addDays(today, 1)));
	let away = $state(untrack(() => awayUntil !== null && awayUntil >= today));
	let returnDate = $state(untrack(() => awayUntil ?? addDays(today, DEFAULT_AWAY_DAYS)));
	// One flag per form: the two touch different rows, so clearing the holiday
	// has no business greying out the snooze CTA.
	let snoozing = $state(false);
	let pausing = $state(false);
	/** This form's own rejection, not `$page.form` (as in TaskFormSheet). */
	let error = $state<string | undefined>();
	let awayForm: HTMLFormElement | undefined = $state();

	$effect(() => {
		if (!open) onclose();
	});

	/**
	 * Turning the pause **off** needs no date and no second tap, so it submits
	 * itself. After `tick`, the hidden field below has caught up with `away` and
	 * posts the empty value that clears the holiday.
	 */
	async function onAwayChange(checked: boolean) {
		if (checked) return;
		await tick();
		awayForm?.requestSubmit();
	}
</script>

<BottomSheet bind:open title="Snooze until…" eyebrow={task.name}>
	<form
		method="POST"
		action="?/snooze"
		use:enhance={() => {
			snoozing = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				snoozing = false;
				// A rejected date keeps the sheet open *and* says why, rather than
				// leaving the same button to be tapped again for the same answer.
				if (result.type === 'failure') {
					error =
						typeof result.data?.error === 'string'
							? result.data.error
							: 'Pick a date to snooze to.';
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<input type="hidden" name="id" value={task.id} />

		<div class="presets">
			{#each SNOOZE_PRESETS as preset (preset.days)}
				{@const date = addDays(today, preset.days)}
				<button
					type="button"
					class="preset"
					class:on={dueDate === date}
					aria-pressed={dueDate === date}
					onclick={() => (dueDate = date)}
				>
					{preset.label}
				</button>
			{/each}
		</div>

		<DateField
			label="Or pick a date"
			name="dueDate"
			bind:value={dueDate}
			caption={dueDate ? formatDateLabel(dueDate, today) : undefined}
			min={today}
			required
		/>

		{#if error}<p class="error">{error}</p>{/if}

		<Button type="submit" disabled={snoozing || !dueDate}>
			Snooze to {dueDate ? formatShortDate(dueDate) : '…'}
		</Button>
	</form>

	<hr />

	<form
		method="POST"
		action="?/away"
		bind:this={awayForm}
		use:enhance={() => {
			pausing = true;
			return async ({ update }) => {
				await update({ reset: false });
				pausing = false;
			};
		}}
	>
		<div class="holiday">
			<span class="tile" aria-hidden="true"><Volume2 size={19} strokeWidth={1.8} /></span>
			<div class="copy">
				<span class="title">Going away?</span>
				<span class="detail">
					Pause <b>all your tasks</b> while you're on holiday — nothing counts as overdue and no reminders
					are sent.
				</span>
			</div>
			<Toggle bind:checked={away} label="Going away" onchange={onAwayChange} />
		</div>

		<!-- The value the form posts, whether or not the picker is on screen:
			 empty clears the holiday (→ services/tasks.ts `setAway`). -->
		<input type="hidden" name="until" value={away ? returnDate : ''} />

		{#if away}
			<div class="until">
				<DateField
					label="Back on"
					bind:value={returnDate}
					caption={returnDate ? formatDateLabel(returnDate, today) : undefined}
					min={today}
				/>
				<Button type="submit" variant="secondary" disabled={pausing || !returnDate}>
					{awayUntil ? 'Update' : 'Pause'} my tasks until {returnDate
						? formatShortDate(returnDate)
						: '…'}
				</Button>
			</div>
		{/if}
	</form>
</BottomSheet>

<style>
	.presets {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-bottom: 18px;
	}

	.preset {
		padding: 14px 8px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: 14px;
		font-weight: 600;
		text-align: center;
		color: var(--text-2);
	}

	.preset.on {
		border-color: var(--sage);
		background: var(--sage-tint);
		font-weight: 700;
		color: var(--sage-deep);
	}

	.error {
		margin: 16px 0 0;
		font-size: 13px;
		color: var(--danger-deep);
	}

	hr {
		height: 1px;
		margin: 22px 0 18px;
		border: none;
		background: var(--divider-sheet);
	}

	.holiday {
		display: flex;
		align-items: flex-start;
		gap: 13px;
		padding: 15px 16px;
		border-radius: var(--r-block);
		background: var(--field);
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 11px;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--sage);
	}

	.copy {
		flex: 1;
		min-width: 0;
	}

	.title {
		display: block;
		font-size: 15px;
		font-weight: 700;
	}

	.detail {
		display: block;
		margin-top: 3px;
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--text-4);
	}

	.detail b {
		font-weight: 600;
		color: var(--text-2);
	}

	.until {
		margin-top: 14px;
	}

	form :global(.button) {
		margin-top: 20px;
	}
</style>
