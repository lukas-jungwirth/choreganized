<!--
	Settings → Expenses, and the tab's "Expense settings" (→ SPEC §11.10): the
	household currency, the default split and the guests [G4] (→ SPEC §11.15).
	Both screens mount this sheet and post the same actions
	(→ `$lib/server/expense-actions.ts`).

	The currency is the owner's, and only until the first expense: after that
	the row says why it is fixed rather than offering a choice that would
	relabel every stored amount (→ DECISIONS #170). The default split is anyone's
	— it only pre-fills a form everyone can change.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpensePerson, SplitDefault } from '$lib/server/services/expenses';
	import { CURRENCIES } from '$lib/utils/expenses';
	import { formatPercent } from '$lib/utils/money';
	import AddGuestSheet from './AddGuestSheet.svelte';
	import GuestSheet from './GuestSheet.svelte';
	import SplitSheet from './SplitSheet.svelte';
	import { draftFromDefault } from './split-draft';

	type Props = {
		people: ExpensePerson[];
		/** Person id → balance, for where each guest stands [G4]. */
		balances: Record<string, number>;
		/** Person id → the running series they are in, which removing a guest stops. */
		series: Record<string, string[]>;
		currency: string;
		currencyLocked: boolean;
		isOwner: boolean;
		splitDefault: SplitDefault;
		onclose: () => void;
	};

	let {
		people,
		balances,
		series,
		currency,
		currencyLocked,
		isOwner,
		splitDefault,
		onclose
	}: Props = $props();

	const m = messages();

	let open = $state(true);
	let editingSplit = $state(false);
	let addingGuest = $state(false);
	/** The guest whose sheet [G5] is open, by id: their row may change under it. */
	let guestId = $state<string | null>(null);
	let error = $state<string | undefined>();
	let form: HTMLFormElement | undefined = $state();

	$effect(() => {
		if (!open) onclose();
	});

	const members = $derived(people.filter((person) => person.memberId !== null));
	const guests = $derived(people.filter((person) => person.guest && !person.removed));
	const openGuest = $derived(guests.find((person) => person.id === guestId) ?? null);
	const canChooseCurrency = $derived(isOwner && !currencyLocked);
	const options = CURRENCIES.map((code) => ({ value: code, label: code }));

	/** "Equally between everyone", or "Lukas 30 · Elisabeth 70". */
	const defaultLabel = $derived.by(() => {
		if (splitDefault.mode === 'equal') return m.expenses.settings.equalEveryone;
		const parts = members
			.filter((person) => splitDefault.weights[person.id] !== undefined)
			.map((person) => ({
				name: person.name,
				value:
					splitDefault.mode === 'percent'
						? `${formatPercent(splitDefault.weights[person.id], m.expenses.decimalComma)}%`
						: String(splitDefault.weights[person.id])
			}));
		return m.expenses.summary.parts(parts);
	});

	/** Members who joined after a % or shares default was set (→ SPEC §11.5). */
	const notInDefault = $derived(
		splitDefault.mode === 'equal'
			? []
			: members
					.filter((person) => splitDefault.weights[person.id] === undefined)
					.map((person) => person.name)
	);
</script>

<BottomSheet bind:open title={m.expenses.settings.title}>
	<form
		bind:this={form}
		method="POST"
		action="?/currency"
		use:enhance={() => {
			error = undefined;
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'failure') {
					error = typeof result.data?.error === 'string' ? result.data.error : undefined;
				}
			};
		}}
	>
		{#if canChooseCurrency}
			<Select
				label={m.expenses.settings.currency}
				name="currency"
				value={currency}
				{options}
				onchange={() => form?.requestSubmit()}
			/>
		{:else}
			<div class="fixed">
				<span class="fixed-label">{m.expenses.settings.currency}</span>
				<span class="fixed-value">{currency}</span>
			</div>
			<p class="caption">
				{currencyLocked ? m.expenses.settings.currencyLocked : m.expenses.settings.ownerOnly}
			</p>
		{/if}
	</form>

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<button type="button" class="row" onclick={() => (editingSplit = true)}>
		<span class="row-text">
			<span class="row-label">{m.expenses.settings.defaultSplit}</span>
			<span class="row-value">{defaultLabel}</span>
		</span>
		<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
	</button>

	<h3 class="section">{m.expenses.guests.group}</h3>
	<ul class="guests">
		{#each guests as guest (guest.id)}
			{@const balance = balances[guest.id] ?? 0}
			<li>
				<button type="button" class="guest" onclick={() => (guestId = guest.id)}>
					<Avatar name={guest.name} color={guest.color} guest size={32} />
					<span class="row-text">
						<span class="row-label">{guest.name}</span>
						<span class="row-value">
							{m.expenses.guests.standing(balance, m.expenses.money(Math.abs(balance), currency))}
						</span>
					</span>
					<ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
				</button>
			</li>
		{/each}
		<li>
			<button type="button" class="guest add" onclick={() => (addingGuest = true)}>
				<span class="plus" aria-hidden="true"><Plus size={16} strokeWidth={2.2} /></span>
				{m.expenses.guests.add}
			</button>
		</li>
	</ul>
	<p class="caption">{m.expenses.guests.groupCaption}</p>
</BottomSheet>

{#if addingGuest}
	<AddGuestSheet onclose={() => (addingGuest = false)} />
{/if}

{#if openGuest}
	<GuestSheet
		guest={openGuest}
		balance={balances[openGuest.id] ?? 0}
		{currency}
		equalDefault={splitDefault.mode === 'equal'}
		series={series[openGuest.id] ?? []}
		onclose={() => (guestId = null)}
	/>
{/if}

{#if editingSplit}
	<SplitSheet
		people={members}
		payerId={null}
		amountMinor={0}
		{currency}
		draft={draftFromDefault(members, splitDefault, m.expenses.decimalComma)}
		purpose="default"
		{notInDefault}
		ondone={() => {}}
		onclose={() => (editingSplit = false)}
	/>
{/if}

<style>
	.fixed {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-radius: var(--r-input);
		background: var(--field);
	}

	.fixed-label {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.fixed-value {
		font-size: var(--fs-16);
		font-weight: 700;
		color: var(--text-3);
	}

	.caption {
		margin: 8px 4px 0;
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--text-4);
	}

	.error {
		margin: 10px 0 0;
		font-size: var(--fs-15);
		color: var(--danger);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		margin-top: 18px;
		padding: 14px 16px;
		border: 1px solid var(--border);
		border-radius: var(--r-block);
		color: var(--text-4);
		text-align: left;
	}

	.row-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row-label {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.row-value {
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.section {
		margin: 22px 4px 8px;
		font-family: var(--font-body);
		font-size: var(--fs-13);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-4);
	}

	.guests {
		margin: 0;
		padding: 0;
		overflow: hidden;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--r-block);
	}

	.guests li + li {
		border-top: 1px solid var(--divider-sheet);
	}

	.guest {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 16px;
		color: var(--text-4);
		text-align: left;
	}

	.guest.add {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--sage-deep);
	}

	.plus {
		display: grid;
		flex: none;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--border-dashed);
	}
</style>
