<!--
	The app's workhorse surface: add an item [3a], new task [3b], plan a meal
	[3d], snooze [4c]. Sheets are state, not routes (→ DECISIONS #17), so this is
	driven by `bind:open`.

	Built on a native <dialog>, which brings the focus trap, Esc, inert
	background and top-layer stacking with it — none of which is worth
	hand-rolling. Content is only rendered while open, so each opening starts
	from a clean form.
-->
<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { lockBodyScroll } from '$lib/scroll-lock';
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		title: string;
		/** Uppercase micro-label above the title — what the sheet acts on [4c]. */
		eyebrow?: string;
		children: Snippet;
	};

	let { open = $bindable(), title, eyebrow, children }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	// A modal <dialog> blocks scrolling behind it everywhere except iOS Safari.
	$effect(() => {
		if (!open) return;
		return lockBodyScroll();
	});

	/**
	 * Dismiss only when the press *started* on the scrim too. A plain
	 * `target === dialog` check on the click also fires when a drag begins inside
	 * the panel and ends outside it — selecting text in a field, or dragging the
	 * panel's scrollbar — which would throw away a half-filled form.
	 */
	let pressedScrim = false;

	function onPointerDown(event: MouseEvent) {
		pressedScrim = event.target === dialog;
	}

	function onScrimClick(event: MouseEvent) {
		if (pressedScrim && event.target === dialog) open = false;
	}

	/**
	 * Escape belongs to the dialog, which closes itself and fires `close` — but
	 * a sheet that closed visually while `open` stayed true could never be
	 * reopened, and at least one Chromium embedder (the Electron shell this was
	 * built in) never delivers that event. Handling the keystroke as well costs
	 * nothing: both paths only set the same flag.
	 *
	 * Only the *innermost* dialog answers. A confirm rendered inside this sheet
	 * is a DOM descendant, so without this check its Escape would close the
	 * sheet — and the half-filled form in it — along with the confirm. Asking
	 * where the keystroke came from is sturdier than `stopPropagation`, which
	 * Svelte's delegated keydown does not honour between two handlers.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		if ((event.target as Element | null)?.closest('dialog') !== dialog) return;
		open = false;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events (Escape is handled below) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	class="sheet"
	bind:this={dialog}
	onclose={() => (open = false)}
	onmousedown={onPointerDown}
	onclick={onScrimClick}
	onkeydown={onKeydown}
	aria-label={title}
>
	{#if open}
		<div class="panel">
			<div class="handle"></div>
			<header>
				<div>
					{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
					<h2>{title}</h2>
				</div>
				<button type="button" class="close" aria-label="Close" onclick={() => (open = false)}>
					<X size={13} strokeWidth={2.4} />
				</button>
			</header>
			{@render children()}
		</div>
	{/if}
</dialog>

<style>
	.sheet {
		inset: 0;
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: none;
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		overflow: hidden;
	}

	.sheet[open] {
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.sheet::backdrop {
		background: var(--scrim);
	}

	.panel {
		width: 100%;
		max-width: 480px;
		max-height: 92dvh;
		overflow-y: auto;
		padding: 16px 22px calc(28px + env(safe-area-inset-bottom));
		border-radius: var(--r-sheet) var(--r-sheet) 0 0;
		background: var(--card);
		box-shadow: var(--shadow-sheet);
		color: var(--ink);
		/* Inputs are white on the paper background but sunken on a white sheet. */
		--input-surface: var(--field);
	}

	.handle {
		width: 38px;
		height: 5px;
		margin: 0 auto 18px;
		border-radius: 3px;
		background: var(--border);
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}

	.eyebrow {
		margin: 0 0 3px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	h2 {
		font-size: 22px;
	}

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--divider);
		color: var(--text-4);
	}

	.sheet[open] .panel {
		animation: rise 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.sheet[open]::backdrop {
		animation: fade 220ms ease-out;
	}

	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet[open] .panel,
		.sheet[open]::backdrop {
			animation: none;
		}
	}
</style>
