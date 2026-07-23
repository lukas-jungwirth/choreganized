<!--
	One person in the members list [6b]: avatar, name (+ "(you)"), when they
	moved in, and either the Owner badge or — for the owner looking at a
	housemate — the ••• that opens the manage sheet [6c].

	An `<li>`, because the roster really is a list: its `RowGroup` is the `list`
	variant (→ plan 09).
-->
<script lang="ts">
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import type { MemberProfile } from '$lib/server/services/household';
	import { formatShortDate, type CalendarDate } from '$lib/utils/dates';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';

	type Props = {
		member: MemberProfile;
		you: boolean;
		/** The owner may manage everyone but themselves. */
		manageable: boolean;
		today: CalendarDate;
		onmanage: () => void;
	};

	let { member, you, manageable, today, onmanage }: Props = $props();

	const joined = $derived(
		formatShortDate(member.joined, member.joined.slice(0, 4) !== today.slice(0, 4))
	);
</script>

<li class="member">
	<Avatar name={member.displayName} color={member.color} size={40} />

	<div class="who">
		<p class="name">
			{member.displayName}{#if you}<span class="you">(you)</span>{/if}
		</p>
		<p class="meta">
			{member.role === 'owner' ? 'Joined' : 'Member · joined'}
			{joined}
		</p>
	</div>

	{#if member.role === 'owner'}
		<span class="badge"><CrownIcon size={12} />Owner</span>
	{/if}

	{#if manageable}
		<button type="button" class="more" aria-label="Manage {member.displayName}" onclick={onmanage}>
			<MoreHorizontal size={18} strokeWidth={2.4} />
		</button>
	{/if}
</li>

<style>
	.member {
		display: flex;
		align-items: center;
		gap: 13px;
		padding: 14px 16px;
	}

	.who {
		flex: 1;
		min-width: 0;
	}

	.name {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.you {
		margin-left: 5px;
		font-weight: 500;
		color: var(--text-5);
	}

	.meta {
		margin: 1px 0 0;
		font-size: 12.5px;
		color: var(--text-4);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		flex: none;
		padding: 5px 11px;
		border-radius: var(--r-chip);
		background: var(--sage-tint);
		font-size: 11px;
		font-weight: 700;
		color: var(--sage);
	}

	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: var(--field);
		color: var(--text-4);
	}

	.more:active {
		background: var(--sunken-2);
	}
</style>
