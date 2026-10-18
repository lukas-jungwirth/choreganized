<!--
	A timer's two questions — how long, and what for — as both timer sheets ask
	them: cook mode's "Set a timer" [7h], dark, and the recipe form's step timer
	[3c], light (→ plan 21). One component in two tones, the way `Stepper` and
	`BottomSheet` already are, so the two sheets can't drift apart.

	**The name is optional and never has to be typed.** Left empty a timer is
	called after its step, which is always true and never strange; the
	suggestions are the step's own ingredients, short names, one tap each. The
	field is there for the thing the recipe never listed — "Oven", "Rice" — and
	for telling two timers on one step apart.

	Nothing here carries a `name` attribute: both sheets live outside any form
	(→ DECISIONS #100), and what they decide travels some other way.
-->
<script lang="ts">
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import { MAX_TIMER_SECONDS, TIMER_LABEL_MAX } from '$lib/utils/timer-parse';

	type Props = {
		minutes: number | null;
		name: string;
		/** What the timer is called when the field is left empty — "Step 2". */
		defaultName: string;
		/** The step's ingredients, short names, offered as one-tap suggestions. */
		names?: string[];
		tone?: 'light' | 'dark';
	};

	let {
		minutes = $bindable(),
		name = $bindable(),
		defaultName,
		names = [],
		tone = 'light'
	}: Props = $props();

	const m = messages();

	const MAX_MINUTES = Math.floor(MAX_TIMER_SECONDS / 60);

	/** Tapping the chip that is already in the field takes it back out again. */
	function suggest(suggestion: string) {
		name = name.trim() === suggestion ? '' : suggestion;
	}
</script>

<Stepper label={m.cooking.cook.minutes} bind:value={minutes} min={1} max={MAX_MINUTES} {tone} />

<div class="naming" class:dark={tone === 'dark'}>
	<TextField
		label={m.cooking.cook.timerName}
		bind:value={name}
		placeholder={defaultName}
		maxlength={TIMER_LABEL_MAX}
		enterkeyhint="done"
		{tone}
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

<style>
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
		background: var(--sunken);
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--text-2);
	}

	.picked {
		border-color: var(--sage);
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	/* Cook mode's palette: the same chip, lit in amber over the dark sheet. */
	.dark .chip {
		background: var(--cook-surface);
		color: var(--cook-text-2);
	}

	.dark .picked {
		border-color: var(--cook-amber-line);
		background: var(--cook-amber-tint);
		color: var(--cook-amber);
	}
</style>
