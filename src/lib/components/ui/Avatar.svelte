<!--
	Member avatar: initial on the member's colour. `empty` renders the dashed
	placeholder used for "Anyone" tasks and the waiting-for-a-housemate row.
	Sizes are the design's: 20 · 26 · 32 · 36 · 44 · 52.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		name?: string;
		color?: string;
		size?: number;
		empty?: boolean;
		/** Adds the paper ring used when avatars overlap or sit on cards. */
		ring?: boolean;
		/** What the ring cuts out of: the screen by default, `--card` on a card. */
		ringColor?: string;
		/** Icon for the empty variant, e.g. the + on "waiting to join" [5d]. */
		children?: Snippet;
	};

	let {
		name = '',
		color = 'var(--member-sage)',
		size = 36,
		empty = false,
		ring = false,
		ringColor = 'var(--bg)',
		children
	}: Props = $props();

	// Spread, not charAt: display names are free text, and charAt(0) would hand
	// back half a surrogate pair for a name that starts with an emoji.
	const initial = $derived(([...name.trim()][0] ?? '').toUpperCase());
</script>

<span
	class="avatar"
	class:empty
	class:ring
	style:--avatar-size="{size}px"
	style:--avatar-color={color}
	style:--avatar-ring={ringColor}
	style:--avatar-ring-width={size >= 32 ? '2.5px' : '2px'}
	aria-hidden="true"
>
	{#if empty}{@render children?.()}{:else}{initial}{/if}
</span>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: var(--avatar-size);
		height: var(--avatar-size);
		border-radius: 50%;
		background: var(--avatar-color);
		color: var(--on-sage);
		font-size: calc(var(--avatar-size) * 0.38);
		font-weight: 700;
		line-height: 1;
		user-select: none;
	}

	.ring {
		box-shadow: 0 0 0 var(--avatar-ring-width) var(--avatar-ring);
	}

	.empty {
		background: var(--divider);
		border: 1.5px dashed var(--border-dashed);
		color: var(--text-disabled);
	}
</style>
