<!--
	The timer, once you've walked on to another step (→ SPEC §4.6: "keeps running
	when navigating steps — shrinks to a small chip").

	It sits above the Prev/Next row so it can't be missed and can't be in the
	way, and tapping it goes back to the step the timer belongs to. When it rings
	it turns amber and says so outright — on this screen there is no notification
	to read, because the page claimed the alert for itself.

	Renders nothing when the ring is already on screen: two countdowns of the same
	timer, disagreeing by a tick, is worse than one.
-->
<script lang="ts">
	import type { CookTimer } from '$lib/cook-timer.svelte';
	import { formatDuration } from '$lib/utils/timer-parse';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TimerIcon from '@lucide/svelte/icons/timer';

	type Props = {
		timer: CookTimer;
		/** The step on screen, 0-based. */
		step: number;
		/** Jump back to the timer's own step. */
		onjump: (step: number) => void;
	};

	let { timer, step, onjump }: Props = $props();

	const showing = $derived(timer.active && !timer.isOn(step));
	const rang = $derived(timer.phase === 'rang');
	const elsewhere = $derived(timer.step !== null && timer.step !== step);

	function go() {
		if (timer.step !== null) onjump(timer.step);
		if (rang) timer.dismiss();
	}

	/**
	 * Spelled out rather than left to the contents: read aloud, "3:37 · Mushrooms
	 * ›" says nothing about being a timer or about where tapping it goes.
	 */
	const spoken = $derived(
		`${rang ? `${timer.label} is done` : `${timer.label}, ${formatDuration(timer.remainingSeconds)} left`}` +
			(timer.step === null ? '' : ` — back to step ${timer.step + 1}`)
	);
</script>

{#if showing}
	<button type="button" class="bar" class:rang onclick={go} aria-label={spoken}>
		<TimerIcon size={18} strokeWidth={2} aria-hidden="true" />
		<span class="text">
			{#if rang}
				{timer.label} is done{#if elsewhere && timer.step !== null}
					— back to step {timer.step + 1}{/if}
			{:else}
				<b>{formatDuration(timer.remainingSeconds)}</b> · {timer.label}
				{#if timer.phase === 'paused'}(paused){/if}
			{/if}
		</span>
		<ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
	</button>
{/if}

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		margin-bottom: 12px;
		padding: 12px 16px;
		border-radius: var(--r-input);
		background: var(--cook-surface);
		font-size: 14px;
		font-weight: 500;
		text-align: left;
		color: var(--cook-text);
	}

	.rang {
		background: var(--cook-amber-tint);
		border: 1px solid var(--cook-amber-line);
		color: var(--cook-amber);
		font-weight: 600;
	}

	.text {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	b {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
</style>
