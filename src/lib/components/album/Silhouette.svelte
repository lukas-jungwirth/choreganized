<!--
	A raccoon you haven't met yet (→ plan 35): its outline filled with
	`--silhouette`, nothing else. A mask rather than a filter on the picture, so
	the shade can follow the theme: `light-dark()` can paint a colour, but not an
	opacity. Sized like `ui/Mascot`, so the caller places it the same way.
-->
<script lang="ts">
	import { MASCOTS, type MascotName } from '$lib/assets/mascot';

	type Props = {
		name: MascotName;
		/** CSS px; the width follows from the artwork. */
		height: number;
		class?: string;
	};

	let { name, height, class: className }: Props = $props();

	const art = $derived(MASCOTS[name]);
</script>

<span
	class={['silhouette', className]}
	style:--art="url({art.src})"
	style:--height="{height}px"
	style:aspect-ratio="{art.width} / {art.height}"
	aria-hidden="true"
></span>

<style>
	.silhouette {
		display: block;
		flex: none;
		height: var(--height);
		background: var(--silhouette);
		-webkit-mask: var(--art) center / contain no-repeat;
		mask: var(--art) center / contain no-repeat;
		pointer-events: none;
	}
</style>
