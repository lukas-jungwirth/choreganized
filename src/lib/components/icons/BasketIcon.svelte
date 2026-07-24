<!-- Shopping tab & "on shopping list" stat tile. See HomeIcon for why it's bespoke and what `filled` is for. -->
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
			d="M5.6 9.7a1.4 1.4 0 0 1 1.4-1.5h10a1.4 1.4 0 0 1 1.4 1.5l.6 9.1a1.8 1.8 0 0 1-1.8 1.9H6.8a1.8 1.8 0 0 1-1.8-1.9z"
		/>
		<path
			d="M9.2 8.2V7.3a2.8 2.8 0 0 1 5.6 0v.9"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"
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
		<path
			d="M5.6 9.7a1.4 1.4 0 0 1 1.4-1.5h10a1.4 1.4 0 0 1 1.4 1.5l.6 9.1a1.8 1.8 0 0 1-1.8 1.9H6.8a1.8 1.8 0 0 1-1.8-1.9z"
		/>
		<path d="M9.2 10.6V7.3a2.8 2.8 0 0 1 5.6 0v3.3" />
	</svg>
{/if}
