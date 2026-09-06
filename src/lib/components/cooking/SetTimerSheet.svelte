<!--
	"Set a timer" — the manual way in, for the steps the parser can't read a
	duration out of, the ones where you want a different one anyway
	(→ DECISIONS #14), and the ones where the timer wants a name of its own
	(→ DECISIONS #134).

	Minutes only. Recipes are written in minutes, a stepper you can also type into
	covers 1 to 12 hours, and seconds would be a second control for a case
	("boil for 90 seconds") that reads fine as 2.

	**The name is optional and never has to be typed.** Left empty a timer is
	called after its step, which is always true and never strange; the suggestions
	are the step's own ingredients, short names, one tap each. The field is there
	for the thing the recipe never listed — "Oven", "Rice" — and for telling two
	timers on one step apart.
-->
<script lang="ts">
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { MAX_TIMER_SECONDS, TIMER_LABEL_MAX } from '$lib/utils/timer-parse';
	import TimerIcon from '@lucide/svelte/icons/timer';
	import { untrack } from 'svelte';

	type Props = {
		/** What the step's own text suggested, if anything. */
		suggestedSeconds: number | null;
		/** What the timer is called when the field is left empty — "Step 2". */
		defaultName: string;
		/** The step's ingredients, short names, offered as one-tap suggestions. */
		names?: string[];
		onstart: (seconds: number, name: string) => void;
		onclose: () => void;
	};

	let { suggestedSeconds, defaultName, names = [], onstart, onclose }: Props = $props();

	const m = messages();

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
	let name = $state('');

	$effect(() => {
		if (!open) onclose();
	});

	/** Tapping the chip that is already in the field takes it back out again. */
	function suggest(suggestion: string) {
		name = name.trim() === suggestion ? '' : suggestion;
	}

	function start() {
		// The stepper hands back `null` for an emptied field; it isn't `clearable`
		// here, so this is only a floor for the moment before its blur normalises.
		onstart(Math.min(minutes ?? FALLBACK_MINUTES, MAX_MINUTES) * 60, name.trim());
		open = false;
	}
</script>

<BottomSheet
	bind:open
	title={m.cooking.cook.timerTitle}
	subtitle={m.cooking.cook.timerSubtitle}
	tone="dark"
>
	<div class="body">
		<Stepper
			label={m.cooking.cook.minutes}
			bind:value={minutes}
			min={1}
			max={MAX_MINUTES}
			tone="dark"
		/>

		<div class="naming">
			<TextField
				label={m.cooking.cook.timerName}
				bind:value={name}
				placeholder={defaultName}
				maxlength={TIMER_LABEL_MAX}
				enterkeyhint="done"
				tone="dark"
			/>

			{#if names.length > 0}
				<div class="chips">
					{#each names as suggestion (suggestion)}
						<button
							type="button"
							class="chip"
							class:picked={name.trim() === suggestion}
							aria-pressed={name.trim() === suggestion}
							onclick={() => suggest(suggestion)}
						>
							{suggestion}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<button type="button" class="start" onclick={start}>
			<TimerIcon size={18} strokeWidth={2} aria-hidden="true" />
			{m.cooking.cook.startMinutes(minutes ?? FALLBACK_MINUTES)}
		</button>
	</div>
</BottomSheet>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	/* The suggestions belong to the field above them, not to the sheet — one
		 block with one micro-label, the way a labelled control reads. */
	.naming {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.chip {
		padding: 9px 14px;
		border: 1px solid transparent;
		border-radius: var(--r-chip);
		background: var(--cook-surface);
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--cook-text-2);
	}

	.picked {
		border-color: var(--cook-amber-line);
		background: var(--cook-amber-tint);
		color: var(--cook-amber);
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
		font-size: calc(16px * var(--fs));
		font-weight: 700;
		color: var(--on-sage);
	}
</style>
