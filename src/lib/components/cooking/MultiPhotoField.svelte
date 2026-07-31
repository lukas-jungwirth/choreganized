<!--
	The photo-import picker [plan 14] — 1–max cookbook photos, shown as a grid of
	thumbnail tiles beside a dashed "add" tile, matching the recipe editor's photo
	well [3c] rather than a bare browser file input.

	A real `<input type="file" name multiple>` lives inside the add tile (a
	`<label>`), so without JavaScript it's still tap-to-pick and the form still
	posts. With JS, each pick is merged into a capped list, previewed, and
	removable — and the list is written back into that same input via a
	`DataTransfer` (`sync`), so the native form post always sends exactly the
	tiles on screen. The input never remounts (the tile is only *hidden* at the
	cap), so the synced files survive.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import Camera from '@lucide/svelte/icons/camera';
	import X from '@lucide/svelte/icons/x';

	type Props = {
		/** The chosen files — bindable so the parent can gate its submit on the count. */
		files: File[];
		name?: string;
		max?: number;
	};

	let { files = $bindable([]), name = 'photos', max = 3 }: Props = $props();

	const m = messages();

	let input: HTMLInputElement | undefined = $state();

	// A preview URL per file, revoked whenever the set changes or the field leaves —
	// a few MB of image each that the browser would otherwise hold until a reload.
	let previews = $state<string[]>([]);
	$effect(() => {
		const urls = files.map((file) => URL.createObjectURL(file));
		previews = urls;
		return () => urls.forEach((url) => URL.revokeObjectURL(url));
	});

	/** Write the list back into the real input, so the native form post sends exactly these. */
	function sync() {
		if (!input) return;
		const data = new DataTransfer();
		for (const file of files) data.items.add(file);
		input.files = data.files;
	}

	function onPick(event: Event & { currentTarget: HTMLInputElement }) {
		const merged = [...files];
		for (const file of Array.from(event.currentTarget.files ?? [])) {
			if (merged.length >= max) break;
			// Skip a photo already in the list — picking "add more" twice is common.
			const dupe = merged.some(
				(kept) =>
					kept.name === file.name &&
					kept.size === file.size &&
					kept.lastModified === file.lastModified
			);
			if (!dupe) merged.push(file);
		}
		files = merged;
		sync();
	}

	function remove(index: number) {
		files = files.filter((_, at) => at !== index);
		sync();
	}
</script>

<div class="picker">
	{#each previews as src, index (index)}
		<div class="thumb">
			<img {src} alt="" />
			<button
				type="button"
				class="remove"
				aria-label={m.cooking.add.removePhoto}
				onclick={() => remove(index)}
			>
				<X size={14} strokeWidth={2.6} />
			</button>
		</div>
	{/each}

	<!-- Hidden, not removed, at the cap: the input inside must stay mounted so its
		 synced files survive (→ the DataTransfer note above). -->
	<label class="add" class:hidden={files.length >= max}>
		<input
			bind:this={input}
			type="file"
			{name}
			accept="image/*"
			multiple
			aria-label={m.cooking.add.addPhotos}
			onchange={onPick}
		/>
		<span class="lens" aria-hidden="true"><Camera size={20} strokeWidth={1.9} /></span>
		<span class="add-label"
			>{files.length ? m.cooking.add.morePhotos : m.cooking.add.addPhotos}</span
		>
	</label>
</div>

<style>
	.picker {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.thumb,
	.add {
		box-sizing: border-box;
		position: relative;
		width: 104px;
		height: 104px;
		border-radius: var(--r-input);
		overflow: hidden;
	}

	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Sits on the photo, so it carries its own translucent surface to stay legible
	   — the same treatment the editor's "Change photo" chip uses [3c]. */
	.remove {
		position: absolute;
		top: 6px;
		right: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--tabbar-bg);
		backdrop-filter: blur(6px);
		color: var(--ink);
	}

	.remove:active {
		transform: scale(0.94);
	}

	.add {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 7px;
		background: var(--sunken);
		border: 1.5px dashed var(--border-dashed);
		color: var(--sage);
		cursor: pointer;
	}

	.add.hidden {
		display: none;
	}

	.add:active {
		background: var(--sunken-2);
	}

	.add:focus-within {
		outline: 2px solid var(--sage);
		outline-offset: 2px;
	}

	.add input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.lens {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.add-label {
		font-size: 11.5px;
		font-weight: 600;
		color: var(--text-4);
	}
</style>
