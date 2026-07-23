<!--
	Centred dialog: the completion celebration [4d] and the destructive confirms
	([6d] "Leave household", delete task/recipe). Same native <dialog> mechanics
	as BottomSheet — see there for why.

	`dismissible` is off for confirms, where a stray tap on the scrim shouldn't
	answer the question.
-->
<script lang="ts">
	import { lockBodyScroll } from '$lib/scroll-lock';
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		/** Announced as the dialog's name; the visible title lives in `children`. */
		label: string;
		dismissible?: boolean;
		children: Snippet;
	};

	let { open = $bindable(), label, dismissible = true, children }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	$effect(() => {
		if (!open) return;
		return lockBodyScroll();
	});

	/** Press must start on the scrim too — see BottomSheet for why. */
	let pressedScrim = false;

	function onPointerDown(event: MouseEvent) {
		pressedScrim = event.target === dialog;
	}

	function onScrimClick(event: MouseEvent) {
		if (dismissible && pressedScrim && event.target === dialog) open = false;
	}

	/**
	 * Belt and braces alongside `close` — see BottomSheet for why, including the
	 * innermost-dialog check and why the listener sits on the window. A confirm
	 * raised from inside a sheet must not let Escape dismiss the sheet
	 * underneath it, which is the very thing `dismissible={false}` exists to
	 * prevent.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		if (!ownsEscape(event.target)) return;
		if (dismissible) open = false;
	}

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
	class="modal"
	bind:this={dialog}
	onclose={() => (open = false)}
	oncancel={(event) => !dismissible && event.preventDefault()}
	onmousedown={onPointerDown}
	onclick={onScrimClick}
	aria-label={label}
>
	{#if open}
		<div class="panel">{@render children()}</div>
	{/if}
</dialog>

<style>
	.modal {
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

	.modal[open] {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal::backdrop {
		background: var(--scrim);
	}

	.panel {
		width: 100%;
		max-width: 428px; /* 480 shell − the design's 26px side margins */
		max-height: 88dvh;
		overflow-y: auto;
		margin: 0 26px;
		padding: 32px 26px 24px;
		border-radius: var(--r-sheet);
		background: var(--card);
		box-shadow: var(--shadow-modal);
		color: var(--ink);
		text-align: center;
		/* Inputs are white on the paper background but sunken on a white sheet. */
		--input-surface: var(--field);
	}

	.modal[open] .panel {
		animation: pop 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.modal[open]::backdrop {
		animation: fade 200ms ease-out;
	}

	@keyframes pop {
		from {
			transform: scale(0.95);
			opacity: 0;
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.modal[open] .panel,
		.modal[open]::backdrop {
			animation: none;
		}
	}
</style>
