<!--
	The tick that runs through the whole app.

	Two looks, one component:
	- solid (default) — the list control on shopping items and tasks: a hairline
	  ring while open, filled with the accent colour and a white ✓ when checked.
	- `tinted` — the history/activity feed, where nothing is clickable and the
	  circle is a soft wash of the member's colour with a coloured ✓ [8b].

	Purely visual: the row around it owns the button semantics and the label.
-->
<script lang="ts">
	type Props = {
		checked?: boolean;
		size?: number;
		/** Accent — sage for the list, the member's colour in feeds. */
		color?: string;
		tinted?: boolean;
		/**
		 * Play the tick rather than arriving already ticked: the fill pops in and
		 * the ✓ draws itself. For the moment a check *happens* under your eyes —
		 * the shopping list's settle (→ SPEC §3.1) — not for a list that renders
		 * checked because that is how it loaded.
		 */
		animate?: boolean;
	};

	let {
		checked = false,
		size = 22,
		color = 'var(--sage)',
		tinted = false,
		animate = false
	}: Props = $props();
</script>

<span
	class="circle"
	class:checked
	class:tinted
	class:animate={animate && checked}
	style:--circle-size="{size}px"
	style:--circle-color={color}
	aria-hidden="true"
>
	{#if checked || tinted}
		<svg
			width={size * 0.55}
			height={size * 0.55}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width={tinted ? 3 : 3.5}
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M4 12l5 5L20 6" />
		</svg>
	{/if}
</span>

<style>
	.circle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: var(--circle-size);
		height: var(--circle-size);
		border: 2px solid var(--border-dashed);
		border-radius: 50%;
		transition: transform 120ms ease-out;
	}

	.checked {
		border-color: var(--circle-color);
		background: var(--circle-color);
		color: var(--on-sage);
	}

	.checked:active {
		transform: scale(0.9);
	}

	/*
		Feed variant. The design tints sage to #EEF3F0 and terracotta to #F7EDE6;
		members can also be blue/amber/plum, which have no tint token — mixing the
		member colour into the card reproduces both within a shade
		(→ DECISIONS.md).
	*/
	.tinted {
		border-color: transparent;
		background: color-mix(in srgb, var(--circle-color) 12%, var(--card));
		color: var(--circle-color);
	}

	/* The feed variant isn't a control, so it mustn't answer a press like one. */
	.tinted:active {
		transform: none;
	}

	/*
		The tick, played rather than stated. The circle takes its colour and swells
		a little — a stamp coming down — while the ✓ draws itself along its own
		length a beat later, so the two read as one gesture rather than as a fill
		with a glyph already sitting inside it.

		`stroke-dasharray` is the whole trick: one dash as long as the path, offset
		out of sight, animated back to zero. 30 comfortably exceeds the path's
		length in the 24-unit viewBox, and overshooting only means the line starts
		a touch further away — never that it fails to close.
	*/
	.animate {
		animation: tick-pop 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
	}

	.animate svg path {
		stroke-dasharray: 30;
		stroke-dashoffset: 30;
		animation: tick-draw 240ms 80ms ease-out forwards;
	}

	@keyframes tick-pop {
		0% {
			transform: scale(1);
		}
		45% {
			transform: scale(1.12);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes tick-draw {
		to {
			stroke-dashoffset: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.circle {
			transition: none;
		}
		.checked:active {
			transform: none;
		}
		/* The tick still *happens*; it just arrives whole. The settle around it
		   holds for the same beat either way, so the state is still seen. */
		.animate {
			animation: none;
		}
		.animate svg path {
			stroke-dasharray: none;
			stroke-dashoffset: 0;
			animation: none;
		}
	}
</style>
