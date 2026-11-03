<!--
	The undo toast: one line on the dark pill above the tab bar, and the one
	button that takes the last thing back [03] [9a]. Shopping's tick and an
	expense's delete both raise it; each says what happened and posts its own
	undo.

	Gone after `duration`, unless a keyboard is on the button — then it is the
	only way back, and it waits.

	The same pill also carries news with a way to it rather than an undo: give
	`href` instead of the form, and a `detail` line under the message. Home's
	"New raccoon!" is that (→ plan 35).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { preloadData } from '$lib/preload';
	import type { RichText } from '$lib/i18n/messages/en';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';

	type Common = {
		/** What just happened, the name bold: "**Milk** checked off". */
		message: RichText;
		/** A second, quieter line under it. */
		detail?: string;
		label: string;
		/** Its few seconds are up, or the undo is away. */
		onclose: () => void;
		/** Re-arms the timer when it changes — a second tick gets its own few seconds. */
		key: unknown;
		icon?: Snippet;
		duration?: number;
	};

	type Props = Common &
		(
			| {
					/** The undo's form action and fields. */
					action: string;
					fields: Record<string, string>;
					undo: SubmitFunction;
					href?: never;
			  }
			| { href: string; action?: never; fields?: never; undo?: never }
		);

	let {
		message,
		detail,
		action,
		fields,
		label,
		undo,
		href,
		onclose,
		key,
		icon,
		duration = 5000
	}: Props = $props();

	/** Held open while a keyboard is on the button — it is the only way back. */
	let held = $state(false);

	$effect(() => {
		key;
		if (held) return;
		const timer = setTimeout(onclose, duration);
		return () => clearTimeout(timer);
	});
</script>

<div class="bar" onfocusin={() => (held = true)} onfocusout={() => (held = false)}>
	<!-- Mounted per event (the page keys it), so this announces once and says the
		 whole thing — the name, and the way out of it, since the bar is not going
		 to be there for long. -->
	<div class="row" role="status">
		{@render icon?.()}
		<span class="text">
			<span class="message">
				{#each message as part}{#if part.strong}<b>{part.text}</b>{:else}{part.text}{/if}{/each}
			</span>
			{#if detail}<span class="detail">{detail}</span>{/if}
		</span>

		{#if href !== undefined}
			<a class="button" {href} data-sveltekit-preload-data={preloadData(href)}>{label}</a>
		{:else}
			<form method="POST" {action} use:enhance={undo}>
				{#each Object.entries(fields ?? {}) as [name, value] (name)}
					<input type="hidden" {name} {value} />
				{/each}
				<button class="button" type="submit">{label}</button>
			</form>
		{/if}
	</div>
</div>

<style>
	/* The tab bar's own framing — pinned to the 480px column, not to the viewport
	   — so bar, dock and tabs line up as one piece of furniture in a desktop
	   window. Above `TimerDock`'s 11, because it is the newer thing to say and
	   the dock is not going anywhere. */
	.bar {
		position: fixed;
		bottom: calc(var(--tabbar-h) + var(--timer-dock-h) + env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		z-index: 12;
		width: 100%;
		max-width: 480px;
		padding: 0 var(--page-pad) 8px;
		animation: rise 180ms ease-out;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 0;
		padding: 10px 10px 10px 14px;
		border-radius: var(--r-sheet);
		background: var(--toast);
		/* The hairline is dark-mode only: on a night screen the pill and the page
		   behind it are both dark, so the edge is what says "this is a separate
		   thing" — in light mode the inversion already does that job, and the token
		   is transparent there.

		   An inset shadow rather than a border, so light mode keeps the exact
		   geometry it had: `* { box-sizing: border-box }` means a 1px border would
		   eat 1px of padding on every side even while invisible. */
		box-shadow:
			inset 0 0 0 1px var(--toast-border),
			var(--shadow-toast);
		font-size: var(--fs-17);
		color: var(--toast-muted);
	}

	/* One line, always: "Sonnenblumenkerne (geschält) checked off" wrapping would
	   push the bar over the tabs it is supposed to sit above. */
	.text {
		flex: 1;
		min-width: 0;
	}

	.message,
	.detail {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	/* The detail may take two lines: it is the news ("… is in your album · 18
	   of 39"), and an ellipsis would cut off the part that matters. */
	.detail {
		font-size: var(--fs-14);
		white-space: normal;
	}

	/* The name is the bright, bold run; "checked off" trails it in the muted
	   tone, the way the sketch weights them. */
	.text b {
		font-weight: 700;
		color: var(--toast-text);
	}

	form {
		flex: none;
	}

	/* 44px of target inside the pill: the padding does the work, and this is
	   tapped in a hurry, one-handed, while holding something else. The sage is
	   lifted for the dark surface (→ `--toast-accent`). */
	.button {
		flex: none;
		padding: 12px 16px;
		margin: -4px 0;
		border-radius: var(--r-chip);
		font-size: var(--fs-17);
		font-weight: 700;
		color: var(--toast-accent);
	}

	.button:active {
		background: var(--toast-press);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
		}
	}
</style>
