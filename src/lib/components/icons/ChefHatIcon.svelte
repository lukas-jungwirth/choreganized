<!-- Cooking tab & tonight's-dinner card. See HomeIcon for why it's bespoke and what `filled` is for. -->
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
			d="M7 14.5C4.8 14 3.3 12.3 3.3 10.4 3.3 8.2 5.1 6.5 7.3 6.6 8 4.5 9.9 3.3 12 3.3 14.1 3.3 16 4.5 16.7 6.6 18.9 6.5 20.7 8.2 20.7 10.4 20.7 12.3 19.2 14 17 14.5V19.4a.9.9 0 0 1-.9.9H7.9a.9.9 0 0 1-.9-.9Z"
		/>
		<!-- the brim, cut out of the solid cap in the bar's surface colour -->
		<path
			d="M7.6 16.9h8.8"
			fill="none"
			style="stroke: var(--bg)"
			stroke-width="1.5"
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
			d="M7 14.5C4.8 14 3.3 12.3 3.3 10.4 3.3 8.2 5.1 6.5 7.3 6.6 8 4.5 9.9 3.3 12 3.3 14.1 3.3 16 4.5 16.7 6.6 18.9 6.5 20.7 8.2 20.7 10.4 20.7 12.3 19.2 14 17 14.5V19.4a.9.9 0 0 1-.9.9H7.9a.9.9 0 0 1-.9-.9Z"
		/>
		<path d="M7 16.9h10" />
	</svg>
{/if}
