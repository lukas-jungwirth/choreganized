<!--
	The celebration [4d]. It does three jobs at once: says well done, says where
	the task went (a recurring one hasn't disappeared, it has moved), and says
	what it did to the month's standings. Plus the way out — **Undo** puts the
	due date, the assignee, the reminder flags and, for a one-off, the whole task
	row back (→ services/tasks.ts).

	No confetti: the design celebrates with words.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import type { CompletionResult, Standing } from '$lib/server/services/tasks';
	import { formatShortDate } from '$lib/utils/dates';
	import { possessive } from '$lib/utils/tasks';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Check from '@lucide/svelte/icons/check';
	import Star from '@lucide/svelte/icons/star';

	type Props = {
		completion: CompletionResult;
		standing: Standing;
		/** The completer's colour, for the little avatar on the standings line. */
		color: string;
		onclose: () => void;
	};

	let { completion, standing, color, onclose }: Props = $props();

	let open = $state(true);
	let submitting = $state(false);
	/** This form's own rejection — a failed undo must not look like a done one. */
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});

	/** "Rescheduled · Lukas's turn next" — or the truth, when nothing changed hands. */
	const handover = $derived.by(() => {
		if (!completion.nextAssigneeName) return 'Rescheduled · anyone can take it';
		const name = possessive(completion.nextAssigneeName);
		return completion.rotated ? `Rescheduled · ${name} turn next` : `Rescheduled · still ${name}`;
	});

	const standings = $derived.by(() => {
		const { points, rival, state } = standing;
		if (!rival) return `${points} points this month`;
		if (state === 'leading') return `You're now leading ${points} – ${rival.points}`;
		if (state === 'tied') return `You're level at ${points} – ${rival.points}`;
		return `${rival.displayName} leads ${rival.points} – ${points}`;
	});
</script>

<CenterModal bind:open label="Task completed">
	<div class="badge" aria-hidden="true"><Check size={36} strokeWidth={3} /></div>

	<h2>Nice work, {completion.memberName}!</h2>
	<p class="what">{completion.taskName} · logged to history</p>

	<p class="points">
		<Star size={18} strokeWidth={2} aria-hidden="true" />+{completion.points} points
	</p>

	{#if completion.nextDueDate}
		<div class="next">
			<Calendar size={20} strokeWidth={1.9} aria-hidden="true" />
			<span class="when">
				<span class="due">Next due {formatShortDate(completion.nextDueDate)}</span>
				<span class="hand">{handover}</span>
			</span>
		</div>
	{/if}

	<p class="standings">
		<Avatar name={completion.memberName} {color} size={20} />{standings}
	</p>

	<form
		method="POST"
		action="?/undo"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				// A rejected undo keeps the modal — and the points it is offering to
				// take back — on screen, rather than closing as if it had worked.
				if (result.type === 'failure') {
					error =
						typeof result.data?.error === 'string' ? result.data.error : "Couldn't undo that one.";
					return;
				}
				open = false;
			};
		}}
	>
		<input type="hidden" name="completionId" value={completion.completionId} />
		<!-- Everything needed to put the world back, straight from the response
			 that opened this modal (→ services/tasks.ts `TaskSnapshot`). -->
		<input type="hidden" name="snapshot" value={JSON.stringify(completion.snapshot)} />
		{#if error}<p class="error">{error}</p>{/if}
		<button type="submit" class="undo" disabled={submitting}>Undo</button>
	</form>
</CenterModal>

<style>
	.badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		margin: 0 auto 20px;
		border-radius: 50%;
		background: var(--sage);
		color: var(--on-sage);
		box-shadow: var(--shadow-fab);
	}

	h2 {
		margin-bottom: 6px;
		font-size: 24px;
		overflow-wrap: anywhere;
	}

	.what {
		margin: 0 0 20px;
		font-size: 14px;
		color: var(--text-4);
		overflow-wrap: anywhere;
	}

	.points {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 20px;
		padding: 10px 20px;
		border-radius: var(--r-chip);
		background: var(--sage-tint);
		font-size: 17px;
		font-weight: 700;
		color: var(--sage-deep);
	}

	.points :global(svg) {
		color: var(--sage);
	}

	.next {
		display: flex;
		align-items: center;
		gap: 11px;
		margin-bottom: 20px;
		padding: 14px 16px;
		border-radius: var(--r-block);
		background: var(--field);
		text-align: left;
		color: var(--text-4);
	}

	.when {
		flex: 1;
		min-width: 0;
	}

	.due {
		display: block;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink);
	}

	.hand {
		display: block;
		margin-top: 1px;
		font-size: 12px;
	}

	.standings {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 0 0 18px;
		font-size: 13px;
		color: var(--text-4);
	}

	.error {
		margin: 0 0 12px;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.undo {
		width: 100%;
		padding: 6px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-4);
	}

	.undo:disabled {
		opacity: 0.55;
	}
</style>
