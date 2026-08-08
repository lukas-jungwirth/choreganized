<!--
	The timer, once you've walked out of cook mode altogether [7h].

	Same idea as `CookTimerBar` and deliberately not the same component: that one
	moves the cursor *inside* cook mode, this one navigates back to it, and a bar
	pinned above the tab bar is different furniture from a row above Prev/Next.
	It is not a `ui/Banner` either — a banner is an alert you read once, in normal
	flow; this is the compact rendering of something still running, and you glance
	at it while scrolling a shopping list (→ DECISIONS #104).

	It counts down but never claims: the claim lives in the store, which is one
	object however many screens are up, so a timer can only ever ring once
	(→ DECISIONS #103, #83).

	Mounted by the `(app)` layout outside cook mode, so it can never appear over
	the ring.
-->
<script lang="ts">
	import { cookTimers } from '$lib/cook-timer.svelte';
	import { messages } from '$lib/i18n';
	import { formatDuration } from '$lib/utils/timer-parse';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import X from '@lucide/svelte/icons/x';

	const m = messages();

	const timer = $derived(cookTimers.next);
	const rang = $derived(timer?.phase === 'rang');
	/** The ones this row isn't showing — "+2". */
	const others = $derived(Math.max(0, cookTimers.all.length - 1));

	/**
	 * Spelled out rather than left to the contents: read aloud, "2:41 · Mushrooms
	 * +2 ›" says nothing about being a timer or about where tapping it goes.
	 */
	const spoken = $derived(
		!timer
			? ''
			: (rang
					? m.cooking.dock.done(timer.label)
					: m.cooking.dock.running(timer.label, formatDuration(timer.remainingSeconds))) +
					(others ? m.cooking.dock.andMore(others) : '') +
					m.cooking.dock.backTo
	);
</script>

{#if timer}
	<!-- The live region is this one node, and it is **empty until a timer rings**.
		 Wrapping the row itself would make the countdown a live region: a screen
		 reader would announce "19:58 · Oven", "19:57 · Oven" once a second for
		 twenty minutes, queued ahead of everything else on the page. The ring has
		 the same shape for the same reason (`role="timer"`, not a live region). -->
	<p class="sr-only" role="status">{rang ? m.cooking.dock.done(timer.label) : ''}</p>

	<div class="dock">
		<a class="row" class:rang href={timer.href} aria-label={spoken}>
			<TimerIcon size={17} strokeWidth={2} aria-hidden="true" />
			<span class="text">
				{#if rang}
					{m.cooking.dock.done(timer.label)}
				{:else}
					<b class="time">{formatDuration(timer.remainingSeconds)}</b> · {timer.label}
				{/if}
			</span>
			{#if others}
				<span class="more" aria-hidden="true">{m.cooking.dock.more(others)}</span>
			{/if}
			<ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
		</a>

		<!-- A sibling, not a child: a button inside a card-sized link is invalid
			 HTML — the same split `ui/Banner` documents for its `href` form. -->
		{#if rang}
			<button
				type="button"
				class="dismiss"
				aria-label={m.cooking.dock.dismiss}
				onclick={() => timer.dismiss()}
			>
				<X size={17} strokeWidth={2.2} />
			</button>
		{/if}
	</div>
{/if}

<style>
	/* The tab bar's own positioning — pinned to the 480px column rather than to
	   the viewport — so the two line up as one piece of furniture in a desktop
	   window. `z-index: 11` and not 9: the dock sits *above* the tab bar
	   geometrically so it can never cover the tabs, and 11 keeps
	   `--shadow-tabbar`'s upward throw off its bottom edge. */
	/* The same shape WeekStrip and TaskFormSheet use. */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.dock {
		position: fixed;
		bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		left: 50%;
		transform: translateX(-50%);
		z-index: 11;
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		max-width: 480px;
		padding: 0 var(--page-pad) 8px;
		animation: rise 180ms ease-out;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
		padding: 11px 14px;
		border: 1px solid var(--border);
		border-radius: var(--r-button);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: calc(14px * var(--fs));
		color: var(--text-2);
	}

	/* One line, always: a wrapped label would grow past the height the shell was
	   told to leave for it. */
	.text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.time {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--sage-deep);
	}

	.more {
		flex: none;
		padding: 3px 8px;
		border-radius: var(--r-chip);
		background: var(--sunken);
		font-size: calc(12px * var(--fs));
		font-weight: 700;
		color: var(--text-4);
	}

	/* Terracotta, because in this app terracotta already means "now" — it is what
	   "due today" is written in. Danger would be a lie about a pan. */
	.rang {
		border-color: var(--terracotta);
		background: var(--terracotta-tint);
		color: var(--terracotta-deep);
	}

	.rang .time {
		color: var(--terracotta-deep);
	}

	/* 44px, the floor DESIGN-SYSTEM.md sets for a touch target — the same size
	   `CookTimerBar`'s × is, and this one is tapped in a hurry. */
	.dismiss {
		display: grid;
		place-items: center;
		flex: none;
		width: 44px;
		height: 44px;
		border: 1px solid var(--border);
		border-radius: var(--r-chip);
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--text-4);
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
		.dock {
			animation: none;
		}
	}
</style>
