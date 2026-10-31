<!--
	The app's workhorse surface: add an item [3a], new task [3b], plan a meal
	[3d], snooze [4c]. Sheets are state, not routes (→ DECISIONS #17), so this is
	driven by `bind:open`.

	The handle means what it looks like: drag the handle or the title row down
	and the sheet follows, past a third of its height (or on a flick) it
	closes; pull it up and it stretches a little and bounces back. Only there,
	never the body, so scrolling a long sheet or selecting text in a field is
	never a drag.

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
		/** Replaces the × in the header — "Clear all" in All filters [9f]. Escape and the scrim still close. */
		action?: Snippet;
		children: Snippet;
	};

	let {
		open = $bindable(),
		title,
		eyebrow,
		subtitle,
		lead,
		tone = 'light',
		action,
		children
	}: Props = $props();

	const m = messages();

	let dialog: HTMLDialogElement | undefined = $state();
	let panel: HTMLDivElement | undefined = $state();

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
	 * Stay above the on-screen keyboard. Both phone browsers lay the page out
	 * as if the keyboard weren't there and only shrink the *visual* viewport,
	 * so a sheet pinned to the bottom of the screen ends up behind the keys
	 * with the field you are typing in. Sizing the dialog to the visual
	 * viewport puts the panel's bottom edge on top of the keyboard, and the
	 * panel scrolls inside what is left.
	 */
	$effect(() => {
		const viewport = window.visualViewport;
		if (!open || !dialog || !viewport) return;
		const sheet = dialog;

		function follow() {
			if (!viewport) return;
			sheet.style.setProperty('--viewport-top', `${viewport.offsetTop}px`);
			sheet.style.setProperty('--viewport-height', `${viewport.height}px`);
		}

		function resize() {
			follow();
			// The field had focus before the panel got shorter: keep it in view.
			const field = document.activeElement;
			if (field instanceof HTMLElement && field !== sheet && sheet.contains(field)) {
				field.scrollIntoView({ block: 'nearest' });
			}
		}

		follow();
		viewport.addEventListener('resize', resize);
		viewport.addEventListener('scroll', follow);
		return () => {
			viewport.removeEventListener('resize', resize);
			viewport.removeEventListener('scroll', follow);
			sheet.style.removeProperty('--viewport-top');
			sheet.style.removeProperty('--viewport-height');
		};
	});

	/**
	 * Dragging by the handle (→ DECISIONS #205). `drag` is the finger's travel
	 * since it went down: positive moves the panel down, negative stretches it.
	 * `settling` springs back with a little overshoot; `leaving` slides the
	 * panel out before `open` flips, so the close looks like the drag's end.
	 */
	const CLOSE_FLICK = 0.5; // px per ms, downwards
	const STRETCH_MAX = 28;

	let drag = $state(0);
	let phase = $state<'idle' | 'dragging' | 'settling' | 'leaving'>('idle');
	let pointer: number | null = null;
	let startY = 0;
	let samples: { y: number; t: number }[] = [];

	const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const down = $derived(phase === 'leaving' ? 0 : Math.max(drag, 0));
	/** Resistance grows with the pull: a long pull still only gives ~28px. */
	const stretch = $derived(
		drag < 0 && phase === 'dragging' && !reducedMotion()
			? STRETCH_MAX * (1 - Math.exp(drag / 90))
			: 0
	);
	const fade = $derived(
		phase === 'leaving' ? 0 : panel ? Math.max(0, 1 - down / panel.offsetHeight) : 1
	);

	// Every opening starts from rest.
	$effect(() => {
		if (open) return;
		drag = 0;
		phase = 'idle';
		pointer = null;
	});

	function onGripDown(event: PointerEvent) {
		if (event.button !== 0 || phase === 'leaving') return;
		// The × and a header action stay plain buttons.
		if ((event.target as Element).closest('button, a, input, select, textarea')) return;
		pointer = event.pointerId;
		startY = event.clientY;
		samples = [{ y: event.clientY, t: event.timeStamp }];
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		drag = 0;
		phase = 'dragging';
	}

	function onGripMove(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		drag = event.clientY - startY;
		samples.push({ y: event.clientY, t: event.timeStamp });
		// Velocity is read over the last 100 ms, not the whole drag.
		while (samples.length > 2 && event.timeStamp - samples[0].t > 100) samples.shift();
	}

	function onGripUp(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		pointer = null;
		const first = samples[0];
		const velocity = (event.clientY - first.y) / Math.max(1, event.timeStamp - first.t);
		const height = panel?.offsetHeight ?? Infinity;
		if (drag > height / 3 || (drag > 24 && velocity > CLOSE_FLICK)) leave();
		else settle();
	}

	function onGripCancel(event: PointerEvent) {
		if (event.pointerId !== pointer) return;
		pointer = null;
		settle();
	}

	function settle() {
		drag = 0;
		phase = 'settling';
	}

	function leave() {
		if (reducedMotion()) {
			open = false;
			return;
		}
		phase = 'leaving';
		// The slide-out is 200 ms; `open` flips once it is over.
		setTimeout(() => (open = false), 200);
	}

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
		// Something inside the sheet has already answered this Escape — a
		// suggestion list closing itself, say. Dismissables nest; the innermost
		// one wins, and taking the whole half-filled form as well would be a
		// second, unasked-for dismissal.
		if (event.defaultPrevented) return;
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
	class:dragging={phase === 'dragging'}
	style:--sheet-fade={fade}
>
	{#if open}
		<div
			class="panel {phase}"
			class:dark={tone === 'dark'}
			bind:this={panel}
			style:transform={down ? `translateY(${down}px)` : undefined}
			style:--stretch="{stretch}px"
		>
			<!-- svelte-ignore a11y_no_static_element_interactions (a pointer shortcut: the × and Escape close it from a keyboard) -->
			<div
				class="grip"
				onpointerdown={onGripDown}
				onpointermove={onGripMove}
				onpointerup={onGripUp}
				onpointercancel={onGripCancel}
			>
				<div class="handle"></div>
				<header class:with-lead={lead}>
					{#if lead}{@render lead()}{/if}
					<div class="titles">
						{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
						<h2>{title}</h2>
						{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
					</div>
					{#if action}
						{@render action()}
					{:else}
						<button
							type="button"
							class="close"
							aria-label={m.ui.close}
							onclick={() => (open = false)}
						>
							<X size={13} strokeWidth={2.4} />
						</button>
					{/if}
				</header>
			</div>
			{@render children()}
		</div>
	{/if}
</dialog>

<style>
	/* The visible part of the screen, so the keyboard never covers the panel. */
	.sheet {
		inset: var(--viewport-top, 0px) 0 auto;
		width: 100%;
		max-width: none;
		height: var(--viewport-height, 100%);
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
		/* Fades with the panel as it is dragged down. */
		opacity: var(--sheet-fade, 1);
		transition: opacity 200ms ease-out;
	}

	.panel {
		width: 100%;
		max-width: 480px;
		max-height: 92%;
		overflow-y: auto;
		/* `--stretch` is the upward pull: the panel grows from the bottom. */
		padding: 16px 22px calc(28px + env(safe-area-inset-bottom) + var(--stretch, 0px));
		border-radius: var(--r-sheet) var(--r-sheet) 0 0;
		background: var(--card);
		box-shadow: var(--shadow-sheet);
		color: var(--ink);
		/* Inputs are white on the paper background but sunken on a white sheet. */
		--input-surface: var(--field);
	}

	/* Where a drag starts. `touch-action` keeps the browser from scrolling it. */
	.grip {
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.grip:active {
		cursor: grabbing;
	}

	.sheet.dragging::backdrop {
		transition: none;
	}

	/* Follows the finger 1:1 while dragging; springs back with an overshoot. */
	.panel.settling {
		transition:
			transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1),
			padding-bottom 360ms cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.panel.leaving {
		transform: translateY(100%);
		transition: transform 200ms ease-in;
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
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	h2 {
		font-size: var(--fs-24);
		overflow-wrap: anywhere;
	}

	.subtitle {
		margin: 3px 0 0;
		font-size: var(--fs-15);
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

		.panel.settling,
		.sheet::backdrop {
			transition: none;
		}
	}
</style>
