<!--
	The four tab icons and the crown are drawn in design/Hearth.dc.html rather
	than taken from Lucide — Lucide's house has a door, its hat a different brim,
	and these five are the shapes the app wears everywhere (→ DESIGN-SYSTEM.md
	"Icons"). Everything else comes from @lucide/svelte.

	`filled` is the active-tab treatment [01/1d]: a solid glyph in place of the
	outline. Only the tab bar passes it; every other caller gets the outline.
-->
<script lang="ts">
	let {
		size = 23,
		strokeWidth = 1.7,
		filled = false
	}: { size?: number; strokeWidth?: number; filled?: boolean } = $props();
</script>

{#if filled}
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="currentColor"
		stroke="currentColor"
		stroke-width="1.2"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path
			d="M11 3.9a1.5 1.5 0 0 1 2 0l7.45 6.05A1.5 1.5 0 0 1 21 11.1V18.6A1.5 1.5 0 0 1 19.5 20h-3.7v-4.3a1.8 1.8 0 0 0-3.6 0V20H4.5A1.5 1.5 0 0 1 3 18.6V11.1a1.5 1.5 0 0 1 .55-1.16z"
		/>
	</svg>
{:else}
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
		<path d="M2.6 11.7 12 4l9.4 7.7" />
		<path d="M5 10.2v8.4a1 1 0 0 0 1 1h3.2v-4.3a1.8 1.8 0 0 1 3.6 0v4.3H18a1 1 0 0 0 1-1v-8.4" />
	</svg>
{/if}
