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
	import { messages } from '$lib/i18n';
	import type { CompletionResult, Standing } from '$lib/server/services/tasks';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Check from '@lucide/svelte/icons/check';
	import Star from '@lucide/svelte/icons/star';

	type Props = {
		completion: CompletionResult;
		standing: Standing;
		onclose: () => void;
	};

	let { completion, standing, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let submitting = $state(false);
	/** This form's own rejection — a failed undo must not look like a done one. */
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});

	/** "Rescheduled · Lukas's turn next" — or the truth, when nothing changed hands. */
	const handover = $derived.by(() => {
		const name = completion.nextAssigneeName;
		if (!name) return m.tasks.done.handoverAnyone;
		return completion.rotated ? m.tasks.done.handoverNext(name) : m.tasks.done.handoverSame(name);
	});

	const standings = $derived.by(() => {
		const { points, rival, state } = standing;
		if (!rival) return m.tasks.done.standingsSolo(points);
		if (state === 'leading') return m.tasks.done.standingsLeading(points, rival.points);
		if (state === 'tied') return m.tasks.done.standingsTied(points, rival.points);
		return m.tasks.done.standingsBehind(rival.displayName, rival.points, points);
	});
</script>

<CenterModal bind:open label={m.tasks.done.label}>
	<div class="badge" aria-hidden="true"><Check size={36} strokeWidth={3} /></div>

	<h2>{m.tasks.done.niceWork(completion.memberName)}</h2>
	<p class="what">{m.tasks.done.logged(completion.taskName)}</p>

	<p class="points">
		<Star size={18} strokeWidth={2} aria-hidden="true" />{m.tasks.done.points(completion.points)}
	</p>

	{#if completion.nextDueDate}
		<div class="next">
			<Calendar size={20} strokeWidth={1.9} aria-hidden="true" />
			<span class="when">
				<span class="due">{m.tasks.done.nextDue(m.date.short(completion.nextDueDate))}</span>
				<span class="hand">{handover}</span>
			</span>
		</div>
	{/if}

	<p class="standings">
		<Avatar name={completion.memberName} color={completion.memberColor} size={20} />{standings}
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
						typeof result.data?.error === 'string' ? result.data.error : m.tasks.done.undoFailed;
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
		<button type="submit" class="undo" disabled={submitting}>{m.tasks.done.undo}</button>
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
		font-size: calc(24px * var(--fs));
		overflow-wrap: anywhere;
	}

	.what {
		margin: 0 0 20px;
		font-size: calc(14px * var(--fs));
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
		font-size: calc(17px * var(--fs));
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
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		color: var(--ink);
	}

	.hand {
		display: block;
		margin-top: 1px;
		font-size: calc(12px * var(--fs));
	}

	.standings {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 0 0 18px;
		font-size: calc(13px * var(--fs));
		color: var(--text-4);
	}

	.error {
		margin: 0 0 12px;
		font-size: calc(13px * var(--fs));
		color: var(--danger-deep);
	}

	.undo {
		width: 100%;
		padding: 6px;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--text-4);
	}

	.undo:disabled {
		opacity: 0.55;
	}
</style>
