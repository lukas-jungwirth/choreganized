<!--
	Settle up [9d]: from → to, how much, when. Opened from a line on the balance
	card it arrives filled in, and the amount can be lowered for a partial
	payment. Editing a recorded payment opens the same sheet.

	It only records the payment: no money moves through the app, and the note
	under the button says so (→ SPEC §11.8).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Chip from '$lib/components/ui/Chip.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpenseItem, ExpensePerson } from '$lib/server/services/expenses';
	import type { CalendarDate } from '$lib/utils/dates';
	import { formatAmountInput, parseAmount, type Payment } from '$lib/utils/money';
	import { untrack } from 'svelte';
	import AmountField from './AmountField.svelte';
	import DateRow from './DateRow.svelte';
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
	const valid = $derived(amountMinor !== null && fromId !== toId);
	const nameOf = (id: string) =>
		id === me ? null : (people.find((person) => person.id === id)?.name ?? '?');

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

{#snippet chooser(label: string, labelId: string, value: string, onpick: (id: string) => void)}
	<p class="label" id={labelId}>{label}</p>
	<div class="chips" role="group" aria-labelledby={labelId}>
		{#each people as person (person.id)}
			<Chip color={person.color} selected={value === person.id} onclick={() => onpick(person.id)}>
				<Avatar name={person.name} color={person.color} size={24} />
				{person.name}
				{#if person.id === me}<span class="you">{m.expenses.form.you}</span>{/if}
			</Chip>
		{/each}
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

		{@render chooser(m.expenses.settle.from, `${uid}-from`, fromId, (id) => (fromId = id))}
		<button
			type="button"
			class="swap"
			aria-label={m.expenses.settle.swap}
			onclick={() => ([fromId, toId] = [toId, fromId])}
		>
			<ArrowDown size={15} strokeWidth={2.2} />
		</button>
		{@render chooser(m.expenses.settle.to, `${uid}-to`, toId, (id) => (toId = id))}
		<input type="hidden" name="fromId" value={fromId} />
		<input type="hidden" name="toId" value={toId} />

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

		<div class="group">
			<DateRow bind:value={date} {today} />
		</div>

		{#if error}<p class="error" role="alert">{error}</p>{/if}

		<Button type="submit" disabled={!valid || submitting}>
			{item ? m.common.saveChanges : m.expenses.settle.record}
		</Button>
		<p class="note">{m.expenses.settle.note}</p>
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

	.label {
		margin: 6px 0 8px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.you {
		font-size: calc(12px * var(--fs));
		font-weight: 500;
		color: var(--text-5);
	}

	.swap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		margin: 10px 0 4px 14px;
		border-radius: 50%;
		background: var(--sunken);
		color: var(--text-3);
	}

	.amount {
		margin-top: 18px;
	}

	.group {
		margin: 14px 0 16px;
		border: 1px solid var(--border);
		border-radius: var(--r-block);
		background: var(--card);
	}

	.error {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: var(--r-input);
		background: var(--danger-tint);
		font-size: calc(13px * var(--fs));
		color: var(--danger);
	}

	.note {
		margin: 12px 8px 0;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		text-align: center;
		color: var(--text-4);
	}
</style>
