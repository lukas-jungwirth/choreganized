<!--
	The running timer [7h] — a 220px ring, the remainder in Fraunces 52px, and
	the three things you do to a timer with one hand.

	The stroke is drawn from `timer.fraction`, which is remaining ÷ *what you set
	it for* — so "+1:00" lets the ring grow rather than snapping back to full
	(→ `$lib/cook-timer.svelte.ts`).

	At zero it turns amber and the three controls collapse to one. The alert
	itself — the buzz, the beep, the push that got through to a locked phone — has
	already happened by then; this is just the screen agreeing.
-->
<script lang="ts">
	import type { CookTimer } from '$lib/cook-timer.svelte';
	import { formatDuration } from '$lib/utils/timer-parse';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import X from '@lucide/svelte/icons/x';

	let { timer }: { timer: CookTimer } = $props();

	const RADIUS = 100;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	const rang = $derived(timer.phase === 'rang');
	const held = $derived(timer.phase === 'paused');
	const remaining = $derived(formatDuration(timer.remainingSeconds));
	const total = $derived(formatDuration(timer.totalSeconds));
</script>

<section class="timer" class:rang>
	<div
		class="ring"
		role="timer"
		aria-label="{timer.label}: {rang ? 'done' : `${remaining} left of ${total}`}"
	>
		<svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">
			<circle class="track" cx="110" cy="110" r={RADIUS} />
			<circle
				class="progress"
				cx="110"
				cy="110"
				r={RADIUS}
				stroke-dasharray={CIRCUMFERENCE}
				stroke-dashoffset={CIRCUMFERENCE * (1 - timer.fraction)}
			/>
		</svg>
		<div class="readout">
			<p class="remaining">{remaining}</p>
			<p class="label">{timer.label} · {total}{held ? ' · paused' : ''}</p>
		</div>
	</div>

	<div class="controls">
		{#if rang}
			<button type="button" class="control wide" onclick={() => timer.dismiss()}>Dismiss</button>
		{:else}
			{#if held}
				<button type="button" class="control" onclick={() => timer.resume()}>
					<Play size={17} strokeWidth={2} aria-hidden="true" />Resume
				</button>
			{:else}
				<button type="button" class="control" onclick={() => timer.pause()}>
					<Pause size={17} strokeWidth={2} aria-hidden="true" />Pause
				</button>
			{/if}
			<button type="button" class="control" onclick={() => timer.addMinute()}>+1:00</button>
			<button type="button" class="control" onclick={() => timer.cancel()}>
				<X size={17} strokeWidth={2} aria-hidden="true" />Cancel
			</button>
		{/if}
	</div>

	{#if timer.error}
		<p class="error">{timer.error}</p>
	{/if}
</section>

<style>
	/* `flex: none` — the page hands this its own band between the scrolling step
		 and the pinned Prev/Next row, so the controls can never be scrolled away. */
	.timer {
		display: flex;
		flex: none;
		flex-direction: column;
		align-items: center;
		padding: 12px 24px 0;
	}

	.ring {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 220px;
		height: 220px;
	}

	svg {
		position: absolute;
		/* Start the arc at twelve o'clock, where a clock starts. */
		transform: rotate(-90deg);
	}

	circle {
		fill: none;
		stroke-width: 10;
	}

	.track {
		stroke: var(--cook-surface);
	}

	.progress {
		stroke: var(--sage);
		stroke-linecap: round;
		/* Matched to the tick in `cook-timer.svelte.ts`, so the arc slides between
			 samples instead of stepping five times a second. */
		transition: stroke-dashoffset 200ms linear;
	}

	.rang .progress {
		stroke: var(--cook-amber);
	}

	.readout {
		text-align: center;
	}

	.remaining {
		margin: 0;
		font-family: var(--font-display);
		font-size: 52px;
		font-weight: 600;
		letter-spacing: 0.01em;
		line-height: 1;
		/* The one number on the screen that has to be legible across a kitchen —
			 keep every frame the same width so it can't jitter as digits change. */
		font-variant-numeric: tabular-nums;
		color: var(--cook-text);
	}

	.rang .remaining {
		color: var(--cook-amber);
	}

	.label {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--cook-muted);
		overflow-wrap: anywhere;
	}

	.controls {
		display: flex;
		gap: 12px;
		margin-top: 20px;
	}

	.control {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: var(--r-input);
		background: var(--cook-surface);
		font-size: 15px;
		font-weight: 600;
		color: var(--cook-text);
	}

	.wide {
		padding: 12px 44px;
	}

	.error {
		margin: 16px 0 0;
		font-size: 13px;
		line-height: 1.45;
		text-align: center;
		color: var(--cook-amber);
	}

	@media (prefers-reduced-motion: reduce) {
		.progress {
			transition: none;
		}
	}
</style>
