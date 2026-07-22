<!-- Shopping tab & "on shopping list" stat tile. See HomeIcon for why it's bespoke. -->
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
	<path d="M6 8h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 8z" />
	<path d="M9 8a3 3 0 0 1 6 0" />
</svg>
