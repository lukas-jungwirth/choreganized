<!--
	Which of a recipe's ingredients actually need buying [3e] (→ SPEC §4.8).

	The step that used to not exist: "add all to list" poured salt, pepper and
	olive oil onto the list every time, and the only way to find the four things
	you really needed was to read the whole list against the recipe. So the two
	doors — the basket on a recipe [7a] and the toggle on the plan sheet [3d] —
	now end here, with everything that would change the list ticked and everything
	that wouldn't explained.

	Opened *per opening*, like every other sheet: the ticks are seeded from the
	server's reading of the list and owned by the form afterwards.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { IngredientPick } from '$lib/server/services/recipe-shopping';
	import { untrack } from 'svelte';

	type Props = {
		pick: IngredientPick;
		onclose: () => void;
	};

	let { pick, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let submitting = $state(false);

	/**
	 * Seeded once from this opening's rows — `$state` on an object is a deep
	 * proxy, so `bind:checked` on a member of it is reactive without a Map.
	 */
	let ticked = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(pick.rows.map((row) => [row.id, row.selected])))
	);

	$effect(() => {
		if (!open) onclose();
	});

	const chosen = $derived(pick.rows.filter((row) => ticked[row.id]));
	const allOn = $derived(chosen.length === pick.rows.length);

	function setAll(on: boolean) {
		for (const row of pick.rows) ticked[row.id] = on;
	}

	/**
	 * The quiet line under a name: why the row is unticked, and what ticking it
	 * would do. Nothing at all for a plain new ingredient, which needs neither.
	 *
	 * A row that is *both* a cupboard staple and already on the list says only
	 * the second — "already on the list" is why it's off, and the cupboard is
	 * beside the point. A staple that would top up a row says both, because
	 * otherwise it sits there unticked with an amount and no reason.
	 */
	function outcome(row: IngredientPick['rows'][number]): string {
		const amount = m.units.amount(row.result.quantity, row.result.unit);

		return [
			row.staple && row.effect !== 'have' ? m.cooking.pick.staple : null,
			row.effect === 'have'
				? m.cooking.pick.have(amount)
				: row.effect === 'merge'
					? m.cooking.pick.merge(amount)
					: null
		]
			.filter((part) => part !== null)
			.join(' · ');
	}
</script>

<BottomSheet
	bind:open
	title={pick.recipeName}
	eyebrow={m.cooking.pick.eyebrow}
	subtitle={m.cooking.pick.subtitle}
>
	<form
		method="POST"
		action="?/addToList"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				if (result.type === 'success') open = false;
			};
		}}
	>
		<input type="hidden" name="recipeId" value={pick.recipeId} />

		<div class="head">
			<p class="count">{m.cooking.pick.chosen(chosen.length, pick.rows.length)}</p>
			<button type="button" class="link" onclick={() => setAll(!allOn)}>
				{allOn ? m.cooking.pick.none : m.cooking.pick.all}
			</button>
		</div>

		<ul class="rows">
			{#each pick.rows as row (row.id)}
				{@const amount = m.units.amount(row.quantity, row.unit)}
				{@const note = outcome(row)}
				<li>
					<label class="row" class:on={ticked[row.id]}>
						<input
							type="checkbox"
							name="ingredientId"
							value={row.id}
							bind:checked={ticked[row.id]}
						/>
						<CheckCircle checked={ticked[row.id]} size={22} />
						<span class="text">
							<span class="name">{row.name}</span>
							{#if note}<span class="note">{note}</span>{/if}
						</span>
						{#if amount}<span class="amount">{amount}</span>{/if}
					</label>
					<!-- What the sheet offered *ticked*: an untick only means "we have
						 that at home" measured against this (→ `services/pantry`). -->
					{#if row.selected}
						<input type="hidden" name="candidateId" value={row.id} />
					{/if}
				</li>
			{/each}
		</ul>

		<Button type="submit" disabled={submitting || chosen.length === 0}>
			{chosen.length === 0 ? m.cooking.pick.nothing : m.cooking.pick.submit(chosen.length)}
		</Button>
	</form>
</BottomSheet>

<style>
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin: 0 2px 10px;
	}

	/* The uppercase micro-label the sheets group a list under [3b]. */
	.count {
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.link {
		flex: none;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--sage);
	}

	/*
		The list scrolls on its own rather than with the sheet: a recipe with
		twenty ingredients would otherwise push the count and the button off the
		bottom, and the two numbers that make this sheet worth opening are exactly
		the ones you'd lose.
	*/
	.rows {
		max-height: 46dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		margin: 0 0 18px;
		/* Room for the scrollbar, which otherwise sits on the amount column. */
		padding: 0 8px 0 0;
		list-style: none;
	}

	li + li .row {
		border-top: 1px solid var(--divider-sheet);
	}

	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 6px;
		cursor: pointer;
	}

	/* The whole row is the (invisible) checkbox, the way Toggle is built: tap
	   target, keyboard and form submission come with the native control. */
	.row input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.row:has(input:focus-visible) {
		border-radius: 10px;
		outline: 2px solid var(--sage);
		outline-offset: -2px;
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.name {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
		color: var(--text-disabled);
		overflow-wrap: anywhere;
	}

	/* Typed as "400 g pasta", read back as "Pasta · 400 g" [7a]. */
	.name::first-letter {
		text-transform: uppercase;
	}

	.on .name {
		color: var(--ink);
	}

	.note {
		display: block;
		margin-top: 2px;
		font-size: 12px;
		line-height: 1.35;
		color: var(--text-5);
	}

	.amount {
		flex: none;
		font-size: 13.5px;
		color: var(--text-disabled);
	}

	.on .amount {
		color: var(--text-4);
	}
</style>
