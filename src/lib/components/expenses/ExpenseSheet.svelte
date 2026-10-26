<!--
	Add / edit an expense [9b] [9b-suggest] [9b-edit], in the order you think:
	how much, what for, who paid, then the split. The amount is the hero and
	takes the focus; with the household default and "paid by you" already chosen,
	amount → what for → Save is the whole job (→ plan 29 acceptance).

	The split is edited on its own sheet [9c], mounted over this one while open.
	It sits outside this form on purpose: its "make this the default" link is a
	form of its own, and forms don't nest.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Percent from '@lucide/svelte/icons/percent';
	import Trash from '@lucide/svelte/icons/trash-2';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpenseItem, ExpensePerson, SplitDefault } from '$lib/server/services/expenses';
	import type { CalendarDate } from '$lib/utils/dates';
	import {
		EXPENSE_CATEGORIES,
		EXPENSE_DESCRIPTION_MAX,
		type ExpenseCategory
	} from '$lib/utils/expenses';
	import { formatAmountInput, parseAmount } from '$lib/utils/money';
	import { untrack } from 'svelte';
	import AmountField from './AmountField.svelte';
	import CategoryIcon from './CategoryIcon.svelte';
	import DateRow from './DateRow.svelte';
	import SplitSheet from './SplitSheet.svelte';
	import {
		draftFromDefault,
		draftFromItem,
		draftRows,
		previewSplit,
		type SplitDraft
	} from './split-draft';

	type Props = {
		/** The expense being edited; null when adding. */
		item: ExpenseItem | null;
		/** Who can pay or share — members, plus anyone still owed or owing. */
		people: ExpensePerson[];
		me: string;
		currency: string;
		today: CalendarDate;
		splitDefault: SplitDefault;
		suggestions: { description: string; category: ExpenseCategory }[];
		onclose: () => void;
		/** After a delete went through, with the deleted id — the page offers the undo. */
		ondeleted?: (id: string) => void;
	};

	let { item, people, me, currency, today, splitDefault, suggestions, onclose, ondeleted }: Props =
		$props();

	const m = messages();
	const comma = m.expenses.decimalComma;

	let open = $state(true);
	let amount = $state(
		untrack(() => (item ? formatAmountInput(item.amountMinor, currency, comma) : ''))
	);
	let description = $state(untrack(() => item?.description ?? ''));
	let category = $state<ExpenseCategory | null>(untrack(() => item?.category ?? null));
	/** Set once a chip is tapped; until then the description's history may choose. */
	let categoryChosen = $state(untrack(() => item !== null));
	let paidById = $state(untrack(() => item?.paidById ?? me));
	let date = $state(untrack(() => item?.date ?? today));
	let draft = $state<SplitDraft>(
		untrack(() =>
			item ? draftFromItem(item, currency, comma) : draftFromDefault(people, splitDefault, comma)
		)
	);
	let splitting = $state(false);
	let describing = $state(false);
	let submitting = $state(false);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});

	const money = (minor: number) => m.expenses.money(minor, currency);
	const amountMinor = $derived(parseAmount(amount, currency));
	const preview = $derived(previewSplit(draft, amountMinor ?? 0, currency));
	const splitValid = $derived(amountMinor !== null && preview.result?.ok === true);
	const valid = $derived(splitValid && description.trim() !== '');
	const byId = $derived(new Map(people.map((person) => [person.id, person])));

	/** "Billa" finds "Wocheneinkauf · Billa": matched anywhere in the words [9b-suggest]. */
	const matches = $derived.by(() => {
		const query = description.trim().toLocaleLowerCase();
		if (!describing || query.length < 1) return [];
		return suggestions
			.filter(
				(suggestion) =>
					suggestion.description.toLocaleLowerCase().includes(query) &&
					suggestion.description !== description
			)
			.slice(0, 4);
	});

	/** The description's history proposes a category until you pick one yourself. */
	$effect(() => {
		const text = description.trim().toLocaleLowerCase();
		if (untrack(() => categoryChosen)) return;
		const known = suggestions.find(
			(suggestion) => suggestion.description.toLocaleLowerCase() === text
		);
		category = known?.category ?? null;
	});

	const summary = $derived.by(() => {
		if (!splitValid && amountMinor !== null) return m.expenses.summary.invalid;
		const members = people.filter((person) => person.memberId !== null);
		const everyone =
			draft.inIds.length === members.length &&
			members.every((person) => draft.inIds.includes(person.id));
		const who = everyone
			? m.expenses.summary.everyone
			: m.expenses.summary.people(draft.inIds.length);
		if (draft.mode === 'equal') {
			const each = preview.result?.ok ? (preview.result.shares[0]?.shareMinor ?? 0) : 0;
			return m.expenses.summary.equal(who, money(each));
		}
		if (draft.mode === 'amounts') return m.expenses.summary.amounts(who);
		const parts = m.expenses.summary.parts(
			draft.inIds.map((id) => ({
				name: byId.get(id)?.name ?? '?',
				value: (draft.inputs[id] ?? '').trim() || '1'
			}))
		);
		return draft.mode === 'percent'
			? m.expenses.summary.percent(parts)
			: m.expenses.summary.shares(parts);
	});

	const splitJson = $derived(JSON.stringify(draftRows(draft, currency) ?? []));

	function pick(suggestion: { description: string; category: ExpenseCategory }) {
		description = suggestion.description;
		if (!categoryChosen) category = suggestion.category;
		describing = false;
	}

	const uid = $props.id();
</script>

<BottomSheet bind:open title={item ? m.expenses.form.edit : m.expenses.form.new}>
	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			submitting = true;
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				submitting = false;
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
					return;
				}
				if (result.type === 'success') open = false;
			};
		}}
	>
		{#if item}<input type="hidden" name="id" value={item.id} />{/if}

		<AmountField
			bind:value={amount}
			name="amount"
			{currency}
			label={m.expenses.form.amount}
			autofocus={!item}
			required
		/>

		<label class="label" for="{uid}-what">{m.expenses.form.whatFor}</label>
		<div class="what">
			<input
				id="{uid}-what"
				class="text"
				name="description"
				bind:value={description}
				placeholder={m.expenses.form.whatForPlaceholder}
				maxlength={EXPENSE_DESCRIPTION_MAX}
				autocomplete="off"
				required
				onfocus={() => (describing = true)}
				oninput={() => (describing = true)}
				onblur={() => setTimeout(() => (describing = false), 150)}
			/>
			{#if matches.length > 0}
				<ul class="suggestions" aria-label={m.expenses.form.suggestions}>
					{#each matches as suggestion (suggestion.description)}
						<li>
							<button
								type="button"
								onmousedown={(event) => event.preventDefault()}
								onclick={() => pick(suggestion)}
							>
								<CategoryIcon category={suggestion.category} size={28} />
								<span>{suggestion.description}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<p class="label" id="{uid}-category">{m.expenses.form.category}</p>
		<div class="chips scroll" role="group" aria-labelledby="{uid}-category">
			{#each EXPENSE_CATEGORIES as key (key)}
				<Chip
					selected={(category ?? 'other') === key}
					onclick={() => {
						category = key;
						categoryChosen = true;
					}}
				>
					<CategoryIcon category={key} size={15} bare />
					{m.expenses.categories[key]}
				</Chip>
			{/each}
		</div>
		<input type="hidden" name="category" value={category ?? 'other'} />

		<p class="label" id="{uid}-payer">{m.expenses.form.paidBy}</p>
		<div class="chips" role="group" aria-labelledby="{uid}-payer">
			{#each people as person (person.id)}
				<Chip
					color={person.color}
					selected={paidById === person.id}
					onclick={() => (paidById = person.id)}
				>
					<Avatar name={person.name} color={person.color} size={24} />
					{person.name}
					{#if person.id === me}<span class="you">{m.expenses.form.you}</span>{/if}
				</Chip>
			{/each}
		</div>
		<input type="hidden" name="paidById" value={paidById} />

		<div class="group">
			<button type="button" class="row" onclick={() => (splitting = true)}>
				<Percent size={17} strokeWidth={1.8} aria-hidden="true" />
				<span class="row-label">{m.expenses.form.split}</span>
				<span class="row-value" class:invalid={!splitValid && amountMinor !== null}>{summary}</span>
				<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
			</button>
			<DateRow bind:value={date} {today} />
		</div>
		<input type="hidden" name="splitMode" value={draft.mode} />
		<input type="hidden" name="split" value={splitJson} />

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<Button type="submit" disabled={!valid || submitting}>
			{item ? m.common.saveChanges : m.expenses.form.save}
		</Button>
	</form>

	{#if item}
		<form
			method="POST"
			action="?/delete"
			use:enhance={() =>
				async ({ result, update }) => {
					// The screen that asked for the delete moves on by itself (the detail
					// goes back to the tab); reloading it first would load a deleted row.
					const gone = result.type === 'success' && Boolean(result.data?.deleted);
					if (!gone || !ondeleted) await update({ reset: false });
					if (gone) {
						ondeleted?.(item.id);
						open = false;
					}
				}}
		>
			<input type="hidden" name="id" value={item.id} />
			<button type="submit" class="delete">
				<Trash size={15} strokeWidth={2} aria-hidden="true" />
				{m.expenses.form.delete}
			</button>
		</form>
	{/if}
</BottomSheet>

{#if splitting}
	<SplitSheet
		{people}
		payerId={paidById}
		amountMinor={amountMinor ?? 0}
		{currency}
		{draft}
		subtitle={m.expenses.split.subtitle(money(amountMinor ?? 0), description.trim())}
		ondone={(next) => (draft = next)}
		onclose={() => (splitting = false)}
	/>
{/if}

<style>
	form {
		display: flex;
		flex-direction: column;
	}

	.label {
		margin: 18px 0 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.what {
		position: relative;
	}

	.text {
		width: 100%;
		padding: 14px 16px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
		font-size: calc(15px * var(--fs));
		color: var(--ink);
		outline: none;
	}

	.text:focus {
		border-color: var(--sage);
	}

	.text::placeholder {
		color: var(--text-disabled);
	}

	.suggestions {
		margin: 6px 0 0;
		padding: 4px;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--r-input);
		background: var(--card);
	}

	.suggestions button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px;
		border-radius: 10px;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		text-align: left;
		color: var(--ink);
	}

	.suggestions button:hover,
	.suggestions button:focus-visible {
		background: var(--sunken);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	/* The categories scroll sideways so the sheet never has to [9b]. */
	.scroll {
		flex-wrap: nowrap;
		margin: 0 calc(-1 * var(--page-pad));
		padding: 0 var(--page-pad) 2px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.scroll::-webkit-scrollbar {
		display: none;
	}

	.scroll :global(button) {
		flex: none;
	}

	.you {
		font-size: calc(12px * var(--fs));
		font-weight: 500;
		color: var(--text-5);
	}

	.group {
		margin: 20px 0 16px;
		border: 1px solid var(--border);
		border-radius: var(--r-block);
		background: var(--card);
	}

	.group > :global(* + *) {
		border-top: 1px solid var(--divider-sheet);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 13px 16px;
		color: var(--text-3);
		text-align: left;
	}

	.row-label {
		flex: none;
		font-size: calc(14.5px * var(--fs));
		font-weight: 600;
		color: var(--ink);
	}

	.row-value {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-size: calc(13px * var(--fs));
		text-align: right;
		color: var(--text-4);
		text-overflow: ellipsis;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.row-value.invalid {
		color: var(--danger);
	}

	.error {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: var(--r-input);
		background: var(--danger-tint);
		font-size: calc(13px * var(--fs));
		color: var(--danger);
	}

	.delete {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		margin-top: 8px;
		padding: 12px;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--danger);
	}
</style>
