<!-- Tasks tab & "tasks due today" stat tile. See HomeIcon for why it's bespoke. -->
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
	<path d="M4 7h11M4 12h11M4 17h7" />
	<path d="M18.5 6l1.6 1.6L23 4.5" />
</svg>
