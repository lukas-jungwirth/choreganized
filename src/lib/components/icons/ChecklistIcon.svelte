<!-- Tasks tab & "tasks due today" stat tile. See HomeIcon for why it's bespoke and what `filled` is for. -->
<script lang="ts">
	let {
		size = 23,
		strokeWidth = 1.7,
		filled = false
	}: { size?: number; strokeWidth?: number; filled?: boolean } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={filled ? 2 : strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d="M4.5 7.2h8.5M4.5 12h8.5M4.5 16.8h5.5" />
	<path d="M16.6 6.4l1.7 1.7 3.1-3.2" />
</svg>
