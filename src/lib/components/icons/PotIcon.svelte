<!-- Cooking tab. See HomeIcon for why it's bespoke. -->
<script lang="ts">
	let { size = 23, strokeWidth = 1.9 }: { size?: number; strokeWidth?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d="M5 11h14v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3z" />
	<path d="M4 11h16" />
	<path d="M9 7c0-1.5 1-2 1.5-3M14 7c0-1.5-1-2-1.5-3" />
</svg>
