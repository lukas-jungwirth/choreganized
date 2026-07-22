<!-- "‹ · STEP 1 OF 2" header from [5c]/[5d]. Back is optional: once the household
	 exists there's nowhere sensible to go back to. -->
<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';

	type Props = { step: number; total?: number; back?: string; backLabel?: string };

	let { step, total = 2, back, backLabel = 'Back' }: Props = $props();
</script>

<div class="step-header">
	{#if back}
		<a class="back" href={back} aria-label={backLabel}>
			<ChevronLeft size={20} strokeWidth={2.4} />
		</a>
	{/if}
	<span class="step">Step {step} of {total}</span>
</div>

<style>
	.step-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
		/* Reserves the chevron's height so screens with and without it align. */
		min-height: 28px;
	}

	.back {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-left: -6px;
		color: var(--text-4);
	}

	.step {
		margin-left: auto;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-5);
	}
</style>
