<!--
	The top card on Home: the one chore that's on you next, and the two taps it
	deserves (→ SPEC §2.1). Everything else on this screen is a summary that
	sends you somewhere; this one is the screen doing the work.

	Only ever this member's own or an "Anyone" chore, so the tick never needs the
	"who did it?" choice [4d] — it posts straight through, exactly like a row of
	your own on the to-do list.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { NextChore } from '$lib/server/services/home';
	import { daysBetween, type CalendarDate } from '$lib/utils/dates';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Check from '@lucide/svelte/icons/check';
	import Clock from '@lucide/svelte/icons/clock';

	type Props = {
		chore: NextChore;
		today: CalendarDate;
		/** Ticked, not yet confirmed. The page owns the bookkeeping. */
		pending: boolean;
		/** The page hands in the handler, as it does for every check circle [4a]. */
		complete: SubmitFunction;
		onsnooze: () => void;
	};

	let { chore, today, pending, complete, onsnooze }: Props = $props();

	const m = messages();

	const days = $derived(daysBetween(today, chore.dueDate));

	/** "Due today · weekly · worth 10 pts" — same phrases the to-do list uses. */
	const meta = $derived(
		m.home.nextChore.meta(
			m.date.dueMeta(chore.dueDate, today),
			m.task.repeat(chore.recurUnit, chore.recurInterval),
			chore.points
		)
	);
</script>

<Card>
	<div class="chore" class:pending>
		<p class="eyebrow">{m.home.nextChore.eyebrow}</p>
		<h2>{chore.name}</h2>
		<!-- Due today is a nudge, overdue is a flag — the same two moods as a row. -->
		<p class="meta" class:danger={days < 0} class:due={days === 0}>{meta}</p>

		<div class="actions">
			<form method="POST" action="?/complete" use:enhance={complete}>
				<input type="hidden" name="id" value={chore.id} />
				<Button type="submit" disabled={pending}>
					<Check size={20} strokeWidth={2.6} aria-hidden="true" />{m.home.nextChore.markDone}
				</Button>
			</form>

			<!-- Snooze opens the same sheet the detail view does [4c]; the clock is
				 the icon that row wears, and the stopwatch belongs to cook timers. -->
			<button type="button" class="snooze" onclick={onsnooze} aria-label={m.tasks.detail.snooze}>
				<Clock size={22} strokeWidth={1.9} />
			</button>
		</div>
	</div>
</Card>

<style>
	.chore {
		padding: 18px 18px 19px;
		transition: opacity 160ms ease-out;
	}

	/* Ticked and on its way to the server: the card is already leaving. */
	.pending {
		opacity: 0.5;
	}

	.eyebrow {
		margin: 0 0 10px;
		font-size: calc(10px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		/* Terracotta, not sage: this card is the Tasks tab speaking [8b]. */
		color: var(--terracotta);
	}

	h2 {
		margin: 0;
		font-size: calc(25px * var(--fs));
		line-height: 1.1;
		/* "Grünschnittcontainer rausbringen" has nowhere to break. */
		overflow-wrap: anywhere;
	}

	.meta {
		margin: 6px 0 0;
		font-size: calc(14px * var(--fs));
		color: var(--text-4);
	}

	.due {
		font-weight: 600;
		color: var(--terracotta);
	}

	.danger {
		font-weight: 600;
		color: var(--danger);
	}

	.actions {
		display: flex;
		align-items: stretch;
		gap: 10px;
		margin-top: 18px;
	}

	/* The CTA takes the room; the snooze square keeps its 56px. */
	.actions form {
		flex: 1;
		min-width: 0;
	}

	.snooze {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 56px;
		border-radius: var(--r-button);
		background: var(--field);
		color: var(--text-4);
		transition: transform 120ms ease-out;
	}

	.snooze:active {
		transform: scale(0.97);
	}

	@media (prefers-reduced-motion: reduce) {
		.chore,
		.snooze {
			transition: none;
		}
		.snooze:active {
			transform: none;
		}
	}
</style>
