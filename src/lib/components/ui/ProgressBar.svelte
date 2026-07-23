<!--
	Points bar on the month card [02] — a share of the leader's total, painted in
	the member's colour.
-->
<script lang="ts">
	type Props = {
		/** 0–1; clamped, so a caller dividing by zero can't overflow the track. */
		value: number;
		color?: string;
		/** Screen-reader label, e.g. "Lukas · 240 points". */
		label: string;
	};

	let { value, color = 'var(--sage)', label }: Props = $props();

	// `Math.min/max` pass NaN straight through, and `width: NaN%` is dropped as
	// invalid — which paints a *full* track for "0 points out of 0".
	const fraction = $derived(Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
</script>

<div
	class="track"
	role="progressbar"
	aria-label={label}
	aria-valuenow={Math.round(fraction * 100)}
	aria-valuemin={0}
	aria-valuemax={100}
>
	<div class="fill" style:width="{fraction * 100}%" style:background={color}></div>
</div>

<style>
	.track {
		height: 9px;
		border-radius: 5px;
		background: var(--track);
		overflow: hidden;
	}

	.fill {
		height: 100%;
		border-radius: 5px;
		transition: width 200ms ease-out;
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
