<!--
	"Set timer" — the manual way in, for the steps the parser can't read a
	duration out of and the ones where you want a different one anyway
	(→ DECISIONS #14).

	Minutes only. Recipes are written in minutes, a stepper you can also type into
	covers 1 to 12 hours, and seconds would be a second control for a case
	("boil for 90 seconds") that reads fine as 2.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import { MAX_TIMER_SECONDS } from '$lib/utils/timer-parse';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import { untrack } from 'svelte';

	type Props = {
		/** What the step's own text suggested, if anything. */
		suggestedSeconds: number | null;
		onstart: (seconds: number) => void;
		onclose: () => void;
	};

	let { suggestedSeconds, onstart, onclose }: Props = $props();

	const MAX_MINUTES = Math.floor(MAX_TIMER_SECONDS / 60);

	/** A round default that is long enough to be worth walking away from. */
	const FALLBACK_MINUTES = 5;

	let open = $state(true);
	// Seeded once from the step it was opened on, then owned by the stepper — the
	// same `untrack` contract as TaskFormSheet.
	let minutes = $state(
		untrack(() =>
			suggestedSeconds ? Math.max(1, Math.round(suggestedSeconds / 60)) : FALLBACK_MINUTES
		)
	);

	$effect(() => {
		if (!open) onclose();
	});

	function start() {
		// The stepper hands back `null` for an emptied field; it isn't `clearable`
		// here, so this is only a floor for the moment before its blur normalises.
		onstart(Math.min(minutes ?? FALLBACK_MINUTES, MAX_MINUTES) * 60);
		open = false;
	}
</script>

<BottomSheet bind:open title="Set a timer" subtitle="It rings even with the phone locked." tone="dark">
	<div class="body">
		<Stepper label="Minutes" bind:value={minutes} min={1} max={MAX_MINUTES} tone="dark" />

		<button type="button" class="start" onclick={start}>
			<TimerIcon size={18} strokeWidth={2} aria-hidden="true" />
			Start {minutes ?? FALLBACK_MINUTES}-minute timer
		</button>
	</div>
</BottomSheet>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.start {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		width: 100%;
		padding: 16px;
		border-radius: var(--r-button);
		background: var(--sage);
		box-shadow: var(--shadow-button);
		font-size: 16px;
		font-weight: 700;
		color: var(--on-sage);
	}
</style>
