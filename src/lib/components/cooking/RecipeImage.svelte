<!--
	A recipe's photo, or the diagonal-stripe placeholder the design draws
	wherever one is missing [04] [3d] [3c] [7a]. Fills whatever box it's put in,
	so the caller owns size and corners.

	The stripes scale with the surface — 6px on a library card, 8px on the
	290px hero — which is the difference between texture and wallpaper.
-->
<script lang="ts">
	import { uploadUrl } from '$lib/utils/recipes';

	type Props = {
		imagePath: string | null;
		/** The recipe's name; empty where a caption already names it. */
		alt?: string;
		/** Width of one stripe band, in px. */
		stripe?: number;
		/** Above the fold (the hero) — everything else can wait. */
		eager?: boolean;
	};

	let { imagePath, alt = '', stripe = 6, eager = false }: Props = $props();
</script>

{#if imagePath}
	<img src={uploadUrl(imagePath)} {alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
{:else}
	<span
		class="art"
		style:--stripe="{stripe}px"
		role={alt ? 'img' : 'presentation'}
		aria-label={alt || undefined}
	></span>
{/if}

<style>
	img,
	.art {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		background: var(--sunken);
	}

	.art {
		background: repeating-linear-gradient(
			45deg,
			var(--sunken),
			var(--sunken) var(--stripe),
			var(--sunken-2) var(--stripe),
			var(--sunken-2) calc(var(--stripe) * 2)
		);
	}
</style>
