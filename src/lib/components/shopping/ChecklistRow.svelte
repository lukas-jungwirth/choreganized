<!--
	A checklist on the overview [L1] [L7] (plan 36 step 2): always one row, and a
	tap anywhere on it opens it. It never unfolds in place: a packing list is
	worked through opened, not glanced at between shopping lists.

	Icon in the terracotta well (shopping lists wear sage), the name, what is
	left ("7 left · Sunscreen, Swimwear…"), a ring with "5/12", and the same
	open button every card has, drawn here because the whole row is the link.
-->
<script lang="ts">
	import ListIcon from '$lib/components/shopping/ListIcon.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingGroup } from '$lib/server/services/shopping';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';

	type Props = {
		group: ShoppingGroup;
		href: string;
		/** Something was just added here from the overview's field. */
		flash?: number;
	};

	let { group, href, flash = 0 }: Props = $props();

	const m = messages();

	const total = $derived(group.items.length);
	const open = $derived(group.items.filter((item) => item.checkedAt === null));
	const done = $derived(total - open.length);
	const all = $derived(total > 0 && open.length === 0);

	const peek = $derived(
		total === 0
			? m.shopping.lists.nothingYet
			: all
				? m.shopping.lists.allDone
				: m.shopping.lists.checklistPeek(
						open.length,
						open
							.slice(0, 3)
							.map((item) => item.name)
							.join(', ') + (open.length > 3 ? '…' : '')
					)
	);

	/** The ring's circumference at r = 7. */
	const CIRCLE = 2 * Math.PI * 7;
</script>

{#key flash}
	<a class="row" class:flash={flash > 0} {href} data-list={group.storeId}>
		<span class="well" aria-hidden="true"><ListIcon icon={group.icon} size={19} /></span>
		<span class="titles">
			<span class="name">{group.name}</span>
			<span class="peek">{peek}</span>
		</span>
		<span class="count" class:all>
			<svg class="ring" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<circle class="track" cx="9" cy="9" r="7" />
				<circle
					class="fill"
					cx="9"
					cy="9"
					r="7"
					stroke-dasharray={CIRCLE}
					stroke-dashoffset={total ? CIRCLE * (1 - done / total) : CIRCLE}
				/>
			</svg>
			<span aria-hidden="true">{m.shopping.lists.ticked(done, total)}</span>
			<span class="hidden-label">{m.shopping.lists.doneOf(done, total)}</span>
		</span>
		<span class="opener" aria-hidden="true"><Maximize2 size={16} strokeWidth={2} /></span>
	</a>
{/key}

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 60px;
		padding: 11px 12px;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: inherit;
		text-decoration: none;
	}

	.row:active {
		background: var(--sage-row);
	}

	/* Something added here from the overview's field: it lights up once, like a
	   folded shopping list's card does. */
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

	.well {
		display: grid;
		flex: none;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: var(--terracotta-tint);
		color: var(--terracotta-deep);
	}

	.titles {
		display: grid;
		flex: 1;
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

	.count {
		display: flex;
		flex: none;
		align-items: center;
		gap: 6px;
		font-size: var(--fs-15);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}

	.count.all {
		color: var(--sage-deep);
	}

	.ring {
		flex: none;
		transform: rotate(-90deg);
	}

	.ring circle {
		fill: none;
		stroke-width: 3;
	}

	.ring .track {
		stroke: var(--track);
	}

	.ring .fill {
		stroke: var(--terracotta);
		stroke-linecap: round;
		transition: stroke-dashoffset 300ms ease-out;
	}

	.all .ring .fill {
		stroke: var(--sage);
	}

	/* Read out as "5 of 12 done"; the eye has "5/12". */
	.hidden-label {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.opener {
		display: grid;
		flex: none;
		place-items: center;
		width: 34px;
		height: 34px;
		margin-left: -1px;
		border-radius: 11px;
		background: var(--sunken);
		color: var(--text-3);
	}

	@media (prefers-reduced-motion: reduce) {
		.flash {
			animation: none;
		}
		.ring .fill {
			transition: none;
		}
	}
</style>
