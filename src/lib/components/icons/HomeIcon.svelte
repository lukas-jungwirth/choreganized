<!--
	The four tab icons and the crown are drawn in design/Hearth.dc.html rather
	than taken from Lucide — Lucide's house has a door, its pot a different lid,
	and these five are the shapes the app wears everywhere (→ DESIGN-SYSTEM.md
	"Icons"). Everything else comes from @lucide/svelte.
-->
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
	<path d="M3 10.5L12 3l9 7.5" />
	<path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
</svg>
