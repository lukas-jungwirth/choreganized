<!--
	Settle up [9d]: who → whom, how much, when. Opened from the balance card it
	arrives filled in with that payment — the two people are the answer, so they
	show as two names, each in its own box, one above the other, with a dotted
	arrow down the left from one to the other rather than a wall of chips.
	Stacked so a long name keeps the whole width. Either name is a picker (a
	real <select>: the platform's own list on a phone) for the rarer payment the
	card didn't suggest. No swap: the pair always arrives filled in, and either
	picker changes it (→ DECISIONS #198). The amount can be lowered for a partial payment. Editing a recorded
	payment opens the same sheet.

	The date is the app's ordinary date field, the same plain one as the history
	filter's From / To, starting on today (→ SPEC §11.8, DECISIONS #202).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
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
			<!-- From the middle of one box to the middle of the other. -->
			<svg class="flow" viewBox="0 0 24 80" aria-hidden="true">
				<path class="dots" d="M21 4 C10 4 4 8 4 20 V60 C4 72 10 76 19 76" />
				<path d="M15 71.5 L19.5 76 L15 80.5" />
			</svg>
			{@render picker(m.expenses.settle.from, 'fromId', 'from')}
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
			<DateField label={m.expenses.form.date} name="date" bind:value={date} max={today} required />
		</div>

		{#if fromId === toId}
			<p class="error" role="alert">{m.expenses.errors.samePerson}</p>
		{:else if error}
			<p class="error" role="alert">{error}</p>
		{/if}

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

	/* Room on the left for the arrow; the boxes are 64px tall (a 36px avatar in
	   14px padding) 8px apart, so their middles are 72px apart. */
	.who {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-left: 26px;
	}

	.flow {
		position: absolute;
		top: 28px;
		left: 0;
		width: 24px;
		height: 80px;
		overflow: visible;
		fill: none;
		stroke: var(--sage);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.dots {
		stroke-dasharray: 0.1 4.5;
		stroke-width: 2.2;
	}

	/* From and To each in their own box. */
	.end {
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
		font-size: var(--fs-13);
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
		font-size: var(--fs-22);
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

	.amount {
		margin-top: 14px;
	}

	.date {
		margin: 18px 0 20px;
	}

	.error {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: var(--r-input);
		background: var(--danger-tint);
		font-size: var(--fs-15);
		color: var(--danger);
	}
</style>
