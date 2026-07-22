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
	};

	let { checked = false, size = 22, color = 'var(--sage)', tinted = false }: Props = $props();
</script>

<span
	class="circle"
	class:checked
	class:tinted
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

	@media (prefers-reduced-motion: reduce) {
		.circle {
			transition: none;
		}
		.checked:active {
			transform: none;
		}
	}
</style>
