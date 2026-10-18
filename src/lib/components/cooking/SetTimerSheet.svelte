<!--
	"Set a timer" — the manual way in, for the steps with no timer of their own
	and no duration in their text, the ones where you want a different one anyway
	(→ DECISIONS #14, #147), and the ones where the timer wants a name of its own
	(→ DECISIONS #134). How long and what for are `TimerFields`, shared with the
	recipe form's step timer.

	Minutes only. Recipes are written in minutes, a stepper you can also type into
	covers 1 to 12 hours, and seconds would be a second control for a case
	("boil for 90 seconds") that reads fine as 2.
-->
<script lang="ts">
	import TimerFields from '$lib/components/cooking/TimerFields.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import { messages } from '$lib/i18n';
	import { MAX_TIMER_SECONDS } from '$lib/utils/timer-parse';
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
	let minutes = $state<number | null>(
		untrack(() =>
			suggestedSeconds ? Math.max(1, Math.round(suggestedSeconds / 60)) : FALLBACK_MINUTES
		)
	);
	let name = $state('');

	$effect(() => {
		if (!open) onclose();
	});

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
		<TimerFields bind:minutes bind:name {defaultName} {names} tone="dark" />

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
