<!--
	Tap a task [4b] — everything you can do to it in one sheet: finish it, push
	it, hand it over, let this one go, edit it, or delete it.

	Delete asks first, in a confirm raised from *inside* this sheet — the
	composition BottomSheet and CenterModal were built around (→ DECISIONS #36).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import type { HouseholdMember } from '$lib/server/services/household';
	import type { TaskListItem } from '$lib/server/services/tasks';
	import { formatDueMeta, formatShortDate, type CalendarDate } from '$lib/utils/dates';
	import { formatRepeat, possessive } from '$lib/utils/tasks';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Clock from '@lucide/svelte/icons/clock';
	import Pencil from '@lucide/svelte/icons/pencil';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import Star from '@lucide/svelte/icons/star';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UserRoundCheck from '@lucide/svelte/icons/user-round-check';

	type Props = {
		task: TaskListItem;
		members: HouseholdMember[];
		today: CalendarDate;
		currentMemberId: string;
		/** The page's handler — it owns the optimistic tick and the done modal. */
		complete: SubmitFunction;
		onsnooze: () => void;
		onedit: () => void;
		onclose: () => void;
	};

	let { task, members, today, currentMemberId, complete, onsnooze, onedit, onclose }: Props =
		$props();

	let open = $state(true);
	let confirmOpen = $state(false);
	let submitting = $state(false);

	$effect(() => {
		if (!open) onclose();
	});

	const overdue = $derived(!task.paused && task.dueDate !== null && task.dueDate < today);
	const turn = $derived(
		task.assignee
			? task.assignee.id === currentMemberId
				? 'Your turn'
				: `${possessive(task.assignee.displayName)} turn`
			: 'Anyone'
	);

	/** Everyone it isn't already with — one row each (→ SPEC §5.3). */
	const others = $derived(members.filter((member) => member.id !== task.assignee?.id));

	/** Every action but "done" just closes the sheet and lets the list redraw. */
	const closeOnSuccess: SubmitFunction = () => {
		submitting = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			submitting = false;
			if (result.type === 'success') open = false;
		};
	};
</script>

<BottomSheet bind:open title={task.name}>
	{#if overdue && task.dueDate}
		<p class="pill">
			{formatDueMeta(task.dueDate, today)} · was due {formatShortDate(task.dueDate)}
		</p>
	{/if}

	<p class="facts">
		<span class="fact">
			<RotateCw size={13} strokeWidth={2} aria-hidden="true" />
			{formatRepeat(task.recurUnit, task.recurInterval)}
		</span>
		<span class="fact">
			{#if task.assignee}
				<Avatar name={task.assignee.displayName} color={task.assignee.color} size={18} />
			{:else}
				<Avatar empty size={18} />
			{/if}
			{turn}
		</span>
		<span class="fact points">
			<Star size={13} strokeWidth={2} aria-hidden="true" />
			{task.points} pts
		</span>
	</p>

	{#if task.paused && task.assignee?.awayUntil}
		<p class="paused">
			{task.assignee.displayName} is away until {formatShortDate(task.assignee.awayUntil)} — this one
			is paused, not overdue.
		</p>
	{/if}

	<form method="POST" action="?/complete" use:enhance={complete}>
		<input type="hidden" name="id" value={task.id} />
		<Button type="submit" disabled={submitting}>
			<Check size={19} strokeWidth={2.6} />Mark as done · +{task.points}
		</Button>
	</form>

	<div class="menu">
		<button type="button" class="item" onclick={onsnooze}>
			<Clock size={19} strokeWidth={1.9} aria-hidden="true" />
			<span class="what">Snooze / reschedule</span>
			<ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
		</button>

		{#each others as member (member.id)}
			<form method="POST" action="?/reassign" use:enhance={closeOnSuccess}>
				<input type="hidden" name="id" value={task.id} />
				<input type="hidden" name="assigneeMemberId" value={member.id} />
				<button type="submit" class="item" disabled={submitting}>
					<UserRoundCheck size={19} strokeWidth={1.9} aria-hidden="true" />
					<span class="what">
						{task.assignee ? 'Reassign to' : 'Assign to'}
						{member.id === currentMemberId ? 'me' : member.displayName}
					</span>
					<ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
				</button>
			</form>
		{/each}

		{#if task.recurUnit !== 'none'}
			<!-- "This time" only means something when there is a next time; a
				 one-off is skipped by deleting it (→ docs/plans/04-tasks.md). -->
			<form method="POST" action="?/skip" use:enhance={closeOnSuccess}>
				<input type="hidden" name="id" value={task.id} />
				<button type="submit" class="item" disabled={submitting}>
					<ArrowRight size={19} strokeWidth={1.9} aria-hidden="true" />
					<span class="what">Skip this time <span class="quiet">· no points</span></span>
				</button>
			</form>
		{/if}

		<button type="button" class="item" onclick={onedit}>
			<Pencil size={19} strokeWidth={1.9} aria-hidden="true" />
			<span class="what">Edit task</span>
			<ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
		</button>
	</div>

	<button type="button" class="delete" onclick={() => (confirmOpen = true)}>Delete task</button>

	<CenterModal bind:open={confirmOpen} label="Delete task" dismissible={false}>
		<div class="well" aria-hidden="true"><Trash2 size={26} strokeWidth={1.9} /></div>
		<h3>Delete {task.name}?</h3>
		<p class="copy">
			It stops coming round. Everything already ticked off stays in history — the points stay with
			the house.
		</p>
		<form
			method="POST"
			action="?/delete"
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: false });
					// A rejected delete keeps the question on screen rather than
					// closing as if it had worked.
					if (result.type !== 'success') return;
					confirmOpen = false;
					open = false;
				}}
		>
			<input type="hidden" name="id" value={task.id} />
			<Button type="submit" variant="danger">Delete task</Button>
		</form>
		<button type="button" class="cancel" onclick={() => (confirmOpen = false)}>Cancel</button>
	</CenterModal>
</BottomSheet>

<style>
	/* The overdue badge [4b] — a tint, not a siren. */
	.pill {
		display: inline-flex;
		align-items: center;
		margin: -14px 0 0;
		padding: 4px 10px;
		border-radius: var(--r-chip);
		background: var(--danger-tint);
		font-size: 12.5px;
		font-weight: 600;
		color: var(--danger);
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 14px;
		margin: 12px 2px 20px;
		font-size: 12.5px;
		color: var(--text-4);
	}

	.fact {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.points {
		font-weight: 700;
		color: var(--terracotta);
	}

	.paused {
		margin: -8px 0 20px;
		padding: 11px 13px;
		border-radius: var(--r-input);
		background: var(--info-tint);
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--info-soft);
	}

	/* The grouped action list [4b] [7c]: one sunken block, hairline dividers. */
	.menu {
		overflow: hidden;
		margin-top: 14px;
		border-radius: var(--r-block);
		background: var(--field);
	}

	.item {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		padding: 15px 16px;
		font-size: 15px;
		font-weight: 500;
		text-align: left;
		color: var(--text-2);
	}

	.item:disabled {
		opacity: 0.55;
	}

	.item:active:not(:disabled) {
		background: var(--sunken-2);
	}

	/* On the child, not on `.item`: half these rows are a bare button and half
	   are a button inside its own little form, and only the children line up. */
	.menu > * + * {
		border-top: 1px solid var(--divider-sheet);
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.quiet {
		font-weight: 400;
		color: var(--text-5);
	}

	.delete {
		width: 100%;
		margin-top: 16px;
		padding: 6px;
		font-size: 14px;
		font-weight: 600;
		text-align: center;
		color: var(--danger);
	}

	.well {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 60px;
		margin: 0 auto 18px;
		border-radius: 50%;
		background: var(--danger-tint);
		color: var(--danger);
	}

	h3 {
		margin-bottom: 10px;
		font-size: 22px;
		overflow-wrap: anywhere;
	}

	.copy {
		margin: 0 0 24px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
	}

	.cancel {
		width: 100%;
		padding: 13px;
		font-size: 15px;
		font-weight: 700;
		color: var(--text-2);
	}
</style>
