<!--
	One line of the list [03]: check circle, name and compact quantity. Who
	added it is not on the row (a dot of noise in a household of two, next to
	the quantity): the edit sheet [3a] says it instead (→ DECISIONS #265). Who
	*ticked* it still shows, in the settle's colour.

	Two targets, one row (→ SPEC §3.1): the circle checks the item off, the rest
	of the row opens the edit sheet. They're siblings rather than nested buttons,
	which HTML doesn't allow and screen readers can't announce.

	Checked, the row goes quiet the way the design draws it: the quantity folds
	into the struck name — bought is bought.

	On a checklist (plan 36 [L4]) a ticked row stays in place and wears the
	small avatar of whoever ticked it (`ticker`), which is the news there:
	"Elisabeth packed the passports".
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { dragHandle } from 'svelte-dnd-action';

	type Props = {
		item: ShoppingListItem;
		/** Includes a tap that hasn't reached the server yet — the page decides. */
		checked: boolean;
		/** The page owns the optimistic bookkeeping, so it hands in the handler. */
		toggle: SubmitFunction;
		onedit: () => void;
		/**
		 * Draws the drag grip and turns the row into a `dragHandleZone` handle. Only
		 * the open rows of a list pass it; "{n} bought" is sorted by when things
		 * were ticked, not by hand.
		 */
		reorderable?: boolean;
		/**
		 * This row's tick is playing out right now, in this colour — sage for your
		 * own, the housemate's own colour for theirs (→ SPEC §3.1, DECISIONS #135).
		 *
		 * `undefined` is the ordinary case. While it is set the row is *visually*
		 * checked but has not left its store group yet, which is the whole point:
		 * you see what was ticked, where it stood in the walking order, before it
		 * goes.
		 */
		settling?: string | undefined;
		/** A ticked checklist row: who ticked it, drawn as a small avatar. */
		ticker?: { displayName: string; color: string } | null;
	};

	let {
		item,
		checked,
		toggle,
		onedit,
		reorderable = false,
		settling,
		ticker = null
	}: Props = $props();

	const m = messages();

	const quantity = $derived(m.units.quantity(item.quantity, item.unit));

	/**
	 * What the row *says* it is. During the settle the page still reports this
	 * item as open — that is what keeps it in its group — so the tick, the label
	 * and the form's next move all have to come from here instead, or a second
	 * tap mid-settle would re-check something that already reads as checked.
	 */
	const ticked = $derived(checked || settling !== undefined);
</script>

<li
	class="row"
	class:reorderable
	class:settling={settling !== undefined}
	style:--tick-color={settling}
>
	<form method="POST" action="?/toggle" use:enhance={toggle}>
		<input type="hidden" name="id" value={item.id} />
		<input type="hidden" name="checked" value={ticked ? 'false' : 'true'} />
		<button
			type="submit"
			class="tick"
			aria-pressed={ticked}
			aria-label={ticked ? m.shopping.row.uncheck(item.name) : m.shopping.row.check(item.name)}
		>
			<CheckCircle
				checked={ticked}
				animate={settling !== undefined}
				color={settling ?? 'var(--sage)'}
			/>
		</button>
	</form>

	<button type="button" class="body" onclick={onedit} aria-label={m.shopping.row.edit(item.name)}>
		<!-- Struck, but by a line that draws itself: `text-decoration` can't be
			 animated, so the settle borrows a hairline of its own and the static
			 rule takes over once the row lands under "{n} bought". -->
		<span class="name" class:done={checked} class:striking={settling !== undefined}>
			{checked && quantity ? `${item.name} ${quantity}` : item.name}
		</span>
		<!-- Faded rather than dropped: pulling the quantity out of the markup
			 mid-settle would reflow the row under its own animation. -->
		{#if !checked && quantity}<span class="qty">{quantity}</span>{/if}
		{#if checked && ticker}
			<span class="ticker"><Avatar name={ticker.displayName} color={ticker.color} size={20} /></span
			>
		{/if}
	</button>

	{#if reorderable}
		<button
			type="button"
			class="grip"
			use:dragHandle
			aria-label={m.shopping.row.reorder(item.name)}
		>
			<GripVertical size={18} strokeWidth={2} aria-hidden="true" />
		</button>
	{/if}
</li>

<style>
	.row {
		display: flex;
		align-items: stretch;
		border-top: 1px solid var(--divider);
	}

	.row:first-child {
		border-top: none;
	}

	/* Both halves run the full height of the row, so the 44px target is real
	   even though the design's padding is 13px. */
	.tick {
		display: flex;
		align-items: center;
		padding: 13px 12px 13px 16px;
	}

	.body {
		display: flex;
		align-items: center;
		flex: 1;
		gap: 12px;
		min-width: 0;
		padding: 13px 16px 13px 0;
		text-align: left;
	}

	/* The grip takes over the row's right edge, so the body stops short of it. */
	.reorderable .body {
		padding-right: 6px;
	}

	.body:active {
		background: var(--sage-row);
	}

	.name {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-17);
		font-weight: 500;
		/* "Sonnenblumenkerne (geschält)" has nowhere to break. */
		overflow-wrap: anywhere;
	}

	.done {
		color: var(--text-disabled);
		text-decoration: line-through;
	}

	/*
		The settle. A wash of whoever ticked it — sage when that was you, their own
		colour when it wasn't — so a housemate's check reads as *theirs* at a
		glance, in the row's own place in the walking order, which is the one place
		you were already looking.

		`color-mix` against the colour handed in as `--tick-color`, the way
		`ui/Avatar` takes a member's: the palette is data, so it arrives as a custom
		property rather than as a token (→ DESIGN-SYSTEM "Member colours").
	*/
	.settling {
		background: color-mix(in srgb, var(--tick-color) 10%, transparent);
		animation: settle-wash 420ms ease-out;
	}

	.settling .name {
		color: var(--text-disabled);
		transition: color 260ms ease-out;
	}

	/* The quantity steps back while the name is struck: bought is bought (the
	   checked row folds it into the name). */
	.settling .qty {
		opacity: 0;
		transition: opacity 200ms ease-out;
	}

	/*
		The strike, arriving rather than stated. `text-decoration` can't be animated
		but its *colour* can, so the line is there from the start and fades in —
		which, unlike a pseudo-element scaling across the box, still lands on every
		line of a name that wraps. "Sonnenblumenkerne (geschält)" is two lines on a
		390px screen and would otherwise get one bar through its middle.
	*/
	.striking {
		text-decoration: line-through;
		text-decoration-color: transparent;
		animation: strike 260ms 60ms ease-out forwards;
	}

	@keyframes strike {
		to {
			text-decoration-color: currentColor;
		}
	}

	/*
		Brightest as it lands, then down to the steady wash the rule above holds.

		Only the arrival is animated, and it ends *on* the base value rather than
		on a value of its own: a settle runs until the server agrees, not for a
		fixed beat (→ `+page.svelte`), so an animation that faded to nothing would
		finish, hand the row back to the base rule, and pop the tint back up in the
		middle of a slow one.
	*/
	@keyframes settle-wash {
		from {
			background: color-mix(in srgb, var(--tick-color) 24%, transparent);
		}
	}

	.ticker {
		display: flex;
		flex: none;
	}

	.qty {
		flex: none;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	/* The one drag target on the row: the check circle and the body still tap
	   through. `touch-action: none` hands the gesture to the drag rather than the
	   scroll it would otherwise start under a finger. */
	.grip {
		display: flex;
		align-items: center;
		flex: none;
		padding: 13px 14px 13px 8px;
		color: var(--text-5);
		cursor: grab;
		touch-action: none;
	}

	.grip:active {
		cursor: grabbing;
	}

	/* The tint and the strike are the signal, so both stay — they just stop
	   moving. The row still holds for its beat before it goes. */
	@media (prefers-reduced-motion: reduce) {
		.settling {
			animation: none;
		}
		.settling .name,
		.settling .qty {
			transition: none;
		}
		.striking {
			text-decoration-color: currentColor;
			animation: none;
		}
	}
</style>
