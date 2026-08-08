<!--
	A timer you aren't standing on (→ SPEC §4.6: "keeps running when navigating
	steps — shrinks to a small chip"). With three of them possible, the page
	renders one of these per timer that isn't the one the ring is showing.

	It sits above the Prev/Next row so it can't be missed and can't be in the
	way. The wide left half goes back to the timer it belongs to; the × stops it
	where it stands, so a pan you've taken off the heat doesn't need a trip back
	to its step first. `+1:00` and Pause stay on the ring, one tap away.

	When it rings it turns amber and says so outright — on this screen there is no
	notification to read, because the page claimed the alert for itself.

	Which timers get a bar is the page's decision, not this component's: two
	timers can share a step, and a "is my ring up" test here would wrongly hide
	the second one.
-->
<script lang="ts">
	import type { CookTimer } from '$lib/cook-timer.svelte';
	import { messages } from '$lib/i18n';
	import { formatDuration } from '$lib/utils/timer-parse';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import X from '@lucide/svelte/icons/x';

	type Props = {
		timer: CookTimer;
		/** The recipe on screen — a timer from another one is a link, not a jump. */
		recipeId: string;
		/** The step on screen, 0-based. */
		step: number;
		/** Jump back to the timer's own step. */
		onjump: (step: number) => void;
	};

	let { timer, recipeId, step, onjump }: Props = $props();

	const m = messages();

	const rang = $derived(timer.phase === 'rang');
	/** Another recipe's pan: moving this screen's cursor would be a lie. */
	const here = $derived(timer.recipeId === recipeId);
	/**
	 * Whether "back to step n" is worth saying. Step numbers only compare within
	 * one recipe — for another recipe's timer the hint is always worth it, even
	 * when the two happen to be sitting on the same index.
	 */
	const elsewhere = $derived(timer.step !== null && (!here || timer.step !== step));

	function go() {
		if (timer.step !== null) onjump(timer.step);
		if (rang) timer.dismiss();
	}

	/**
	 * Spelled out rather than left to the contents: read aloud, "3:37 · Mushrooms
	 * ›" says nothing about being a timer or about where tapping it goes.
	 */
	const spoken = $derived(
		(rang
			? m.cooking.cook.barDone(timer.label)
			: m.cooking.cook.barRunning(timer.label, formatDuration(timer.remainingSeconds))) +
			(timer.step === null ? '' : m.cooking.cook.barBackTo(timer.step + 1))
	);
</script>

<!-- A <div>, because the × cannot live inside the jump control. -->
<div class="bar" class:rang>
	{#if here}
		<button type="button" class="jump" onclick={go} aria-label={spoken}>
			{@render body()}
		</button>
	{:else}
		<a class="jump" href={timer.href} aria-label={spoken}>
			{@render body()}
		</a>
	{/if}

	<button
		type="button"
		class="drop"
		aria-label={m.cooking.cook.timerCancelOne(timer.label)}
		onclick={() => (rang ? timer.dismiss() : timer.cancel())}
	>
		<X size={16} strokeWidth={2.2} />
	</button>
</div>

{#snippet body()}
	<TimerIcon size={18} strokeWidth={2} aria-hidden="true" />
	<span class="text">
		{#if rang}
			{m.cooking.cook.barDone(
				timer.label
			)}{#if elsewhere && timer.step !== null}{m.cooking.cook.barBackTo(timer.step + 1)}{/if}
		{:else}
			<b>{formatDuration(timer.remainingSeconds)}</b> · {timer.label}
			{#if timer.phase === 'paused'}{m.cooking.cook.paused}{/if}
		{/if}
	</span>
	<ChevronRight size={17} strokeWidth={2.2} aria-hidden="true" />
{/snippet}

<style>
	.bar {
		display: flex;
		align-items: stretch;
		gap: 6px;
		width: 100%;
		min-height: 44px;
		margin-bottom: 12px;
		border-radius: var(--r-input);
		background: var(--cook-surface);
		font-size: calc(14px * var(--fs));
		font-weight: 500;
		color: var(--cook-text);
	}

	.jump {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		min-width: 0;
		padding: 12px 4px 12px 16px;
		text-align: left;
		color: inherit;
	}

	.rang {
		border: 1px solid var(--cook-amber-line);
		background: var(--cook-amber-tint);
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

	/* 44px of target, so a timer you are not standing on can still be stopped. */
	.drop {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 44px;
		border-radius: var(--r-input);
		color: inherit;
		opacity: 0.7;
	}

	.drop:active {
		opacity: 1;
	}
</style>
