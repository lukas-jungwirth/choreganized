<!--
	Settle up [9d]: who → whom, how much, when. Opened from the balance card it
	arrives filled in with that payment — the two people are the answer, so they
	show as two names, each in its own box, one above the other with the swap
	tucked between them, rather than a wall of chips. Stacked so a long name
	keeps the whole width.
	Either name is a picker (a real <select>: the platform's own list on a
	phone) for the rarer payment the card didn't suggest, and the arrow swaps
	them. The amount can be lowered for a partial payment. Editing a recorded
	payment opens the same sheet.

	The date is the app's ordinary date field, with a Today shortcut under it as
	in the task sheet [3b] (→ SPEC §11.8, DECISIONS #198).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowDownUp from '@lucide/svelte/icons/arrow-down-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpenseItem, ExpensePerson } from '$lib/server/services/expenses';
	import type { CalendarDate } from '$lib/utils/dates';
	import { formatAmountInput, parseAmount, type Payment } from '$lib/utils/money';
	import { untrack } from 'svelte';
	import AmountField from './AmountField.svelte';
	import DeleteExpenseForm from './DeleteExpenseForm.svelte';

	type Props = {
		/** A recorded payment to edit; otherwise a new one. */
		item?: ExpenseItem | null;
		/** The balance line it was opened from, if any. */
		suggested?: Payment | null;
		/** Every suggested payment, so the caption can say what is owed between the two picked. */
		payments: Payment[];
		people: ExpensePerson[];
		me: string;
		currency: string;
		today: CalendarDate;
		onclose: () => void;
		ondeleted?: (id: string) => void;
	};

	let {
		item = null,
		suggested = null,
		payments,
		people,
		me,
		currency,
		today,
		onclose,
		ondeleted
	}: Props = $props();

	const m = messages();
	const comma = m.expenses.decimalComma;

	const others = untrack(() => people.find((person) => person.id !== me)?.id ?? me);

	let open = $state(true);
	let fromId = $state(untrack(() => item?.paidById ?? suggested?.from ?? me));
	let toId = $state(untrack(() => item?.shares[0]?.personId ?? suggested?.to ?? others));
	let amount = $state(
		untrack(() => {
			const minor = item?.amountMinor ?? suggested?.amountMinor;
			return minor ? formatAmountInput(minor, currency, comma) : '';
		})
	);
	let date = $state(untrack(() => item?.date ?? today));
	let submitting = $state(false);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});

	const amountMinor = $derived(parseAmount(amount, currency));
	const valid = $derived(amountMinor !== null && fromId !== toId && date !== '');
	const byId = $derived(new Map(people.map((person) => [person.id, person])));
	const nameOf = (id: string) => (id === me ? null : (byId.get(id)?.name ?? '?'));

	/** "Elisabeth owes you €24.50 · lower it for a partial payment". */
	const caption = $derived.by(() => {
		const owed = payments.find((payment) => payment.from === fromId && payment.to === toId);
		if (!owed) return undefined;
		return m.expenses.settle.owes(
			nameOf(fromId),
			nameOf(toId),
			m.expenses.money(owed.amountMinor, currency)
		);
	});

	const uid = $props.id();
</script>

{#snippet picker(label: string, name: string, side: 'from' | 'to')}
	{@const value = side === 'from' ? fromId : toId}
	{@const person = byId.get(value)}
	<div class="end">
		<span class="end-label" id="{uid}-{side}-label">{label}</span>
		<Avatar name={person?.name} color={person?.color} size={36} />
		<span class="select">
			<select
				{name}
				aria-labelledby="{uid}-{side}-label"
				{value}
				onchange={(event) => {
					if (side === 'from') fromId = event.currentTarget.value;
					else toId = event.currentTarget.value;
				}}
			>
				{#each people as option (option.id)}
					<option value={option.id}>
						{option.id === me ? m.expenses.settle.me(option.name) : option.name}
					</option>
				{/each}
			</select>
			<ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" />
		</span>
	</div>
{/snippet}

<BottomSheet bind:open title={item ? m.expenses.settle.edit : m.expenses.settle.title}>
	<form
		method="POST"
		action="?/pay"
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

		<div class="who">
			{@render picker(m.expenses.settle.from, 'fromId', 'from')}
			<button
				type="button"
				class="swap"
				aria-label={m.expenses.settle.swap}
				onclick={() => ([fromId, toId] = [toId, fromId])}
			>
				<ArrowDownUp size={20} strokeWidth={2.1} />
			</button>
			{@render picker(m.expenses.settle.to, 'toId', 'to')}
		</div>

		<div class="amount">
			<AmountField
				bind:value={amount}
				name="amount"
				{currency}
				label={m.expenses.form.amount}
				{caption}
				required
			/>
		</div>

		<div class="date">
			<DateField
				label={m.expenses.form.date}
				name="date"
				bind:value={date}
				max={today}
				caption={date ? m.date.dateLabel(date, today) : undefined}
				required
			/>
			<button type="button" class="shortcut" onclick={() => (date = today)}>
				{m.expenses.form.today}
			</button>
		</div>

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<Button type="submit" disabled={!valid || submitting}>
			{item ? m.common.saveChanges : m.expenses.settle.record}
		</Button>
	</form>

	{#if item}
		<DeleteExpenseForm
			id={item.id}
			label={m.expenses.settle.delete}
			{ondeleted}
			ondone={() => (open = false)}
		/>
	{/if}
</BottomSheet>

<style>
	form {
		display: flex;
		flex-direction: column;
	}

	.who {
		display: flex;
		flex-direction: column;
	}

	/* From and To each in their own box; the swap sits in the gap, behind them. */
	.end {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 14px 16px;
		border-radius: var(--r-card);
		background: var(--field);
	}

	.end-label {
		flex: none;
		width: 3.2em;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.select {
		position: relative;
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
		color: var(--text-4);
	}

	/* The chevron sits in the select's own padding, so the whole row is the target. */
	.select :global(svg) {
		position: absolute;
		right: 0;
		pointer-events: none;
	}

	select {
		width: 100%;
		min-width: 0;
		padding: 2px 24px 2px 0;
		overflow: hidden;
		border: none;
		background: none;
		font-family: var(--font-display);
		font-size: calc(20px * var(--fs));
		font-weight: 600;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
		appearance: none;
		outline: none;
		cursor: pointer;
	}

	.end:focus-within select {
		text-decoration: underline 2px var(--sage);
		text-underline-offset: 5px;
	}

	/* Wider than the 32px gap it sits in, so the boxes tuck over its rim and
	   the two read as one pair; the icon itself stays clear of them. */
	.swap {
		display: flex;
		align-self: center;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		margin: -12px 0;
		border-radius: 50%;
		background: var(--sage);
		color: var(--on-sage);
	}

	.swap:active {
		transform: scale(0.95);
	}

	.amount {
		margin-top: 14px;
	}

	.date {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		margin: 18px 0 20px;
	}

	.date > :global(:first-child) {
		align-self: stretch;
	}

	.shortcut {
		align-self: flex-end;
		margin-top: 10px;
		padding: 7px 13px;
		border-radius: var(--r-chip);
		background: var(--sage-tint);
		font-size: calc(12.5px * var(--fs));
		font-weight: 600;
		color: var(--sage-deep);
	}

	.error {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: var(--r-input);
		background: var(--danger-tint);
		font-size: calc(13px * var(--fs));
		color: var(--danger);
	}

	@media (prefers-reduced-motion: reduce) {
		.swap:active {
			transform: none;
		}
	}
</style>
