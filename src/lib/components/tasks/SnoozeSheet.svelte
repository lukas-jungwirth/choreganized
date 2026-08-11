<!--
	Snooze / reschedule [4c], and the holiday pause that shares the sheet with it
	(→ SPEC §5.5).

	Two forms, deliberately: snoozing moves one task, going away pauses all of
	yours — which is why the second one is `AwayControl`, the same component
	Settings [6a] offers it with. The presets and the date picker are one value:
	a preset is simply the date it would set, so choosing "In 1 week" and then
	nudging the picker never leaves two controls disagreeing about what the CTA
	is about to do.

	The presets count from the day the task is *already* on, whenever that is
	still ahead of you: pushing something due next week back by "In 3 days" would
	have pulled it four days closer, which is the one thing this sheet must never
	do by accident (→ DECISIONS #128). So the same four offsets read as a snooze
	on a task that has come due and as a reschedule on one that hasn't, and the
	sheet says which it is doing.
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
		 * The id it moves, the name it heads itself with, and the day it is on —
		 * nothing else. Home's next-chore card [8b] opens the same sheet from a
		 * leaner row than the to-do list's.
		 */
		task: Pick<TaskListItem, 'id' | 'name' | 'dueDate'>;
		today: CalendarDate;
		/** The signed-in member's holiday state — the toggle's starting position. */
		awayUntil: CalendarDate | null;
		onclose: () => void;
	};

	let { task, today, awayUntil, onclose }: Props = $props();

	const m = messages();

	/**
	 * What "later" is counted from. Overdue, due today and undated one-offs are
	 * all being put off *now*, so they count from today; anything still ahead
	 * counts from its own due date, and can only ever move further away.
	 */
	const from = $derived(task.dueDate && task.dueDate > today ? task.dueDate : today);
	/** Ahead of us: the sheet is rescheduling a task, not snoozing one. */
	const rescheduling = $derived(from !== today);

	let open = $state(true);
	// The gentlest of the presets: you came here to push it a little, not to
	// lose it for a fortnight.
	let moveTo = $state(untrack(() => addDays(from, 1)));
	let snoozing = $state(false);
	/** This form's own rejection, not `$page.form` (as in TaskFormSheet). */
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});
</script>

<BottomSheet
	bind:open
	title={rescheduling ? m.tasks.snooze.rescheduleTitle : m.tasks.snooze.title}
	eyebrow={task.name}
>
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
				{@const date = addDays(from, preset.days)}
				<button
					type="button"
					class="preset"
					class:on={moveTo === date}
					aria-pressed={moveTo === date}
					onclick={() => (moveTo = date)}
				>
					{rescheduling ? m.task.postpones[preset.key] : m.task.snoozes[preset.key]}
				</button>
			{/each}
		</div>

		<!-- Still `min={today}`, not `min={from}`: bringing a future chore forward
			 is a real thing to want, and picking the day it lands on is the one
			 place you can say so on purpose rather than by tapping a preset. -->
		<DateField
			label={m.tasks.snooze.orPick}
			name="dueDate"
			bind:value={moveTo}
			caption={moveTo ? m.date.dateLabel(moveTo, today) : undefined}
			min={today}
			required
		/>

		{#if error}<p class="error">{error}</p>{/if}

		<Button type="submit" disabled={snoozing || !moveTo}>
			{#if rescheduling}
				{m.tasks.snooze.move(moveTo ? m.date.short(moveTo) : '…')}
			{:else}
				{m.tasks.snooze.to(moveTo ? m.date.short(moveTo) : '…')}
			{/if}
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
		font-size: calc(14px * var(--fs));
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
		font-size: calc(13px * var(--fs));
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
