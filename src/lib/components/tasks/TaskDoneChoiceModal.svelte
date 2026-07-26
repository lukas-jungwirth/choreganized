<!--
	The "who did it?" choice [4d] — raised only when you tick off a task that was
	assigned to somebody else (→ SPEC §5.4). Two answers: **I did it** credits
	you, **{name} did it** credits them. Either way the points, the celebration
	and — for an alternating task — the next turn all follow whoever did it
	(→ services/tasks.ts, DECISIONS #116).

	Both answers post `?/complete` through the page's own completion handler, so
	the optimistic tick and the celebration modal are exactly the ones a plain
	tick would have raised — this only adds the credit.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import { messages } from '$lib/i18n';
	import type { TaskListItem } from '$lib/server/services/tasks';
	import type { SubmitFunction } from '@sveltejs/kit';

	type Props = {
		task: TaskListItem;
		/** Whose screen this is — the "I did it" credit. */
		currentMemberId: string;
		/** The page's completion handler — it owns the optimistic tick and the modal. */
		complete: SubmitFunction;
		onclose: () => void;
	};

	let { task, currentMemberId, complete, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let submitting = $state(false);

	$effect(() => {
		if (!open) onclose();
	});

	// The page only opens this for a task that's somebody else's, but guard the
	// render so a roster change mid-tap can't blow up on a null assignee.
	const assignee = $derived(task.assignee);

	/**
	 * Wrap the page's handler so a chosen answer also flips the local guard and,
	 * on success, lets it clear `choice` (which unmounts us). The page still owns
	 * the optimistic tick and the celebration — this only disables the buttons
	 * so a double-tap can't log the task twice.
	 */
	const choose: SubmitFunction = (input) => {
		submitting = true;
		const after = complete(input);
		return async (opts) => {
			if (typeof after === 'function') await after(opts);
			submitting = false;
		};
	};
</script>

{#if assignee}
	<CenterModal bind:open label={m.tasks.choice.label}>
		<h2>{m.tasks.choice.title}</h2>
		<p class="copy">{m.tasks.choice.assigned(assignee.displayName)}</p>

		<div class="actions">
			<form method="POST" action="?/complete" use:enhance={choose}>
				<input type="hidden" name="id" value={task.id} />
				<input type="hidden" name="creditMemberId" value={currentMemberId} />
				<Button type="submit" disabled={submitting}>{m.tasks.choice.mine}</Button>
			</form>

			<form method="POST" action="?/complete" use:enhance={choose}>
				<input type="hidden" name="id" value={task.id} />
				<input type="hidden" name="creditMemberId" value={assignee.id} />
				<Button type="submit" variant="secondary" disabled={submitting}>
					{m.tasks.choice.forThem(assignee.displayName)}
				</Button>
			</form>
		</div>

		<button type="button" class="cancel" onclick={() => (open = false)} disabled={submitting}>
			{m.common.cancel}
		</button>
	</CenterModal>
{/if}

<style>
	h2 {
		margin-bottom: 8px;
		font-size: 22px;
		overflow-wrap: anywhere;
	}

	.copy {
		margin: 0 0 22px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--text-4);
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.cancel {
		width: 100%;
		margin-top: 14px;
		padding: 8px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-4);
	}

	.cancel:disabled {
		opacity: 0.55;
	}
</style>
