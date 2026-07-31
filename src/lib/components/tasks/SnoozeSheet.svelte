<!--
	Snooze / reschedule [4c], and the holiday pause that shares the sheet with it
	(→ SPEC §5.5).

	Two forms, deliberately: snoozing moves one task, going away pauses all of
	yours — which is why the second one is `AwayControl`, the same component
	Settings [6a] offers it with. The presets and the date picker are one value:
	a preset is simply the date it would set, so choosing "In 1 week" and then
	nudging the picker never leaves two controls disagreeing about what the CTA
	is about to do.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AwayControl from '$lib/components/AwayControl.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import { messages } from '$lib/i18n';
	import type { TaskListItem } from '$lib/server/services/tasks';
	import { addDays, type CalendarDate } from '$lib/utils/dates';
	import { SNOOZE_PRESETS } from '$lib/utils/tasks';
	import { untrack } from 'svelte';

	type Props = {
		/**
		 * The id it moves and the name it heads itself with — nothing else. Home's
		 * next-chore card [8b] opens the same sheet from a leaner row than the
		 * to-do list's.
		 */
		task: Pick<TaskListItem, 'id' | 'name'>;
		today: CalendarDate;
		/** The signed-in member's holiday state — the toggle's starting position. */
		awayUntil: CalendarDate | null;
		onclose: () => void;
	};

	let { task, today, awayUntil, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	// The gentlest of the presets: you came here to push it a little, not to
	// lose it for a fortnight.
	let dueDate = $state(untrack(() => addDays(today, 1)));
	let snoozing = $state(false);
	/** This form's own rejection, not `$page.form` (as in TaskFormSheet). */
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet bind:open title={m.tasks.snooze.title} eyebrow={task.name}>
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
						typeof result.data?.error === 'string' ? result.data.error : m.tasks.snooze.needsDate;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<input type="hidden" name="id" value={task.id} />

		<div class="presets">
			{#each SNOOZE_PRESETS as preset (preset.key)}
				{@const date = addDays(today, preset.days)}
				<button
					type="button"
					class="preset"
					class:on={dueDate === date}
					aria-pressed={dueDate === date}
					onclick={() => (dueDate = date)}
				>
					{m.task.snoozes[preset.key]}
				</button>
			{/each}
		</div>

		<DateField
			label={m.tasks.snooze.orPick}
			name="dueDate"
			bind:value={dueDate}
			caption={dueDate ? m.date.dateLabel(dueDate, today) : undefined}
			min={today}
			required
		/>

		{#if error}<p class="error">{error}</p>{/if}

		<Button type="submit" disabled={snoozing || !dueDate}>
			{m.tasks.snooze.to(dueDate ? m.date.short(dueDate) : '…')}
		</Button>
	</form>

	<hr />

	<AwayControl {today} {awayUntil} />
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

	form :global(.button) {
		margin-top: 20px;
	}
</style>
