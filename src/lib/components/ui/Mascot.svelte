<!--
	The raccoon, by name (→ DECISIONS #211, #215). Every pose a screen shows comes
	through here, so each one:

	- is decorative: `alt=""`, never a tab stop — the title beside it says it all;
	- reserves its box before it loads: `height` is the size you ask for and the
	  width follows from the generated file's own aspect ratio, so the title next
	  to it never jumps sideways when the image arrives;
	- decodes off the main thread.

	The files are AVIFs generated from `artwork/raccoon/` by `npm run icons`;
	`$lib/assets/mascot/index.ts` is generated alongside and lists their sizes.
	Placement belongs to the caller: pass `class` and style it with
	`:global(.that-class)` under one of your own selectors.
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
	const width = $derived(Math.round((height * art.width) / art.height));
</script>

<img class={['mascot', className]} src={art.src} alt="" {width} {height} decoding="async" />

<style>
	.mascot {
		display: block;
		flex: none;
		max-width: none;
		pointer-events: none;
	}
</style>
