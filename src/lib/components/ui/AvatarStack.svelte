<!--
	Overlapping member avatars — the household at a glance, in the Home header
	[8b] and on the standings strip. Overlap and ring width follow the size the
	mockups use them at (36 → -12px/2.5px, 26 → -9px/2px).
-->
<script lang="ts">
	import Avatar from './Avatar.svelte';

	type StackMember = { id: string; displayName: string; color: string };

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
	};

	let { members, size = 36, ringColor = 'var(--bg)', label }: Props = $props();

	const overlap = $derived(Math.round(size / 3));
	const names = $derived(members.map((member) => member.displayName).join(', '));
</script>

<span
	class="stack"
	style:--overlap="{overlap}px"
	role={label ? 'img' : undefined}
	aria-label={label ? `${label}: ${names}` : undefined}
	aria-hidden={label ? undefined : 'true'}
>
	{#each members as member (member.id)}
		<Avatar name={member.displayName} color={member.color} {size} {ringColor} ring />
	{/each}
</span>

<style>
	.stack {
		display: inline-flex;
		align-items: center;
	}

	.stack > :global(* + *) {
		margin-left: calc(var(--overlap) * -1);
	}
</style>
