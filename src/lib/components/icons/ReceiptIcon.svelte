<!-- Expenses tab, the empty state [9g] and Home's balance line, drawn in design/Expenses.dc.html. See HomeIcon for why it's bespoke and what `filled` is for. -->
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
	<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
	<path d="M9 8.5h6M9 12h6M9 15.5h3.5" />
</svg>
