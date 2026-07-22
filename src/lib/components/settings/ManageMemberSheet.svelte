<!--
	Manage a housemate [6c] — the owner's two decisions about someone else, each
	behind its own confirm because neither can be taken back with a tap:
	"Make owner" hands over every permission this sheet is gated on, and
	"Remove" ends their access.

	Both confirms are raised from *inside* this sheet, which is the composition
	BottomSheet and CenterModal were built around (→ DECISIONS #36).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import type { MemberProfile } from '$lib/server/services/household';
	import { formatShortDate, type CalendarDate } from '$lib/utils/dates';
	import UserRoundX from '@lucide/svelte/icons/user-round-x';
	import type { SubmitFunction } from '@sveltejs/kit';

	type Props = {
		member: MemberProfile;
		/** Their points this household-local month — the leaderboard's number. */
		points: number;
		today: CalendarDate;
		onclose: () => void;
	};

	let { member, points, today, onclose }: Props = $props();

	let open = $state(true);
	/** Which question is being asked; `confirmOpen` is whether it's on screen. */
	let confirming = $state<'owner' | 'remove'>('owner');
	let confirmOpen = $state(false);
	let submitting = $state(false);
	let error = $state<string | undefined>();

	function ask(question: 'owner' | 'remove') {
		confirming = question;
		error = undefined;
		confirmOpen = true;
	}

	$effect(() => {
		if (!open) onclose();
	});

	const joined = $derived(
		formatShortDate(member.joined, member.joined.slice(0, 4) !== today.slice(0, 4))
	);

	/**
	 * [6c] writes "210 pts" flat, but points here are this month's — the same
	 * number the podium shows (→ DECISIONS #9) — so the line says which month it
	 * is talking about.
	 */
	const meta = $derived(`Member · joined ${joined} · ${points} pts this month`);

	/** Both actions retire this sheet: the row it belongs to is about to change. */
	const closeOnSuccess: SubmitFunction = () => {
		submitting = true;
		error = undefined;
		return async ({ result, update }) => {
			await update({ reset: false });
			submitting = false;
			// A refusal keeps the question on screen with the reason under it.
			if (result.type === 'failure') {
				error = typeof result.data?.error === 'string' ? result.data.error : "That didn't work.";
				return;
			}
			if (result.type === 'success') {
				confirmOpen = false;
				open = false;
			}
		};
	};
</script>

<BottomSheet bind:open title={member.displayName} subtitle={meta}>
	{#snippet lead()}
		<Avatar name={member.displayName} color={member.color} size={52} />
	{/snippet}

	<div class="menu">
		<button type="button" class="item" onclick={() => ask('owner')}>
			<span class="glyph" aria-hidden="true"><CrownIcon size={20} /></span>
			<span class="what">
				<span class="title">Make owner</span>
				<span class="detail">They'll also be able to manage members</span>
			</span>
		</button>

		<button type="button" class="item danger" onclick={() => ask('remove')}>
			<span class="glyph" aria-hidden="true"><UserRoundX size={20} strokeWidth={1.7} /></span>
			<span class="what">
				<span class="title">Remove from household</span>
				<span class="detail">Loses access · points stay with the house</span>
			</span>
		</button>
	</div>

	<button type="button" class="cancel" onclick={() => (open = false)}>Cancel</button>

	<CenterModal
		bind:open={confirmOpen}
		label={confirming === 'remove' ? 'Remove member' : 'Make owner'}
		dismissible={false}
	>
		{#if confirming === 'remove'}
			<div class="well" aria-hidden="true"><UserRoundX size={26} strokeWidth={1.9} /></div>
			<h3>Remove {member.displayName}?</h3>
			<p class="copy">
				They lose access to the shopping list, tasks and meal plan straight away. Anything assigned
				to them becomes Anyone's, and every point they've scored stays with the house.
			</p>
		{:else}
			<div class="well calm" aria-hidden="true"><CrownIcon size={28} /></div>
			<h3>Make {member.displayName} the owner?</h3>
			<p class="copy">
				They'll be able to rename the household, manage the invite and remove members — including
				you. You stay a member of the house.
			</p>
		{/if}

		{#if error}<p class="error">{error}</p>{/if}

		<form
			method="POST"
			action={confirming === 'remove' ? '?/remove' : '?/makeOwner'}
			use:enhance={closeOnSuccess}
		>
			<input type="hidden" name="memberId" value={member.id} />
			<Button
				type="submit"
				variant={confirming === 'remove' ? 'danger' : 'primary'}
				disabled={submitting}
			>
				{confirming === 'remove' ? 'Remove from household' : 'Make owner'}
			</Button>
		</form>

		<button type="button" class="plain-cancel" onclick={() => (confirmOpen = false)}>Cancel</button>
	</CenterModal>
</BottomSheet>

<style>
	/* The grouped action list [6c] [4b]: one sunken block, hairline dividers. */
	.menu {
		overflow: hidden;
		border-radius: var(--r-block);
		background: var(--field);
	}

	.menu > * + * {
		border-top: 1px solid var(--divider-sheet);
	}

	.item {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		padding: 16px;
		text-align: left;
		color: var(--text-2);
	}

	.item:active {
		background: var(--sunken-2);
	}

	.glyph {
		display: flex;
		flex: none;
		color: var(--text-3);
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.title {
		display: block;
		font-size: 15px;
		font-weight: 600;
	}

	.detail {
		display: block;
		margin-top: 1px;
		font-size: 12.5px;
		color: var(--text-4);
	}

	.danger .glyph,
	.danger .title {
		color: var(--danger);
	}

	.danger .detail {
		color: var(--danger-soft);
	}

	/* [6c] draws the sheet's Cancel as a filled row of its own… */
	.cancel {
		width: 100%;
		margin-top: 14px;
		padding: 15px;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: 15px;
		font-weight: 700;
		color: var(--text-2);
	}

	/* …while a confirm's is the quiet text link every other confirm uses. */
	.plain-cancel {
		width: 100%;
		padding: 13px;
		font-size: 15px;
		font-weight: 700;
		color: var(--text-2);
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

	.well.calm {
		background: var(--sage-tint);
		color: var(--sage);
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

	.error {
		margin: -14px 0 20px;
		font-size: 13px;
		color: var(--danger-deep);
	}
</style>
