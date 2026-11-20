<!--
	The celebration [4d]. It does three jobs at once: says well done, says where
	the task went (a recurring one hasn't disappeared, it has moved), and says
	what it did to the month's standings. Plus the way out — **Undo** puts the
	due date, the assignee, the reminder flags and, for a one-off, the whole task
	row back (→ services/tasks.ts).

	No confetti: the design celebrates with words.

	It is also where the credit is corrected (→ SPEC §5.4, DECISIONS #277). The
	tick credited one person; the row of faces says who it really was. Tap a face
	on and the points are shared, tap one off and they are not. Every tap posts
	`?/doers` and the whole modal redraws from the answer, so the points, the next
	turn and the standings line can't disagree with what was saved.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import { messages } from '$lib/i18n';
	import type { HouseholdMember } from '$lib/server/services/household';
	import type { CompletionResult, Standing } from '$lib/server/services/tasks';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Check from '@lucide/svelte/icons/check';
	import Star from '@lucide/svelte/icons/star';

	type Props = {
		/** What the tick logged. The faces can replace it while the modal is up. */
		completion: CompletionResult;
		/** The reader's own place this month, whoever was credited. */
		standing: Standing;
		/** The household, in join order: one face each. */
		members: HouseholdMember[];
		currentMemberId: string;
		onclose: () => void;
	};

	let {
		completion: logged,
		standing: loggedStanding,
		members,
		currentMemberId,
		onclose
	}: Props = $props();

	const m = messages();

	let open = $state(true);
	let submitting = $state(false);
	/** The answer to the last change of faces; until then, what the tick logged. */
	let changed = $state<{ completion: CompletionResult; standing: Standing } | null>(null);
	const completion = $derived(changed?.completion ?? logged);
	const standing = $derived(changed?.standing ?? loggedStanding);

	const me = $derived(members.find((member) => member.id === currentMemberId));
	const doerIds = $derived(completion.doers.map((doer) => doer.id));
	const together = $derived(completion.doers.length > 1);

	const title = $derived.by(() => {
		const names = completion.doers.map((doer) => doer.displayName);
		return together
			? m.tasks.done.niceWorkTogether(names, doerIds.includes(currentMemberId))
			: m.tasks.done.niceWork(names[0] ?? '');
	});

	const what = $derived(
		together
			? m.tasks.done.shared(completion.taskName, completion.taskPoints, completion.doers.length)
			: m.tasks.done.logged(completion.taskName)
	);
	const points = $derived(
		together ? m.tasks.done.pointsEach(completion.points) : m.tasks.done.points(completion.points)
	);

	/** The doers after a tap on `memberId`: in if they were out, out if they were in. */
	function toggled(memberId: string): string[] {
		return doerIds.includes(memberId)
			? doerIds.filter((id) => id !== memberId)
			: [...doerIds, memberId];
	}

	/**
	 * The faces are never `disabled`: that would drop the keyboard's focus out of
	 * the row on every tap, and hide the last face from a screen reader
	 * altogether. They are `aria-disabled` and the tap is refused here instead
	 * (→ DECISIONS #280). With no JavaScript the server refuses the same two.
	 */
	const change: SubmitFunction = ({ formData, cancel }) => {
		// A second tap while the first is on its way, or the last face tapped off.
		if (submitting || formData.getAll('memberId').length === 0) {
			cancel();
			return;
		}
		submitting = true;
		error = undefined;

		return async ({ result, update }) => {
			// The list behind the modal moves too: the next turn may have changed.
			await update({ reset: false });
			submitting = false;

			if (result.type === 'success' && result.data?.completed) {
				changed = result.data.completed as NonNullable<typeof changed>;
				return;
			}
			if (result.type === 'failure') {
				error = typeof result.data?.error === 'string' ? result.data.error : m.tasks.done.whoFailed;
			}
		};
	};
	/** What the last tap was refused with, a face's or Undo's. */
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

	/** The gap to the rival, not the two totals: "5 points ahead of Elisabeth". */
	const standings = $derived.by(() => {
		const { points: mine, rival, state } = standing;
		if (!rival) return m.tasks.done.standingsSolo(mine);
		if (state === 'tied') return m.tasks.done.standingsTied(rival.displayName);
		const gap = Math.abs(mine - rival.points);
		return state === 'leading'
			? m.tasks.done.standingsAhead(gap, rival.displayName)
			: m.tasks.done.standingsBehind(gap, rival.displayName);
	});
</script>

<CenterModal bind:open label={m.tasks.done.label}>
	<div class="badge" aria-hidden="true"><Check size={36} strokeWidth={3} /></div>

	<h2>{title}</h2>
	<p class="what">{what}</p>

	<p class="points">
		<Star size={18} strokeWidth={2} aria-hidden="true" />{points}
	</p>

	<!-- A tap on a face redraws the lines above without moving focus, so a screen
		 reader would hear nothing: this says what the tap came to. Empty until then,
		 because opening the dialog already reads it. -->
	<p class="sr-only" role="status">
		{#if changed}
			<span>{title}</span>
			<span>{what}</span>
			<span>{points}</span>
			{#if completion.nextDueDate}<span>{handover}</span>{/if}
		{/if}
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

	<!-- Who did it. One small form per face: each posts the doers as they would be
		 after that tap, so it works the same with no JavaScript. Alone in the
		 household there is nobody to share with, and no row. -->
	{#if members.length > 1}
		<div class="who" role="group" aria-labelledby="who-label">
			<p class="who-label">
				<span id="who-label">{m.tasks.done.who}</span>
				<span class="hint">{m.tasks.done.whoHint}</span>
			</p>
			<div class="faces">
				{#each members as member (member.id)}
					{@const on = doerIds.includes(member.id)}
					{@const next = toggled(member.id)}
					<form method="POST" action="?/doers" use:enhance={change}>
						<input type="hidden" name="completionId" value={completion.completionId} />
						<input type="hidden" name="snapshot" value={JSON.stringify(completion.snapshot)} />
						{#each next as id (id)}
							<input type="hidden" name="memberId" value={id} />
						{/each}
						<!-- The last face stays: a completion is always somebody's. Taking
							 it back altogether is what Undo is for, and the face says so.
							 Its name is the word under it ("You" for the reader), so what
							 is heard is what is seen. -->
						<button
							type="submit"
							class="face"
							aria-pressed={on}
							aria-disabled={next.length === 0}
							aria-describedby={next.length === 0 ? 'who-last' : undefined}
						>
							<span class="disc" aria-hidden="true">
								<Avatar name={member.displayName} color={member.color} size={38} />
								<span class="tick"><Check size={11} strokeWidth={3.4} /></span>
							</span>
							<span class="name">
								{member.id === currentMemberId ? m.tasks.done.whoYou : member.displayName}
							</span>
						</button>
					</form>
				{/each}
			</div>
			<p id="who-last" class="sr-only">{m.tasks.done.whoLast}</p>
		</div>
	{/if}

	<p class="standings">
		{#if me}<Avatar name={me.displayName} color={me.color} size={20} />{/if}{standings}
	</p>

	<!-- Either form's rejection, outside both so it belongs to neither. -->
	{#if error}<p class="error" role="alert">{error}</p>{/if}

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
		font-size: var(--fs-28);
		overflow-wrap: anywhere;
	}

	.what {
		margin: 0 0 20px;
		font-size: var(--fs-16);
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
		font-size: var(--fs-20);
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
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--ink);
	}

	.hand {
		display: block;
		margin-top: 1px;
		font-size: var(--fs-14);
	}

	/* The row of faces. Up to 76px each, so a name has room in a small household;
	   five still share one line of the 390px modal. */
	.who {
		margin-bottom: 18px;
		padding: 12px 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--r-block);
	}

	.who-label {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0 6px;
		margin: 0 0 10px;
		font-size: var(--fs-14);
		font-weight: 600;
		color: var(--text-4);
	}

	.hint {
		font-weight: 500;
		color: var(--text-5);
	}

	.faces {
		display: flex;
		justify-content: center;
	}

	.faces form {
		flex: 0 1 76px;
		min-width: 0;
	}

	.face {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		width: 100%;
		padding: 3px 0;
		border-radius: 12px;
	}

	/* The ring is drawn around the avatar, in the gap the padding leaves. */
	.disc {
		position: relative;
		display: flex;
		padding: 3px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 2px transparent;
		transition: box-shadow 150ms ease-out;
	}

	.disc :global(.avatar) {
		opacity: 0.32;
		transition: opacity 150ms ease-out;
	}

	.tick {
		position: absolute;
		right: -1px;
		bottom: -1px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 17px;
		height: 17px;
		border-radius: 50%;
		background: var(--sage);
		box-shadow: 0 0 0 2px var(--card);
		color: var(--on-sage);
		transform: scale(0);
		transition: transform 150ms ease-out;
	}

	.name {
		max-width: 100%;
		overflow: hidden;
		font-size: var(--fs-13);
		font-weight: 500;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-5);
	}

	.face[aria-disabled='true'] {
		cursor: default;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.face[aria-pressed='true'] .disc {
		box-shadow: inset 0 0 0 2px var(--sage);
	}

	.face[aria-pressed='true'] .disc :global(.avatar) {
		opacity: 1;
	}

	.face[aria-pressed='true'] .tick {
		transform: scale(1);
	}

	.face[aria-pressed='true'] .name {
		font-weight: 700;
		color: var(--ink);
	}

	@media (prefers-reduced-motion: reduce) {
		.disc,
		.disc :global(.avatar),
		.tick {
			transition: none;
		}
	}

	.standings {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin: 0 0 18px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.error {
		margin: 0 0 12px;
		font-size: var(--fs-15);
		color: var(--danger-deep);
	}

	.undo {
		width: 100%;
		padding: 6px;
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--text-4);
	}

	.undo:disabled {
		opacity: 0.55;
	}
</style>
