<!--
	"Recently bought · 3" — the second list, under the stores (→ SPEC §3.1).

	Everything ticked off leaves its store group and collects here, newest
	first, so a half-done trip doesn't push what you still need off the screen.
	It stays folded up: what's already in the trolley is context, not the job,
	and the header above the list ("4 of 9 done") is the part you check while
	shopping. One tap opens it — to look, or to put something back.

	The rows are the ordinary `ShoppingRow`, which already goes quiet when it's
	checked: struck name with the quantity folded in, no avatar.
-->
<script lang="ts">
	import ShoppingRow from '$lib/components/shopping/ShoppingRow.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { ShoppingListItem } from '$lib/server/services/shopping';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { untrack } from 'svelte';

	type Props = {
		items: ShoppingListItem[];
		/**
		 * Open by default when there is nothing left to buy: a screen showing one
		 * folded-up line and nothing else would look like a list that had lost
		 * its contents.
		 */
		startOpen?: boolean;
		/** The page owns the optimistic bookkeeping, so it hands in the handler. */
		toggle: (item: ShoppingListItem) => SubmitFunction;
		onedit: (item: ShoppingListItem) => void;
	};

	let { items, startOpen = false, toggle, onedit }: Props = $props();

	const m = messages();

	// Seeded once and then owned by the tap, which `untrack` says out loud:
	// ticking the last open item off must not fold the section open under the
	// hand of somebody who just closed it.
	let open = $state(untrack(() => startOpen));
	const listId = $props.id();
</script>

<section class="bought">
	<h2>
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			aria-controls={listId}
		>
			{m.shopping.bought.heading(items.length)}
			<span class="chevron" class:open aria-hidden="true">
				<ChevronDown size={14} strokeWidth={2.4} />
			</span>
		</button>
	</h2>

	{#if open}
		<Card radius="md">
			<ul class="rows" id={listId}>
				{#each items as item (item.id)}
					<ShoppingRow {item} checked toggle={toggle(item)} onedit={() => onedit(item)} />
				{/each}
			</ul>
		</Card>
	{/if}
</section>

<style>
	.bought {
		margin-bottom: 18px;
	}

	/* The store headings' typography — this is one more group, not a new idea. */
	h2 {
		margin: 0;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	button {
		display: flex;
		align-items: center;
		gap: 6px;
		/* The heading sits at the group headings' inset; the padding grows the
		   target to 44px without moving the words. */
		margin: -8px 0 0 4px;
		padding: 8px 4px 8px 0;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
	}

	.chevron {
		display: flex;
		transition: transform 140ms ease-out;
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}

	.rows {
		/* Keeps a pressed row's tint inside the card's corners. */
		overflow: hidden;
		border-radius: inherit;
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
