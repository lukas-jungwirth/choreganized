<!-- One of the two counts on Home [8b] — a number, a label, and where it leads. -->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		href: string;
		value: number;
		/** Reads after the number: "on shopping list", "tasks due today". */
		label: string;
		/** Accent for the icon — sage for shopping, terracotta for tasks. */
		color: string;
		icon: Snippet;
	};

	let { href, value, label, color, icon }: Props = $props();
</script>

<Card {href} radius="md">
	<span class="tile" style:--accent={color}>
		<span class="icon">{@render icon()}</span>
		<span class="value">{value}</span>
		<span class="label">{label}</span>
	</span>
</Card>

<style>
	.tile {
		display: block;
		padding: 15px;
	}

	.icon {
		display: block;
		margin-bottom: 10px;
		color: var(--accent);
	}

	.value {
		display: block;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 600;
		line-height: 1;
	}

	.label {
		display: block;
		margin-top: 3px;
		font-size: 12.5px;
		color: var(--text-4);
	}
</style>
