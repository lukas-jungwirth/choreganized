<!--
	One line of the list [03]: check circle, name, compact quantity, and the
	mini avatar of whoever put it there.

	Two targets, one row (→ SPEC §3.1): the circle checks the item off, the rest
	of the row opens the edit sheet. They're siblings rather than nested buttons,
	which HTML doesn't allow and screen readers can't announce.

	Checked, the row goes quiet the way the design draws it: the quantity folds
	into the struck name and the avatar drops away — bought is bought, who wanted
	it stops mattering.
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
		 * the open store groups pass it; "recently bought" is sorted by when things
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
	};

	let { item, checked, toggle, onedit, reorderable = false, settling }: Props = $props();

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
			 rule takes over once the row lands in "recently bought". -->
		<span class="name" class:done={checked} class:striking={settling !== undefined}>
			{checked && quantity ? `${item.name} ${quantity}` : item.name}
		</span>
		<!-- Faded rather than dropped: pulling the quantity and the avatar out of
			 the markup mid-settle would reflow the row under its own animation. -->
		{#if !checked}
			{#if quantity}<span class="qty">{quantity}</span>{/if}
			{#if item.addedBy}
				<Avatar name={item.addedBy.displayName} color={item.addedBy.color} size={20} />
			{/if}
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
		font-size: calc(15px * var(--fs));
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
		animation: settle-wash 1400ms ease-out;
	}

	.settling .name {
		color: var(--text-disabled);
		transition: color 260ms ease-out;
	}

	/* The trailing detail steps back while the name is struck: bought is bought,
	   and who wanted it stops mattering (the checked row drops them entirely). */
	.settling .qty,
	.settling :global(.avatar) {
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

	/* Brightest as it happens, gone by the time the row leaves — so the wash is
	   the event, not a state the row is now in. */
	@keyframes settle-wash {
		0% {
			background: color-mix(in srgb, var(--tick-color) 22%, transparent);
		}
		100% {
			background: color-mix(in srgb, var(--tick-color) 0%, transparent);
		}
	}

	.qty {
		flex: none;
		font-size: calc(13px * var(--fs));
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
		.settling .qty,
		.settling :global(.avatar) {
			transition: none;
		}
		.striking {
			text-decoration-color: currentColor;
			animation: none;
		}
	}
</style>
