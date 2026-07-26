<!--
	One task on the to-do list [05] [4a]: check circle, name, meta line, the
	assignee's mini avatar and what it's worth.

	Two targets, one card (→ SPEC §5.1): the circle marks it done on the spot,
	the rest of the card opens the detail sheet [4b]. Siblings rather than nested
	buttons, which HTML doesn't allow and screen readers can't announce.

	Three states change the card rather than just its words. **Overdue** grows a
	danger left edge and a footer saying whose turn it is and when they were
	nudged. **Paused** — the assignee is on holiday — goes grey and quiet instead
	of red; that's the whole promise of the holiday pause. **Pending** is the tap
	that hasn't reached the server yet: the circle fills immediately, because
	ticking a chore off should feel done before the network agrees.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { TaskListItem } from '$lib/server/services/tasks';
	import { daysBetween, type CalendarDate } from '$lib/utils/dates';
	import type { SubmitFunction } from '@sveltejs/kit';
	import AlarmClock from '@lucide/svelte/icons/alarm-clock';
	import Bell from '@lucide/svelte/icons/bell';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';

	type Props = {
		task: TaskListItem;
		today: CalendarDate;
		/** Whose screen this is — decides "It's your turn" over "It's Lukas's turn". */
		currentMemberId: string;
		/** Ticked, not yet confirmed. The page owns the bookkeeping. */
		pending: boolean;
		/** The page hands in the handler so it can do that bookkeeping. */
		complete: SubmitFunction;
		/** Someone else's task: raise the "who did it?" choice instead of submitting. */
		onchoose: () => void;
		onopen: () => void;
	};

	let { task, today, currentMemberId, pending, complete, onchoose, onopen }: Props = $props();

	const m = messages();

	const days = $derived(task.dueDate ? daysBetween(today, task.dueDate) : null);
	const overdue = $derived(!task.paused && days !== null && days < 0);
	const dueToday = $derived(!task.paused && days === 0);

	const repeat = $derived(m.task.repeat(task.recurUnit, task.recurInterval));

	/**
	 * The half after the cadence. A paused task says so instead of counting the
	 * days it's behind, and an undated one-off has only its provenance to offer:
	 * "One-off · added by Elisabeth" [05].
	 */
	const detail = $derived.by(() => {
		if (task.paused && task.assignee?.awayUntil) {
			return m.tasks.row.pausedUntil(m.date.short(task.assignee.awayUntil));
		}
		if (task.dueDate) return m.date.dueMeta(task.dueDate, today);
		return task.createdByName ? m.tasks.row.addedBy(task.createdByName) : null;
	});

	const meta = $derived(detail ? `${repeat} · ${detail}` : repeat);

	/** Whose turn it is, and which mornings they were nudged [4a]. */
	const footer = $derived.by(() => {
		if (!overdue) return null;
		const turn = m.task.turn(
			task.assignee?.displayName ?? null,
			task.assignee?.id === currentMemberId
		);
		const reminded = m.task.reminderNote([task.dueRemindedOn, task.overdueRemindedOn], today);
		return reminded ? `${turn} · ${reminded}` : turn;
	});

	/**
	 * A task that's somebody else's needs the "who did it?" choice before it's
	 * logged (→ SPEC §5.4), so the tick opens that instead of submitting on the
	 * spot. Your own tasks and "Anyone" tasks tick straight through as ever.
	 */
	const needsChoice = $derived(task.assignee !== null && task.assignee.id !== currentMemberId);

	const action = $derived(
		needsChoice && task.assignee
			? m.tasks.row.markDoneFor(task.name, task.assignee.displayName)
			: m.tasks.row.markDone(task.name)
	);

	/**
	 * Someone else's task opens the "who did it?" choice instead of submitting.
	 * Preventing the default click stops both the native POST and `use:enhance`,
	 * so the modal takes over — but only with JavaScript. With none, the handler
	 * never runs and the form submits, completing it as the tapper: a graceful
	 * fallback rather than a dead button.
	 */
	function chooseInstead(event: MouseEvent) {
		event.preventDefault();
		onchoose();
	}
</script>

<li>
	<Card radius="md">
		<div class="task" class:overdue class:paused={task.paused} class:pending>
			<div class="main">
				<!-- Someone else's task opens the "who did it?" choice; the click
					 handler prevents the submit with JS, and without JS the form still
					 posts and completes as the tapper. Everything else ticks straight off. -->
				<form method="POST" action="?/complete" use:enhance={complete}>
					<input type="hidden" name="id" value={task.id} />
					<button
						type="submit"
						class="tick"
						onclick={needsChoice ? chooseInstead : undefined}
						aria-haspopup={needsChoice ? 'dialog' : undefined}
						disabled={pending}
						aria-label={action}
					>
						<CheckCircle checked={pending} size={24} />
					</button>
				</form>

				<button
					type="button"
					class="body"
					onclick={onopen}
					aria-label={m.tasks.row.open(task.name)}
				>
					<span class="name">{task.name}</span>
					<span class="meta" class:danger={overdue} class:due={dueToday}>
						{#if overdue}
							<AlarmClock size={12} strokeWidth={2} aria-hidden="true" />
						{:else if task.recurUnit !== 'none'}
							<RotateCw size={12} strokeWidth={2} aria-hidden="true" />
						{/if}
						{meta}
					</span>
				</button>

				<span class="trailing">
					{#if task.assignee}
						<Avatar name={task.assignee.displayName} color={task.assignee.color} size={22} />
					{:else}
						<!-- "Anyone": a neutral dashed circle, nobody's face (→ SPEC §5.1). -->
						<Avatar empty size={22} />
					{/if}
					<span class="points">{m.task.points(task.points)}</span>
				</span>
			</div>

			{#if footer}
				<p class="footer">
					<Bell size={12} strokeWidth={1.8} aria-hidden="true" />{footer}
				</p>
			{/if}
		</div>
	</Card>
</li>

<style>
	li {
		list-style: none;
	}

	.task {
		position: relative;
		/* Keeps the danger edge inside the card's corners. */
		overflow: hidden;
		border-radius: inherit;
		padding: 14px 15px 13px;
		transition: opacity 160ms ease-out;
	}

	.overdue {
		padding-left: 19px;
	}

	/* The 4px danger edge [4a] — the only thing that shouts, and quietly. */
	.overdue::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		width: 4px;
		background: var(--danger);
	}

	/* On holiday: still on the list, no longer asking for anything (→ SPEC §5.5). */
	.paused {
		opacity: 0.6;
	}

	/* Ticked and on its way to the server: the row is already leaving. */
	.pending {
		opacity: 0.5;
	}

	.main {
		display: flex;
		align-items: center;
		gap: 13px;
	}

	/* Both halves run the full height of the row, so the 44px target is real
	   even though the design's padding is 14px. */
	.tick {
		display: flex;
		align-items: center;
		padding: 11px 6px 11px 0;
		margin: -11px 0;
	}

	.tick:disabled {
		cursor: default;
	}

	.body {
		display: block;
		flex: 1;
		min-width: 0;
		padding: 11px 0;
		margin: -11px 0;
		text-align: left;
	}

	.name {
		display: block;
		font-size: 15px;
		font-weight: 600;
		line-height: 1.2;
		/* "Grünschnittcontainer rausbringen" has nowhere to break. */
		overflow-wrap: anywhere;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 3px;
		font-size: 12px;
		color: var(--text-4);
	}

	/* Due today is a nudge, overdue is a flag — neither is an alarm. */
	.due {
		font-weight: 600;
		color: var(--terracotta);
	}

	.danger {
		font-weight: 600;
		color: var(--danger);
	}

	.trailing {
		display: flex;
		flex: none;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.points {
		font-size: 12px;
		font-weight: 700;
		color: var(--terracotta);
	}

	.footer {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 11px 0 0;
		padding-top: 11px;
		border-top: 1px solid var(--divider);
		font-size: 11.5px;
		color: var(--text-5);
	}

	@media (prefers-reduced-motion: reduce) {
		.task {
			transition: none;
		}
	}
</style>
