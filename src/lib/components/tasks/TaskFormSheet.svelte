<!--
	New / edit task [3b]: name, who it's for, whether it alternates, how often it
	comes round, when it starts, and what it's worth.

	The page mounts this only while it's open, so the `$state` initialisers below
	*are* the form reset — every opening starts from the task, or from the
	defaults, rather than from whatever was left behind last time.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import type { HouseholdMember } from '$lib/server/services/household';
	import type { TaskListItem } from '$lib/server/services/tasks';
	import { addDays, formatDateLabel, type CalendarDate, type IntervalUnit } from '$lib/utils/dates';
	import {
		CUSTOM_REPEAT,
		CUSTOM_UNITS,
		DEFAULT_POINTS,
		EFFORTS,
		RECUR_INTERVAL_MAX,
		REPEAT_PRESETS,
		TASK_NAME_MAX,
		formatRepeat,
		repeatKey,
		type RecurUnit
	} from '$lib/utils/tasks';
	import { untrack } from 'svelte';

	type Props = {
		/** The task being edited; null when creating. */
		task: TaskListItem | null;
		/** The roster in join order — the chips, and the rotation order. */
		members: HouseholdMember[];
		today: CalendarDate;
		onclose: () => void;
	};

	let { task, members, today, onclose }: Props = $props();

	// Seeded once and then owned by the form — `untrack` says so out loud: a
	// re-render from the parent must not overwrite what's being typed.
	let open = $state(true);
	let name = $state(untrack(() => task?.name ?? ''));
	let assigneeId = $state<string | null>(untrack(() => task?.assignee?.id ?? null));
	let rotate = $state(untrack(() => task?.rotate ?? false));
	let repeat = $state(
		untrack(() => (task ? repeatKey(task.recurUnit, task.recurInterval) : 'week-1'))
	);
	let customUnit = $state<IntervalUnit>(
		untrack(() => (task && task.recurUnit !== 'none' ? task.recurUnit : 'week'))
	);
	let customInterval = $state<number | null>(untrack(() => task?.recurInterval ?? 3));
	// A new chore is a chore you have now; the starters start today too
	// (→ DECISIONS #22), and the two shouldn't disagree.
	let dueDate = $state(untrack(() => (task ? (task.dueDate ?? '') : today)));
	let points = $state(untrack(() => task?.points ?? DEFAULT_POINTS));
	let submitting = $state(false);
	/**
	 * This form's own rejection, not `$page.form` — the page-wide one belongs to
	 * whichever form posted last, and would paint a stale complaint onto a
	 * perfectly good task.
	 */
	let error = $state<string | undefined>();

	// Closing is the sheet's own business (scrim, Escape, the X) — the page just
	// hears about it and unmounts us.
	$effect(() => {
		if (!open) onclose();
	});

	/** What the two hidden fields post: the dropdown's row, or the custom pair. */
	const recurrence = $derived.by((): { unit: RecurUnit; interval: number } => {
		if (repeat === CUSTOM_REPEAT) return { unit: customUnit, interval: customInterval ?? 1 };
		const preset = REPEAT_PRESETS.find((option) => option.value === repeat) ?? REPEAT_PRESETS[0];
		return { unit: preset.unit, interval: preset.interval };
	});

	const oneOff = $derived(recurrence.unit === 'none');

	const repeatOptions = $derived([
		...REPEAT_PRESETS.map(({ value, label }) => ({ value, label })),
		{ value: CUSTOM_REPEAT, label: 'Custom…' }
	]);

	/**
	 * The toggle is shown whenever a member is selected (→ SPEC §5.2) — *not*
	 * only when there is somebody to alternate with. An unchecked checkbox posts
	 * nothing at all, so hiding the control on a household that has shrunk to one
	 * member would make every unrelated edit silently switch rotation off.
	 */
	const rotatable = $derived(assigneeId !== null);

	/**
	 * "Lukas → Elisabeth → Lukas …" [3b] — the join order, starting from whoever
	 * has it now and wrapping once, so the rotation is visible rather than
	 * promised. Null while there is nobody to hand it to; the toggle stays.
	 */
	const rotationCaption = $derived.by(() => {
		const start = members.findIndex((member) => member.id === assigneeId);
		if (start === -1 || members.length < 2) return null;

		const shown = Math.min(members.length + 1, 4);
		const names = Array.from(
			{ length: shown },
			(_, step) => members[(start + step) % members.length].displayName
		);

		return `${names.join(' → ')} …`;
	});

	const dueCaption = $derived(dueDate ? formatDateLabel(dueDate, today) : undefined);

	// One call per component, then suffixed — three groups need labelling.
	const uid = $props.id();
	const assigneeLabelId = `${uid}-assignee`;
	const effortLabelId = `${uid}-effort`;
	const dueLabelId = `${uid}-due`;
</script>

<BottomSheet bind:open title={task ? 'Edit task' : 'New task'}>
	<form
		method="POST"
		action={task ? '?/update' : '?/create'}
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				// A rejected name keeps the sheet — and the typing — on screen.
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		{#if task}<input type="hidden" name="id" value={task.id} />{/if}

		<TextField
			label="Task"
			name="name"
			bind:value={name}
			{error}
			placeholder="Clean the bathroom"
			maxlength={TASK_NAME_MAX}
			autocomplete="off"
			required
		/>

		<p class="label" id={assigneeLabelId}>Assign to</p>
		<div class="chips" role="group" aria-labelledby={assigneeLabelId}>
			{#each members as member (member.id)}
				<Chip
					color={member.color}
					selected={assigneeId === member.id}
					onclick={() => (assigneeId = member.id)}
				>
					<Avatar name={member.displayName} color={member.color} size={24} />
					{member.displayName}
				</Chip>
			{/each}
			<Chip
				selected={assigneeId === null}
				onclick={() => {
					assigneeId = null;
					// Nobody to alternate from once it belongs to everybody.
					rotate = false;
				}}
			>
				Anyone
			</Chip>
		</div>
		<input type="hidden" name="assigneeMemberId" value={assigneeId ?? ''} />

		{#if rotatable}
			<div class="pref">
				<div class="pref-text">
					<span class="pref-title">Alternate each time</span>
					{#if rotationCaption}<span class="pref-sub">{rotationCaption}</span>{/if}
				</div>
				<Toggle name="rotate" bind:checked={rotate} label="Alternate each time" />
			</div>
		{/if}

		<div class="block">
			<Select label="Repeat" bind:value={repeat} options={repeatOptions} />
		</div>

		{#if repeat === CUSTOM_REPEAT}
			<div class="custom">
				<div class="count">
					<Stepper label="Every" bind:value={customInterval} min={1} max={RECUR_INTERVAL_MAX} />
				</div>
				<div class="unit">
					<Select
						label="Unit"
						bind:value={customUnit}
						options={CUSTOM_UNITS.map(({ value, label }) => ({ value, label }))}
						hint={formatRepeat(recurrence.unit, recurrence.interval)}
					/>
				</div>
			</div>
		{/if}

		<input type="hidden" name="recurUnit" value={recurrence.unit} />
		<input type="hidden" name="recurInterval" value={recurrence.interval} />

		<div class="block">
			<DateField
				label={task ? 'Next due' : 'First due'}
				name="dueDate"
				bind:value={dueDate}
				caption={dueCaption}
				required={!oneOff}
			/>
			<div class="shortcuts" role="group" aria-labelledby={dueLabelId}>
				<span class="sr-only" id={dueLabelId}>Due date shortcuts</span>
				<button type="button" class="shortcut" onclick={() => (dueDate = today)}>Today</button>
				<button type="button" class="shortcut" onclick={() => (dueDate = addDays(today, 1))}>
					Tomorrow
				</button>
				{#if oneOff}
					<!-- Only a one-off can live without a date; a recurrence has to
						 recur from somewhere (→ services/tasks.ts). -->
					<button type="button" class="shortcut" onclick={() => (dueDate = '')}>No date</button>
				{/if}
			</div>
		</div>

		<p class="label" id={effortLabelId}>Effort → points</p>
		<div class="chips" role="group" aria-labelledby={effortLabelId}>
			{#each EFFORTS as effort (effort.points)}
				{@const selected = points === effort.points}
				<Chip {selected} onclick={() => (points = effort.points)}>
					{effort.label} · <span class="pts" class:on={selected}>{effort.points}</span>
				</Chip>
			{/each}
		</div>
		<input type="hidden" name="points" value={points} />

		<Button type="submit" disabled={submitting || !name.trim()}>
			{task ? 'Save changes' : 'Create task'}
		</Button>
	</form>
</BottomSheet>

<style>
	.label {
		margin: 18px 0 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	/* The number is the quiet half of the chip until the chip is chosen [3b]. */
	.pts {
		color: var(--text-5);
	}

	.pts.on {
		color: inherit;
	}

	.pref {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 18px;
		padding: 12px 14px;
		border-radius: var(--r-input);
		background: var(--field);
	}

	.pref-text {
		min-width: 0;
	}

	.pref-title {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-2);
	}

	.pref-sub {
		display: block;
		margin-top: 2px;
		font-size: 12px;
		color: var(--text-4);
		overflow-wrap: anywhere;
	}

	.block {
		margin-top: 18px;
	}

	.custom {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-top: 14px;
	}

	.count {
		flex: none;
		width: 148px;
	}

	.unit {
		flex: 1;
		min-width: 0;
	}

	.shortcuts {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}

	.shortcut {
		padding: 7px 13px;
		border-radius: var(--r-chip);
		background: var(--field);
		font-size: 12.5px;
		font-weight: 600;
		color: var(--text-2);
	}

	.shortcut:active {
		background: var(--sunken-2);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	form :global(.button) {
		margin-top: 24px;
	}
</style>
