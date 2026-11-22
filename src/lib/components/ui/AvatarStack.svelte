<!--
	Overlapping member avatars — the household at a glance, in the Home header
	[8b] and on the standings strip. Overlap and ring width follow the size the
	mockups use them at (36 → -12px/2.5px, 26 → -9px/2px).
-->
<script lang="ts">
	import Avatar from './Avatar.svelte';

	/** `guest`: someone outside the household in Expenses, drawn outlined (→ SPEC §11.15). */
	type StackMember = { id: string; displayName: string; color: string; guest?: boolean };

	type Props = {
		members: StackMember[];
		size?: number;
		/** What the rings cut out of: the screen by default, `--card` on a card. */
		ringColor?: string;
		/**
		 * Set when the stack is the only place these people are named — the Home
		 * header and the standings strip both are, so a screen reader would
		 * otherwise never mention the housemates at all. Leave unset where the
		 * names are already on screen as text.
		 */
		label?: string;
		/**
		 * The most discs drawn, counting a "+N" disc for the rest. Unset draws
		 * everybody; the standings strip sets it, because its text shares the
		 * row and a full house left it four lines tall.
		 */
		max?: number;
	};

	let { members, size = 36, ringColor = 'var(--bg)', label, max }: Props = $props();

	const overlap = $derived(Math.round(size / 3));
	const overflowing = $derived(max !== undefined && members.length > max);
	const shown = $derived(overflowing ? members.slice(0, Math.max(max! - 1, 0)) : members);
	const rest = $derived(members.length - shown.length);
	const names = $derived(members.map((member) => member.displayName).join(', '));
</script>

<span
	class="stack"
	style:--overlap="{overlap}px"
	role={label ? 'img' : undefined}
	aria-label={label ? `${label}: ${names}` : undefined}
	aria-hidden={label ? undefined : 'true'}
>
	{#each shown as member (member.id)}
		<Avatar
			name={member.displayName}
			color={member.color}
			guest={member.guest}
			{size}
			{ringColor}
			ring
		/>
	{/each}
	{#if overflowing}
		<span class="more" style:--more-size="{size}px" style:--more-ring={ringColor}>+{rest}</span>
	{/if}
</span>

<style>
	.stack {
		display: inline-flex;
		align-items: center;
	}

	/* The rest, counted: a disc the size of the others, on the sunken fill
	   rather than a member's colour, so it is never read as one more person. */
	.more {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: var(--more-size);
		height: var(--more-size);
		border-radius: 50%;
		background: var(--sunken);
		box-shadow: 0 0 0 2px var(--more-ring);
		color: var(--text-4);
		/* Inside a disc that cannot grow. */
		font-size: min(var(--fs-12), 12px);
		font-weight: 700;
		line-height: 1;
	}

	.stack > :global(* + *) {
		margin-left: calc(var(--overlap) * -1);
	}
</style>
