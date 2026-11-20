<!--
	One list as a card (plan 36 [L1] [L5] [L7], SPEC §3.1): a header that folds
	it, a corner button that opens it full screen, the rows still to buy, and
	"{n} bought" at its foot — what used to be the "Recently bought" section,
	now in the card each row came from.

	The whole header folds, as a header with a chevron does anywhere; opening
	the list is the pill at its right edge, "4 ›", which also says how much is
	left (→ `OpenPill`). "Other" can't be opened, so it keeps a bare count. Folded,
	the header shows what is on it in one line ("Toothpaste, Cotton pads").

	On an opened list [L5] the screen has its own title, so the card comes
	without a header and "{n} bought" starts unfolded.

	A checklist, opened [L4] (plan 36 step 2): every row in its own place,
	ticked ones struck with the ticker's avatar, and **Start over** at the
	foot once anything is ticked, filled when everything is. On the overview a
	checklist is a single row instead (→ `ChecklistRow`).

	Drag to reorder lives here (it was `ShoppingGroup`): the order the finger
	leaves has to hold the instant it lands, the same way a tick strikes a row
	before the server answers. So this owns a small copy of the list's open rows
	and reconciles it with the page's on everything except the drag in hand and
	the order still saving.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ListIcon from '$lib/components/shopping/ListIcon.svelte';
	import ShoppingRow from '$lib/components/shopping/ShoppingRow.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingGroup, ShoppingListItem } from '$lib/server/services/shopping';
	import { OTHER_ICON } from '$lib/utils/lists';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import OpenPill from '$lib/components/shopping/OpenPill.svelte';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { tick, untrack } from 'svelte';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';

	type Props = {
		group: ShoppingGroup;
		/** The page owns the optimistic tick bookkeeping, so it hands in the handler. */
		toggle: (item: ShoppingListItem) => SubmitFunction;
		onedit: (item: ShoppingListItem) => void;
		/** This row's tick is playing out, in this colour (→ `ShoppingRow`). */
		settling: (itemId: string) => string | undefined;
		/** False on an opened list, whose screen is the header. */
		header?: boolean;
		folded?: boolean;
		onfold?: () => void;
		/** Where the corner button goes; null for "Other", which can't be opened. */
		openHref?: string | null;
		/** "{n} bought" unfolded from the start — an opened list [L5]. */
		boughtOpen?: boolean;
		/** Something was just added here while it was folded or off screen. */
		flash?: number;
		/** A checklist's Start over: the page's handler (→ `shopping-ticks`). */
		reset?: SubmitFunction;
	};

	let {
		group,
		toggle,
		onedit,
		settling,
		header = true,
		folded = false,
		onfold,
		openHref = null,
		boughtOpen = false,
		flash = 0,
		reset
	}: Props = $props();

	const m = messages();
	const bodyId = $props.id();

	const name = $derived(group.name ?? m.shopping.other);
	const checklist = $derived(group.kind === 'checklist');
	/** A checklist's ticked rows, for Start over. */
	const done = $derived(
		checklist ? group.items.filter((item) => item.checkedAt !== null).length : 0
	);

	// The list `dndzone` reorders in place, seeded from the page for the first
	// paint (SSR included) and reconciled with `group.items` by the effect below —
	// `untrack` says the seed is deliberately the initial value, not a binding.
	let items = $state<ShoppingListItem[]>(untrack(() => group.items));
	let dragging = $state(false);
	/** An order we've dropped and posted, until the server has it. */
	let saving = $state(false);
	let formEl: HTMLFormElement | undefined = $state();
	let idsInput: HTMLInputElement | undefined = $state();

	// Seeded once and then owned by the tap: a tick must not fold it shut under
	// the hand of somebody who just opened it.
	let showBought = $state(untrack(() => boughtOpen));

	/**
	 * What is left to buy, as the header counts it. A settling row has a ✓ on it
	 * and a line through it, so it counts as done already.
	 */
	const left = $derived(group.items.filter((item) => settling(item.id) === undefined));

	/** The folded header's one line: the first three names, or "All done". */
	const peek = $derived(
		left.length === 0
			? m.shopping.lists.allDone
			: left
					.slice(0, 3)
					.map((item) => item.name)
					.join(', ') + (left.length > 3 ? '…' : '')
	);

	/**
	 * Follow the page's version of the list — but never over a live drag, and
	 * never over an order we've just dropped and are still saving. Those two are
	 * the only moments our copy is newer than the server's; every other time the
	 * page's list, order included, is taken whole (→ DECISIONS #135).
	 */
	$effect(() => {
		const next = group.items;
		const busy = dragging || saving;
		untrack(() => {
			if (busy) return;
			items = next;
		});
	});

	function handleConsider(event: CustomEvent<DndEvent<ShoppingListItem>>) {
		dragging = true;
		items = event.detail.items;
	}

	function handleFinalize(event: CustomEvent<DndEvent<ShoppingListItem>>) {
		items = event.detail.items;
		saving = true;
		dragging = false;
		// Svelte writes the hidden field on the next tick; `requestSubmit` reads it
		// now, so set the value straight on the node.
		if (idsInput) idsInput.value = items.map((item) => item.id).join(',');
		formEl?.requestSubmit();
	}

	let rowsEl: HTMLUListElement | undefined = $state();

	/**
	 * Start over unticks every row at once, which takes its own button off the
	 * screen with the focus still on it. Focus goes to the first row's circle
	 * instead of falling to the page (a keyboard or a screen reader would start
	 * again from the top).
	 */
	const startOver: SubmitFunction = (input) => {
		const answered = reset?.(input);
		if (document.activeElement === input.submitter) {
			void tick().then(() => {
				if (document.activeElement && document.activeElement !== document.body) return;
				rowsEl?.querySelector<HTMLButtonElement>('button')?.focus();
			});
		}
		return answered;
	};

	/** Our order stops being the newer one once the server has answered. */
	const saved: SubmitFunction =
		() =>
		async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
</script>

{#key flash}
	<section
		class="card"
		class:flash={flash > 0}
		class:bare={!header}
		aria-label={header ? undefined : name}
		data-list={group.storeId ?? 'other'}
	>
		{#if header}
			<div class="head">
				<button
					type="button"
					class="fold"
					aria-expanded={!folded}
					aria-controls={bodyId}
					onclick={onfold}
				>
					<span class="well" aria-hidden="true"
						><ListIcon icon={group.storeId === null ? OTHER_ICON : group.icon} size={19} /></span
					>
					<span class="titles">
						<span class="name-line">
							<span class="name">{name}</span>
							<span class="chevron" class:open={!folded} aria-hidden="true">
								<ChevronDown size={15} strokeWidth={2.4} />
							</span>
						</span>
						{#if folded || left.length === 0}<span class="peek">{peek}</span>{/if}
					</span>
					{#if !openHref}
						{#if left.length > 0}
							<span class="count">
								<span aria-hidden="true">{left.length}</span>
								<span class="hidden-label">{m.shopping.lists.toGet(left.length)}</span>
							</span>
						{:else}
							<span class="count done" aria-hidden="true"
								><Check size={16} strokeWidth={2.6} /></span
							>
						{/if}
					{/if}
				</button>
				{#if openHref}
					<span class="pill-slot">
						<OpenPill
							href={openHref}
							label={m.shopping.lists.openWith(name, left.length)}
							done={left.length === 0}
						>
							{#if left.length > 0}
								{left.length}
							{:else}
								<Check size={16} strokeWidth={2.6} aria-hidden="true" />
							{/if}
						</OpenPill>
					</span>
				{:else}
					<span class="pad"></span>
				{/if}
			</div>
		{/if}

		<div id={bodyId} hidden={folded}>
			{#if !folded}
				{#if items.length > 0}
					<ul
						bind:this={rowsEl}
						class="rows"
						use:dragHandleZone={{
							items,
							// A type per list (real id, or a token for "Other") is what keeps a
							// drag inside its own list — no row changes list by being dropped.
							type: group.storeId ?? '__other__',
							flipDurationMs: 0,
							dropFromOthersDisabled: true,
							dropTargetStyle: {},
							zoneItemTabIndex: -1
						}}
						onconsider={handleConsider}
						onfinalize={handleFinalize}
					>
						{#each items as item (item.id)}
							<ShoppingRow
								{item}
								reorderable
								checked={checklist && item.checkedAt !== null}
								ticker={checklist ? item.checkedBy : null}
								settling={checklist ? undefined : settling(item.id)}
								toggle={toggle(item)}
								onedit={() => onedit(item)}
							/>
						{/each}
					</ul>
				{:else if !header && group.bought.length === 0}
					<p class="nothing">{m.shopping.lists.nothingYet}</p>
				{/if}

				{#if checklist && done > 0 && reset}
					<form class="foot" method="POST" action="?/resetList" use:enhance={startOver}>
						<input type="hidden" name="id" value={group.storeId ?? ''} />
						<button type="submit" class="reset" class:loud={done === group.items.length}>
							<RotateCcw size={15} strokeWidth={2.1} aria-hidden="true" />
							{m.shopping.lists.startOver}
						</button>
					</form>
				{/if}

				{#if group.bought.length > 0}
					<button
						type="button"
						class="bought"
						aria-expanded={showBought}
						aria-controls="{bodyId}-bought"
						onclick={() => (showBought = !showBought)}
					>
						<Check size={15} strokeWidth={2.6} aria-hidden="true" />
						{m.shopping.bought.foot(group.bought.length)}
						<span class="chevron" class:open={showBought} aria-hidden="true">
							<ChevronDown size={14} strokeWidth={2.4} />
						</span>
					</button>
					{#if showBought}
						<ul class="rows" id="{bodyId}-bought">
							{#each group.bought as item (item.id)}
								<ShoppingRow {item} checked toggle={toggle(item)} onedit={() => onedit(item)} />
							{/each}
						</ul>
					{/if}
				{/if}
			{/if}
		</div>
	</section>
{/key}

<form bind:this={formEl} method="POST" action="?/reorder" use:enhance={saved} hidden>
	<input type="hidden" name="storeId" value={group.storeId ?? ''} />
	<input bind:this={idsInput} type="hidden" name="ids" value="" />
</form>

<style>
	.card {
		overflow: hidden;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	/* Something landed in a card that was folded or not on screen: it lights up
	   once, so the eye finds where it went. */
	.flash {
		animation: flash 900ms ease-out;
	}

	@keyframes flash {
		0%,
		35% {
			box-shadow:
				0 0 0 2px var(--sage),
				var(--shadow-card);
		}
		100% {
			box-shadow:
				0 0 0 2px transparent,
				var(--shadow-card);
		}
	}

	.head {
		display: flex;
		align-items: stretch;
		min-height: 60px;
	}

	.fold {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 11px 0 11px 12px;
		color: inherit;
		text-align: left;
	}

	.well {
		display: grid;
		flex: none;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.titles {
		display: grid;
		flex: 1;
		min-width: 0;
	}

	.name-line {
		display: flex;
		align-items: center;
		gap: 5px;
		min-width: 0;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		font-size: var(--fs-18);
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--ink);
	}

	.peek {
		overflow: hidden;
		font-size: var(--fs-14);
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text-4);
	}

	.chevron {
		display: flex;
		flex: none;
		color: var(--text-5);
		transition: transform 140ms ease-out;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.count {
		display: flex;
		flex: none;
		align-items: center;
		font-size: var(--fs-15);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}

	/* Read out as "3 to get"; the eye has the bare number. */
	.hidden-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.count.done {
		color: var(--sage-deep);
	}

	.pill-slot {
		display: flex;
		flex: none;
		align-items: center;
		margin: 0 12px 0 10px;
	}

	.pad {
		flex: none;
		width: 16px;
	}

	.rows {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--divider);
		list-style: none;
	}

	.bare > div > .rows:first-child {
		border-top: none;
	}

	.bought {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 44px;
		padding: 0 16px 0 20px;
		border-top: 1px solid var(--divider);
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--text-4);
		text-align: left;
	}

	.bare > div > .bought:first-child {
		border-top: none;
	}

	.bought > :global(svg:first-child) {
		color: var(--sage);
	}

	.bought .chevron {
		margin-left: auto;
	}

	/* Start over sits at the right of the card's foot: quiet while the trip is
	   under way, filled once everything is ticked [L4]. */
	.foot {
		display: flex;
		justify-content: flex-end;
		min-height: 46px;
		padding: 0 8px;
		border-top: 1px solid var(--divider);
	}

	/* 34px drawn; the ::after grows the target to 44, like the open button. */
	.reset {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		align-self: center;
		min-height: 34px;
		padding: 4px 10px;
		border-radius: 10px;
		font-size: var(--fs-15);
		font-weight: 600;
		color: var(--terracotta-deep);
	}

	.reset::after {
		content: '';
		position: absolute;
		inset: -5px 0;
	}

	.reset.loud {
		background: var(--terracotta-tint);
	}

	.nothing {
		margin: 0;
		padding: 16px 18px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	@media (prefers-reduced-motion: reduce) {
		.flash {
			animation: none;
		}
		.chevron {
			transition: none;
		}
	}
</style>
