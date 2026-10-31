<!--
	A step's own timer [3c] (→ plan 21, SPEC §4.4): how long, and what cook mode
	calls it. Opened from the timer chip under a step in the recipe form.

	It opens on whatever the step already says — its saved timer, else the
	duration its text names, else five minutes — so for most steps "Save" is the
	whole job and the name is the only thing worth typing. Like cook mode's sheet
	it counts in minutes, but **a timer it was opened on keeps its exact seconds
	until the stepper is touched**: an imported "90 Sekunden" must not come back
	from an unrelated rename as two minutes.

	Mounted outside the recipe `<form>` and carrying no field `name`, like
	`StepIngredientsSheet` (→ DECISIONS #100): the step's timer posts through the
	one hidden field the row owns.
-->
<script lang="ts">
	import TimerFields from '$lib/components/cooking/TimerFields.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import type { StepTimer } from '$lib/utils/recipes';
	import { MAX_TIMER_SECONDS } from '$lib/utils/timer-parse';
	import { untrack } from 'svelte';

	type Props = {
		/** Which step this is — the eyebrow says so, like every label in [3c]. */
		index: number;
		/** The step's timer as the form holds it, or null. */
		timer: StepTimer | null;
		/** What the step's text says, when it names a duration. */
		suggestedSeconds: number | null;
		/** The step's ingredients, short names, as one-tap name suggestions. */
		names: string[];
		onsave: (timer: StepTimer) => void;
		onremove: () => void;
		onclose: () => void;
	};

	let { index, timer, suggestedSeconds, names, onsave, onremove, onclose }: Props = $props();

	const m = messages();
	const t = m.cooking.form.timerSheet;

	/** A round default that is long enough to be worth walking away from. */
	const FALLBACK_MINUTES = 5;

	// Mounted per opening, so these initialisers are the reset (the
	// `StepIngredientsSheet` contract).
	const seedSeconds = untrack(() => timer?.seconds ?? suggestedSeconds);
	const seedMinutes = seedSeconds ? Math.max(1, Math.round(seedSeconds / 60)) : FALLBACK_MINUTES;

	let open = $state(true);
	let minutes = $state<number | null>(seedMinutes);
	let name = $state(untrack(() => timer?.label ?? ''));

	$effect(() => {
		if (!open) onclose();
	});

	function save() {
		const whole = Math.min(minutes ?? FALLBACK_MINUTES, Math.floor(MAX_TIMER_SECONDS / 60));
		// Untouched, the exact seconds it was opened on stand; moved, it's minutes.
		const seconds = seedSeconds && minutes === seedMinutes ? seedSeconds : whole * 60;
		onsave({ seconds, label: name.trim() || null });
		open = false;
	}

	function remove() {
		onremove();
		open = false;
	}
</script>

<BottomSheet bind:open title={t.title} eyebrow={t.eyebrow(index)} subtitle={t.subtitle}>
	<div class="body">
		<TimerFields bind:minutes bind:name defaultName={m.cooking.cook.timerForStep(index)} {names} />

		<Button type="button" onclick={save}>{t.save}</Button>
	</div>

	{#if timer}
		<button type="button" class="remove" onclick={remove}>{t.remove}</button>
	{/if}
</BottomSheet>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}

	.remove {
		display: block;
		width: 100%;
		margin-top: 14px;
		padding: 10px;
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--danger);
		text-align: center;
	}
</style>
