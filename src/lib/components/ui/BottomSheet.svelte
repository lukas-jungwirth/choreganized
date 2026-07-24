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
	import { messages } from '$lib/i18n';
	import { lockBodyScroll } from '$lib/scroll-lock';
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		title: string;
		/** Uppercase micro-label above the title — what the sheet acts on [4c]. */
		eyebrow?: string;
		/** A line under the title — who this person is [6c], not what to do. */
		subtitle?: string;
		/** Leading element beside the title, e.g. the member's avatar [6c]. */
		lead?: Snippet;
		/**
		 * `dark` re-skins the panel in the cook-mode palette [7b]. Same sheet,
		 * same focus trap, same Escape — a screen that is already dark must not
		 * flash a white panel at someone standing over a hob.
		 */
		tone?: 'light' | 'dark';
		children: Snippet;
	};

	let {
		open = $bindable(),
		title,
		eyebrow,
		subtitle,
		lead,
		tone = 'light',
		children
	}: Props = $props();

	const m = messages();

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
	 * On the window rather than on the dialog, because a form action that
	 * re-renders its own submit button drops focus back to `<body>` — the sheet
	 * is still up, but a keystroke aimed at the dialog never reaches it. Plan
	 * 04's holiday pause is exactly that shape: it posts and stays open.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		if (!ownsEscape(event.target)) return;
		open = false;
	}

	/**
	 * Only the *innermost* dialog answers. A confirm rendered inside this sheet
	 * is a DOM descendant, so without this check its Escape would close the
	 * sheet — and the half-filled form in it — along with the confirm. Asking
	 * where the keystroke came from is sturdier than `stopPropagation`, which
	 * Svelte's delegated keydown does not honour between two handlers.
	 *
	 * When it came from outside every dialog (focus on `<body>`), "innermost" is
	 * the last open dialog in document order — which is the same thing for the
	 * one nesting we build, since the inner one is rendered inside the outer.
	 */
	function ownsEscape(target: EventTarget | null): boolean {
		const from = (target as Element | null)?.closest?.('dialog') ?? null;
		if (from) return from === dialog;

		const stack = document.querySelectorAll('dialog[open]');
		return stack[stack.length - 1] === dialog;
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events (Escape is handled above) -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	class="sheet"
	bind:this={dialog}
	onclose={() => (open = false)}
	onmousedown={onPointerDown}
	onclick={onScrimClick}
	aria-label={title}
>
	{#if open}
		<div class="panel" class:dark={tone === 'dark'}>
			<div class="handle"></div>
			<header class:with-lead={lead}>
				{#if lead}{@render lead()}{/if}
				<div class="titles">
					{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
					<h2>{title}</h2>
					{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
				</div>
				<button type="button" class="close" aria-label={m.ui.close} onclick={() => (open = false)}>
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

	/* An avatar next to a two-line title reads centred, not top-aligned [6c]. */
	.with-lead {
		align-items: center;
		gap: 14px;
	}

	/* Display names and task names are free text — let them wrap. */
	.titles {
		min-width: 0;
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
		overflow-wrap: anywhere;
	}

	.subtitle {
		margin: 3px 0 0;
		font-size: 13px;
		color: var(--text-4);
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

	/* Cook mode's palette [7b]. Only the surfaces change — the shape, the
		 spacing and the behaviour above are the same sheet. */
	.dark {
		background: var(--cook-sheet);
		color: var(--cook-text);
		--input-surface: var(--cook-surface);
	}

	.dark .handle {
		background: var(--cook-track);
	}

	.dark .eyebrow,
	.dark .subtitle {
		color: var(--cook-muted);
	}

	.dark .close {
		background: var(--cook-surface);
		color: var(--cook-text);
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
