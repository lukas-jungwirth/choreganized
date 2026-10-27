<!-- A recurring expense: the badge on a ledger row and in the detail's pill [9e] [9f], and the Repeats row [9b] — drawn in design/Expenses.dc.html, two arrows chasing each other round. -->
<script lang="ts">
	let { size = 14, strokeWidth = 2 }: { size?: number; strokeWidth?: number } = $props();
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
	<path d="M4 11a7 7 0 0 1 12-4.9L18 8" />
	<path d="M18 4v4h-4" />
	<path d="M20 13a7 7 0 0 1-12 4.9L6 16" />
	<path d="M6 20v-4h4" />
</svg>
