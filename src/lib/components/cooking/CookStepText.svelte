<!--
	The step itself [7b] — Fraunces 33px, with every ingredient it names
	underlined in amber.

	The underlines are the step's own ingredients (→ SPEC §4.4,
	`$lib/utils/step-highlight`): the ones pinned to it in the form, else the ones
	its text names.

	**Tapping one says how much.** The amount is already on screen twice — the
	"This step uses…" line and the ingredients peek — but the first goes away
	while a timer ring is running and the second is a whole list to read, and the
	question in a kitchen is always about *one* word: how much of that? So the
	underline is the answer's own button, and the answer appears against the word
	rather than somewhere else on the screen (→ DECISIONS #133). An underline with
	no amount to give ("Salt", "a splash of oil") stays plain text — there is
	nothing for a tap to reveal, and a button that does nothing is worse than no
	button. Screen readers don't tap: the amount rides along in the button, so the
	sentence reads "sauté the mushrooms, 500 g, in butter" without a popup.

	The `{#each}` has no line break anywhere inside it on purpose. Svelte turns the
	whitespace of a prettier-formatted block into real text nodes, and a stray
	space in the middle of "the mushrooms" is very visible at this size.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { RecipeIngredientRow } from '$lib/server/services/recipes';
	import type { StepSegment } from '$lib/utils/step-highlight';
	import { untrack } from 'svelte';

	type Props = {
		segments: StepSegment<RecipeIngredientRow>[];
		/**
		 * The whole list, scaled the way the segments are. Only the totals are
		 * read out of it, for a step that takes a share of a row — "1 tbsp of
		 * 3 tbsp", the peek sheet's line, on the peek sheet's terms.
		 */
		ingredients?: RecipeIngredientRow[];
	};

	let { segments, ingredients = [] }: Props = $props();

	const m = messages();

	const totals = $derived(new Map(ingredients.map((row) => [row.id, row])));

	/** What one underline has to say, or `null` when it has nothing. */
	function amountOf(row: RecipeIngredientRow) {
		const amount = m.units.amount(row.quantity, row.unit);
		if (!amount) return null;

		const whole = totals.get(row.id);
		const total =
			whole && whole.quantity !== row.quantity ? m.units.amount(whole.quantity, whole.unit) : '';

		return {
			amount,
			total,
			spoken: total ? `${amount} ${m.cooking.cook.peekShare(total)}` : amount
		};
	}

	/** Which underline is open, and where its last line sits inside this block. */
	let anchor = $state<{
		at: number;
		row: RecipeIngredientRow;
		centre: number;
		top: number;
		bottom: number;
	} | null>(null);
	/** Where the bubble goes, once it has been measured — see the effect below. */
	let placed = $state<{
		at: number;
		left: number;
		top: number;
		arrow: number;
		above: boolean;
	} | null>(null);

	let host = $state<HTMLElement | null>(null);
	let bubble = $state<HTMLElement | null>(null);

	/** Clear of the underline, which already sits 5px under the baseline. */
	const GAP = 6;
	/** How near the bubble's corner the arrow may go before it looks broken. */
	const ARROW_INSET = 16;
	/**
	 * How far above the step the bubble may reach. A word's box is its font's,
	 * not its line's, so a bubble over the line above lands a few pixels short of
	 * the paragraph — and the eyebrow leaves 20px of air up there to land in.
	 */
	const OVERHANG = 10;

	/** The measured placement, but only while it belongs to what is open. */
	const spot = $derived(anchor && placed?.at === anchor.at ? placed : null);

	function open(
		at: number,
		row: RecipeIngredientRow,
		event: MouseEvent & { currentTarget: HTMLElement }
	) {
		// The window listener below closes the bubble; this click has to survive
		// opening it.
		event.stopPropagation();

		if (anchor?.at === at) {
			close();
			return;
		}

		const block = host;
		if (!block) return;

		// The *last* fragment, not the union: a word that wrapped across two lines
		// would otherwise be pointed at from between them.
		const rects = event.currentTarget.getClientRects();
		const word = rects[rects.length - 1];
		if (!word) return;

		const frame = block.getBoundingClientRect();
		anchor = {
			at,
			row,
			centre: word.left + word.width / 2 - frame.left,
			top: word.top - frame.top,
			bottom: word.bottom - frame.top
		};
		placed = null;
	}

	function close() {
		anchor = null;
		placed = null;
	}

	/**
	 * Centred on the word, then pushed back inside the block — a bubble half off
	 * the screen answers nothing, and the last word of a line is exactly the one
	 * you tap. Measured rather than computed because the width is the text's: the
	 * bubble renders hidden, this reads it, and the arrow moves to keep pointing
	 * at the word the box no longer sits under.
	 *
	 * It sits **above** the word wherever the step has a line to spare, because
	 * something is always covered and the line you have already read is the one
	 * you can afford to lose. Only a word on the first line pushes it down.
	 */
	$effect(() => {
		const at = anchor;
		const el = bubble;
		const block = host;
		if (!at || !el || !block) return;

		const width = el.offsetWidth;
		const room = Math.max(block.clientWidth - width, 0);
		const left = Math.min(Math.max(at.centre - width / 2, 0), room);
		const reach = Math.max(width - ARROW_INSET, ARROW_INSET);

		const height = el.offsetHeight;
		const above = at.top - GAP - height >= -OVERHANG;

		untrack(() => {
			placed = {
				at: at.at,
				left,
				top: above ? at.top - GAP - height : at.bottom + GAP,
				arrow: Math.min(Math.max(at.centre - left, ARROW_INSET), reach),
				above
			};
		});
	});

	// A new step is a new set of underlines, and the open one belonged to the old.
	$effect(() => {
		segments;
		untrack(close);
	});
</script>

<!-- A tap anywhere puts it away, and so does turning the phone: the bubble is
	 placed against a word that has just moved somewhere else. -->
<svelte:window
	onclick={close}
	onresize={close}
	onkeydown={(event) => {
		if (event.key === 'Escape') close();
	}}
/>

<div class="block" bind:this={host}>
	<p class="step">
		{#each segments as segment, index (index)}{@const row = segment.ingredient}{@const said =
				row && amountOf(row)}{#if row && said}<button
					type="button"
					class="mark"
					class:open={anchor?.at === index}
					onclick={(event) => open(index, row, event)}
					>{segment.text}<span class="said">{m.cooking.cook.stepAmount(said.spoken)}</span></button
				>{:else if row}<mark>{segment.text}</mark>{:else}{segment.text}{/if}{/each}
	</p>

	{#if anchor}
		{@const said = amountOf(anchor.row)}
		<!-- Its whole content is already in the button above, so a screen reader
			 that has just read the word does not hear the amount a second time. -->
		<span
			class="bubble"
			class:ready={spot !== null}
			class:above={spot?.above}
			bind:this={bubble}
			aria-hidden="true"
			style="top: {spot?.top ?? 0}px; left: {spot?.left ?? 0}px; --arrow: {spot?.arrow ?? 0}px"
		>
			<span class="amount">{said?.amount}</span>
			<span class="name">{anchor.row.name}</span>
			{#if said?.total}<span class="of">{m.cooking.cook.peekShare(said.total)}</span>{/if}
		</span>
	{/if}
</div>

<style>
	/* Positioned, so the bubble is placed against the step rather than the
		 screen — and stacked above the chips it opens over. */
	.block {
		position: relative;
		z-index: 2;
	}

	.step {
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(33px * var(--fs));
		font-weight: 600;
		line-height: 1.22;
		color: var(--cook-text);
		overflow-wrap: anywhere;
	}

	/* `<mark>` because that is exactly what this is; only the browser's yellow
		 highlight is being replaced. The button carries the same treatment: it is
		 the same underline, and nothing about the sentence should say "control". */
	mark,
	.mark {
		display: inline;
		background: none;
		color: inherit;
		text-align: inherit;
		text-decoration: underline;
		text-decoration-color: var(--cook-amber);
		text-decoration-thickness: 2px;
		text-underline-offset: 5px;
	}

	.mark:active,
	.mark.open {
		text-decoration-thickness: 3px;
		color: var(--cook-amber);
	}

	/* The amount, for a reader that can't tap the word to see it. */
	.said {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* The peek sheet's row, said against one word: the amount in amber, what it
		 is behind it, and the row's total behind that. */
	.bubble {
		position: absolute;
		display: flex;
		align-items: baseline;
		gap: 6px;
		max-width: 100%;
		padding: 9px 14px;
		border: 1px solid var(--cook-amber-line);
		border-radius: var(--r-input);
		background: var(--cook-sheet);
		box-shadow: var(--shadow-toast);
		/* Placed by the effect above; until then it is measured, not seen. */
		visibility: hidden;
	}

	.ready {
		visibility: visible;
	}

	/* The corner that points back at the word, drawn as two of the box's own
		 edges so it inherits the hairline. */
	.bubble::before {
		content: '';
		position: absolute;
		top: -5px;
		left: calc(var(--arrow) - 5px);
		width: 8px;
		height: 8px;
		border-top: 1px solid var(--cook-amber-line);
		border-left: 1px solid var(--cook-amber-line);
		border-radius: 2px 0 0 0;
		background: var(--cook-sheet);
		transform: rotate(45deg);
	}

	/* Sitting above the word, it points down instead — the same two edges, from
		 the opposite corner. */
	.above::before {
		top: auto;
		bottom: -5px;
		border-top: none;
		border-left: none;
		border-right: 1px solid var(--cook-amber-line);
		border-bottom: 1px solid var(--cook-amber-line);
		border-radius: 0 0 2px 0;
	}

	.amount {
		flex: none;
		font-size: calc(15px * var(--fs));
		font-weight: 600;
		color: var(--cook-amber);
	}

	.name {
		min-width: 0;
		font-size: calc(14px * var(--fs));
		color: var(--cook-text-2);
		overflow-wrap: anywhere;
	}

	/* Typed as "250 g mushrooms", read back as "Mushrooms" [7b]. */
	.name::first-letter {
		text-transform: uppercase;
	}

	/* The row's total, behind the step's share — quiet, and never bold with it. */
	.of {
		flex: none;
		font-size: calc(14px * var(--fs));
		color: var(--cook-muted);
	}
</style>
