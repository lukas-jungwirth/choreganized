<!--
	"**Avocado** checked off · Undo" — the few seconds after a tick, above the
	tab bar.

	A check is one tap and the row leaves for "Recently bought", which is folded
	up: right when you'd notice you ticked the wrong line, it is also the moment
	the row is hardest to find. So the way back sits under your thumb for a few
	seconds, and then gets out of the way — nothing is lost when it goes, because
	the row is in the section below and un-ticking it there does exactly the same
	thing (which is what keeps this timer honest for anyone who needs longer than
	five seconds).

	It is the one place the app inverts. Everything else here is cream and white,
	so a toast has a harder job than being pretty: it must not read as a row. Sage
	would collide with the checked-state sage; a cream pill would dissolve into
	the sheets. Inverted `--ink` (warmed to `--toast`, so it doesn't go cold next
	to the paper) is the only surface on the palette that says "message, not list"
	at a glance (→ DECISIONS #107). The sage dot and the sage "Undo" keep it
	Choreganized's rather than a system snackbar's.

	Furniture-wise it borrows the timer dock's framing — the 480px column, the
	`rise` — and sits *above* the dock when one is up, the way the FAB does
	(→ DECISIONS #104). Not `ui/Banner`: a banner is an alert you read once, in
	normal flow.

	Undoing posts the same `?/toggle` action a row does, through the page's own
	optimistic handler, so the item is back in its store group before the server
	answers.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';

	type Props = {
		/** What was just ticked off. */
		item: ShoppingListItem;
		/** The page's handler for putting it back — the same one the rows use. */
		undo: SubmitFunction;
		/** Its few seconds are up, or the undo is away. */
		onclose: () => void;
		duration?: number;
	};

	let { item, undo, onclose, duration = 5000 }: Props = $props();

	const m = messages();

	/** Held open while a keyboard is on the button — it is the only way back. */
	let held = $state(false);

	$effect(() => {
		// `item` is read on purpose: a second tick replaces this bar, and the new
		// one gets its own few seconds rather than what was left of these.
		item;
		if (held) return;
		const timer = setTimeout(onclose, duration);
		return () => clearTimeout(timer);
	});
</script>

<div class="bar" onfocusin={() => (held = true)} onfocusout={() => (held = false)}>
	<!-- Mounted per tick (the page keys it), so this announces once and says the
		 whole thing — the name, since "checked off" alone names nothing, and the
		 way out of it, since the bar is not going to be there for long. -->
	<div class="row" role="status">
		<!-- Its own sage, not the list's: this circle sits on the dark pill in both
			 themes, so it lifts with the rest of the toast (→ `--toast-dot`). -->
		<CheckCircle checked size={20} color="var(--toast-dot)" />
		<span class="text">
			{#each m.shopping.undo.checked(item.name) as part}{#if part.strong}<b>{part.text}</b
					>{:else}{part.text}{/if}{/each}
		</span>

		<form method="POST" action="?/toggle" use:enhance={undo}>
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="checked" value="false" />
			<button type="submit">{m.shopping.undo.action}</button>
		</form>
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
		font-size: calc(15px * var(--fs));
		color: var(--toast-muted);
	}

	/* One line, always: "Sonnenblumenkerne (geschält) checked off" wrapping would
	   push the bar over the tabs it is supposed to sit above. */
	.text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
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
	button {
		padding: 12px 16px;
		margin: -4px 0;
		border-radius: var(--r-chip);
		font-size: calc(15px * var(--fs));
		font-weight: 700;
		color: var(--toast-accent);
	}

	button:active {
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
