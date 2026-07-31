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
	import ServingsField from '$lib/components/cooking/ServingsField.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CheckCircle from '$lib/components/ui/CheckCircle.svelte';
	import { messages } from '$lib/i18n';
	import type { IngredientPick, IngredientPickRow } from '$lib/server/services/recipe-shopping';
	import { scaleIngredients, servingsFactor } from '$lib/utils/ingredients';
	import { planAdds, type PlannedAdd } from '$lib/utils/shopping';
	import { untrack } from 'svelte';

	type Props = {
		pick: IngredientPick;
		/** How many to open on — the recipe screen's `?serves=`, else as written. */
		cookingFor?: number | null;
		onclose: () => void;
	};

	let { pick, cookingFor = null, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let submitting = $state(false);
	/** This form's own rejection — see MealPlanSheet for why not `$page.form`. */
	let error = $state<string | undefined>();

	/**
	 * Seeded once from this opening's rows — `$state` on an object is a deep
	 * proxy, so `bind:checked` on a member of it is reactive without a Map.
	 */
	let ticked = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(pick.rows.map((row) => [row.id, row.selected])))
	);

	/**
	 * How many people tonight is for. Seeded from the screen that raised the
	 * sheet and owned by the stepper afterwards; only offered at all when the
	 * recipe recorded what it was written for (→ SPEC §4.5).
	 */
	let serves = $state<number | null>(untrack(() => cookingFor ?? pick.writtenFor));

	$effect(() => {
		if (!open) onclose();
	});

	const factor = $derived(servingsFactor(pick.writtenFor, serves ?? 0));

	/**
	 * The rows as the list will receive them — the amounts written out for the
	 * number of people on the stepper, which is what the server scales to as
	 * well. Ticks are by id, so they survive a change of mind about the count.
	 */
	const rows = $derived(scaleIngredients(pick.rows, factor));
	const chosen = $derived(rows.filter((row) => ticked[row.id]));
	const allOn = $derived(chosen.length === rows.length);

	function setAll(on: boolean) {
		for (const row of rows) ticked[row.id] = on;
	}

	/**
	 * What each row would do to the list **as it is currently ticked** — the same
	 * `planAdds` the server will run on submit, re-run here on every tap.
	 *
	 * It has to be the ticked set, not the whole recipe: a recipe that names
	 * "Prise Pfeffer" twice plans the second occurrence on top of the first, so
	 * a preview computed over all the rows promises "becomes 4" while the untick
	 * above it means 3 will arrive. Rows that *aren't* ticked are planned one at
	 * a time against the untouched list, which is exactly what they'd do if the
	 * tick came back.
	 */
	const planned = $derived.by(() => {
		const byRow = new Map<string, PlannedAdd>();
		const plan = planAdds(pick.open, chosen);
		chosen.forEach((row, index) => byRow.set(row.id, plan.rows[index]));

		for (const row of rows) {
			if (!byRow.has(row.id)) byRow.set(row.id, planAdds(pick.open, [row]).rows[0]);
		}

		return byRow;
	});

	/**
	 * The quiet line under a name: why the row is unticked, and what ticking it
	 * would do. Nothing at all for a plain new ingredient, which needs neither.
	 *
	 * A row that is *both* a cupboard staple and already on the list says only
	 * the second — "already on the list" is why it's off, and the cupboard is
	 * beside the point. A staple that would top up a row says both, because
	 * otherwise it sits there unticked with an amount and no reason.
	 */
	function outcome(row: IngredientPickRow, effect: PlannedAdd): string {
		const amount = m.units.amount(effect.result.quantity, effect.result.unit);

		return [
			row.staple && effect.effect !== 'have' ? m.cooking.pick.staple : null,
			effect.effect === 'have'
				? m.cooking.pick.have(amount)
				: effect.effect === 'merge'
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
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				// The recipe can go while the sheet is up — a housemate deleting it
				// answers 409, and a button that simply becomes clickable again is
				// indistinguishable from a tap that didn't register.
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		<input type="hidden" name="recipeId" value={pick.recipeId} />

		{#if pick.writtenFor !== null}
			<ServingsField
				bind:value={serves}
				writtenFor={pick.writtenFor}
				name="cookingFor"
				surface="field"
			/>
		{/if}

		<div class="head">
			<p class="count">{m.cooking.pick.chosen(chosen.length, rows.length)}</p>
			<button type="button" class="link" onclick={() => setAll(!allOn)}>
				{allOn ? m.cooking.pick.none : m.cooking.pick.all}
			</button>
		</div>

		<ul class="rows">
			{#each rows as row (row.id)}
				{@const amount = m.units.amount(row.quantity, row.unit)}
				{@const note = outcome(row, planned.get(row.id)!)}
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

		{#if error}<p class="error">{error}</p>{/if}

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

	.error {
		margin: 0 0 12px;
		padding: 0 4px;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.on .amount {
		color: var(--text-4);
	}
</style>
