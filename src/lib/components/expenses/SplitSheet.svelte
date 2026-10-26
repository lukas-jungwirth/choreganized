<!--
	Split [9c] [9c-ok]: who is in, and how — equally, by amounts, by percent or
	by shares. Every row always shows the money it comes to, and the footer says
	whether it adds up; Done waits until it does.

	Two jobs, one sheet. Over the add sheet [9b] it edits that expense's split and
	hands the draft back on Done; from Settings it edits the household default
	(→ SPEC §11.5), where there is no amount to split and no "Amounts" mode,
	and Done saves.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import Check from '@lucide/svelte/icons/check';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpensePerson } from '$lib/server/services/expenses';
	import {
		DEFAULT_SPLIT_MODES,
		PERCENT_TOTAL,
		SPLIT_MODES,
		type SplitMode
	} from '$lib/utils/expenses';
	import { formatAmountInput, formatPercent, parsePercent } from '$lib/utils/money';
	import { untrack } from 'svelte';
	import { draftRows, previewSplit, type SplitDraft } from './split-draft';

	type Props = {
		people: ExpensePerson[];
		/** Tagged "paid" in its row; null in default mode. */
		payerId: string | null;
		/** What is being split; 0 in default mode, which shows no money. */
		amountMinor: number;
		currency: string;
		draft: SplitDraft;
		/** "€42.10 · Weekly shop · Billa". */
		subtitle?: string;
		purpose?: 'expense' | 'default';
		/** Somebody joined after a % / shares default was set (→ SPEC §11.5). */
		notInDefault?: string[];
		ondone: (draft: SplitDraft) => void;
		onclose: () => void;
	};

	let {
		people,
		payerId,
		amountMinor,
		currency,
		draft: initial,
		subtitle,
		purpose = 'expense',
		notInDefault = [],
		ondone,
		onclose
	}: Props = $props();

	const m = messages();

	let open = $state(true);
	let mode = $state<SplitMode>(untrack(() => initial.mode));
	let inIds = $state<string[]>(untrack(() => [...initial.inIds]));
	let inputs = $state<Record<string, string>>(untrack(() => ({ ...initial.inputs })));
	/** The confirm line under "Make this the household default", once it is saved. */
	let savedDefault = $state<string | null>(null);
	let error = $state<string | undefined>();

	$effect(() => {
		if (!open) onclose();
	});

	const forDefault = $derived(purpose === 'default');
	const comma = m.expenses.decimalComma;
	const money = (minor: number) => m.expenses.money(minor, currency);

	const draft = $derived<SplitDraft>({ mode, inIds, inputs });
	// Default mode has nothing to split, so its preview runs on a nominal amount
	// only to answer "does this add up?" — the money column stays hidden.
	const preview = $derived(previewSplit(draft, forDefault ? 10_000 : amountMinor, currency));
	const valid = $derived(preview.result?.ok === true);
	const rows = $derived(draftRows(draft, currency));

	const modes = $derived(
		(forDefault ? DEFAULT_SPLIT_MODES : SPLIT_MODES).map((value) => ({
			value,
			label: m.expenses.split.modes[value]
		}))
	);

	/** In roster order, whatever order they were ticked in. */
	function setIn(id: string, included: boolean) {
		const next = new Set(inIds);
		if (included) next.add(id);
		else next.delete(id);
		inIds = people.map((person) => person.id).filter((personId) => next.has(personId));
	}

	/**
	 * Switching mode fills the fields that are still empty with what the split
	 * already comes to, so "Amounts" opens on numbers that add up rather than
	 * on blanks.
	 */
	function prefill(next: SplitMode) {
		const filled = { ...inputs };
		const current = preview.amounts;
		const count = inIds.length;
		inIds.forEach((id, index) => {
			if ((filled[id] ?? '').trim() !== '') return;
			if (next === 'amounts' && current[id] !== undefined) {
				filled[id] = formatAmountInput(current[id], currency, comma);
			} else if (next === 'percent' && count > 0) {
				const each = Math.floor(PERCENT_TOTAL / count / 10) * 10;
				const share = index === count - 1 ? PERCENT_TOTAL - each * (count - 1) : each;
				filled[id] = formatPercent(share, comma);
			} else if (next === 'shares') {
				filled[id] = '1';
			}
		});
		inputs = filled;
	}

	/** Read before the mode flips, so the fill is what the old mode came to. */
	function switchMode(next: string) {
		const target = next as SplitMode;
		if (target === mode) return;
		prefill(target);
		mode = target;
	}

	/** With two people in, typing one percentage fills the other [9c-ok]. */
	function onInput(id: string, text: string) {
		inputs = { ...inputs, [id]: text };
		if (mode !== 'percent' || inIds.length !== 2) return;
		const value = parsePercent(text);
		if (value === null) return;
		const other = inIds.find((personId) => personId !== id);
		if (other) inputs = { ...inputs, [other]: formatPercent(PERCENT_TOTAL - value, comma) };
	}

	/** The footer's verdict [9c]: what's left, what's over, or that it adds up. */
	const status = $derived.by(
		(): { tone: 'ok' | 'error' | 'info'; text: string; aside?: string } | null => {
			if (inIds.length === 0) return { tone: 'error', text: m.expenses.split.nobody };
			if (mode === 'amounts') {
				if (valid) return { tone: 'ok', text: m.expenses.split.addsUp };
				const missing = amountMinor - preview.assigned;
				return {
					tone: 'error',
					text:
						missing > 0
							? m.expenses.split.left(money(missing))
							: m.expenses.split.over(money(-missing)),
					aside: m.expenses.split.ofTotal(money(preview.assigned), money(amountMinor))
				};
			}
			if (mode === 'percent') {
				if (valid) return { tone: 'ok', text: m.expenses.split.percentOk };
				const missing = PERCENT_TOTAL - preview.assigned;
				return {
					tone: 'error',
					text:
						missing > 0
							? m.expenses.split.percentLeft(formatPercent(missing, comma))
							: m.expenses.split.percentOver(formatPercent(-missing, comma))
				};
			}
			if (mode === 'shares' && rows) {
				const total = rows.reduce((sum, row) => sum + (row.input ?? 0), 0);
				return { tone: 'info', text: m.expenses.split.sharesTotal(total) };
			}
			return null;
		}
	);

	/** "30 / 70" for the confirm line; "1 · 2" for shares. */
	function partsLabel(): string {
		const values = inIds.map((id) => (inputs[id] ?? '').trim() || '1');
		return values.join(mode === 'percent' ? ' / ' : ' · ');
	}

	const splitJson = $derived(JSON.stringify(rows ?? []));

	/**
	 * The default is about expenses to come, so it is only offered while everyone
	 * ticked is a current member — a former member still owed something can be
	 * in today's split, but in none of tomorrow's. `everyone` is every current
	 * member ticked, which is what the default's own `equal` means (→ SPEC §11.5).
	 */
	const memberIds = $derived(people.filter((person) => person.memberId).map((person) => person.id));
	const defaultable = $derived(inIds.every((id) => memberIds.includes(id)));
	const everyone = $derived(defaultable && memberIds.every((id) => inIds.includes(id)));
	/** An equal split over a subset is "1 share each" as a default. */
	const defaultMode = $derived(mode === 'equal' && !everyone ? 'shares' : mode);

	function done() {
		ondone({ mode, inIds: [...inIds], inputs: { ...inputs } });
		open = false;
	}

	const groupId = $props.id();
</script>

<BottomSheet
	bind:open
	title={forDefault ? m.expenses.split.defaultTitle : m.expenses.split.title}
	{subtitle}
>
	<div class="modes">
		<SegmentedControl
			label={m.expenses.split.mode}
			bind:value={() => mode, switchMode}
			options={modes}
		/>
	</div>

	<ul class="people" aria-labelledby={groupId}>
		{#each people as person (person.id)}
			{@const included = inIds.includes(person.id)}
			<li class="person" class:out={!included}>
				<input
					type="checkbox"
					checked={included}
					aria-label={m.expenses.split.include(person.name)}
					onchange={(event) => setIn(person.id, event.currentTarget.checked)}
				/>
				<Avatar name={person.name} color={person.color} size={28} />
				<span class="name">
					{person.name}
					{#if person.id === payerId}<span class="tag">{m.expenses.split.paid}</span>{/if}
				</span>
				{#if !included}
					<span class="not-in">{m.expenses.split.notIn}</span>
				{:else}
					{#if mode !== 'equal'}
						<label class="input">
							{#if mode === 'amounts'}<span class="unit">{m.expenses.symbol(currency)}</span>{/if}
							<input
								value={inputs[person.id] ?? ''}
								inputmode={mode === 'shares' ? 'numeric' : 'decimal'}
								autocomplete="off"
								aria-label={m.expenses.split.input(person.name)}
								oninput={(event) => onInput(person.id, event.currentTarget.value)}
							/>
							{#if mode === 'percent'}<span class="unit">%</span>{/if}
						</label>
					{/if}
					{#if !forDefault && mode !== 'amounts'}
						<span class="money">{money(preview.amounts[person.id] ?? 0)}</span>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

	{#if forDefault && mode !== 'equal'}
		{#each notInDefault as name (name)}
			<p class="hint">{m.expenses.split.notInDefault(name)}</p>
		{/each}
	{/if}

	{#if status}
		<p class="status {status.tone}" role="status">
			{#if status.tone === 'ok'}<Check size={16} strokeWidth={2.4} aria-hidden="true" />{/if}
			{#if status.tone === 'error'}<AlertCircle size={16} strokeWidth={2} aria-hidden="true" />{/if}
			<span class="status-text">{status.text}</span>
			{#if status.aside}<span class="aside">{status.aside}</span>{/if}
		</p>
	{/if}

	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if forDefault}
		<form
			method="POST"
			action="?/splitDefault"
			use:enhance={() => {
				error = undefined;
				return async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'failure') {
						error = typeof result.data?.error === 'string' ? result.data.error : undefined;
						return;
					}
					if (result.type === 'success') done();
				};
			}}
		>
			<input type="hidden" name="mode" value={mode} />
			<input type="hidden" name="split" value={splitJson} />
			<Button type="submit" disabled={!valid}>{m.expenses.split.done}</Button>
		</form>
	{:else}
		{#if mode !== 'amounts' && defaultable}
			{#if savedDefault}
				<p class="saved" role="status">{savedDefault}</p>
			{:else}
				<form
					method="POST"
					action="?/splitDefault"
					use:enhance={() => {
						error = undefined;
						const label =
							mode === 'equal' && everyone
								? m.expenses.split.defaultEqual
								: m.expenses.split.defaultSaved(partsLabel());
						return async ({ result, update }) => {
							await update({ reset: false, invalidateAll: true });
							if (result.type === 'failure') {
								error = typeof result.data?.error === 'string' ? result.data.error : undefined;
								return;
							}
							if (result.type === 'success') savedDefault = label;
						};
					}}
				>
					<input type="hidden" name="mode" value={defaultMode} />
					<input
						type="hidden"
						name="split"
						value={mode === 'equal'
							? JSON.stringify(inIds.map((id) => ({ id, input: 1 })))
							: splitJson}
					/>
					<button type="submit" class="default-link" disabled={!valid}>
						{m.expenses.split.makeDefault}
					</button>
				</form>
			{/if}
		{/if}
		<Button type="button" disabled={!valid} onclick={done}>{m.expenses.split.done}</Button>
	{/if}
	<span hidden id={groupId}>{m.expenses.split.title}</span>
</BottomSheet>

<style>
	.modes {
		margin-bottom: 8px;
	}

	.people {
		margin: 0 0 14px;
		padding: 0;
		list-style: none;
	}

	.person {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 64px;
		padding: 8px 0;
	}

	.person + .person {
		border-top: 1px solid var(--divider-sheet);
	}

	.person input[type='checkbox'] {
		flex: none;
		width: 22px;
		height: 22px;
		margin: 0;
		accent-color: var(--sage);
	}

	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-size: calc(15px * var(--fs));
		font-weight: 600;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.out .name {
		color: var(--text-5);
	}

	.out :global(.avatar) {
		opacity: 0.45;
	}

	.tag {
		margin-left: 4px;
		font-size: calc(12px * var(--fs));
		font-weight: 500;
		color: var(--text-5);
	}

	.not-in {
		font-size: calc(13px * var(--fs));
		color: var(--text-5);
	}

	.input {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: 4px;
		width: 92px;
		padding: 10px 12px;
		border: 1.5px solid transparent;
		border-radius: var(--r-input);
		background: var(--field);
	}

	.input:focus-within {
		border-color: var(--sage);
	}

	.input input {
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		font-size: calc(15.5px * var(--fs));
		font-weight: 700;
		text-align: right;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
		outline: none;
	}

	.unit {
		font-size: calc(14px * var(--fs));
		color: var(--text-5);
	}

	.money {
		flex: none;
		min-width: 64px;
		font-size: calc(15px * var(--fs));
		font-weight: 700;
		text-align: right;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.hint {
		margin: -6px 0 12px;
		font-size: calc(12.5px * var(--fs));
		color: var(--text-4);
	}

	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 12px;
		padding: 12px 14px;
		border-radius: var(--r-input);
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
	}

	.status-text {
		flex: 1;
	}

	.aside {
		font-size: calc(12px * var(--fs));
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.ok {
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.error {
		background: var(--danger-tint);
		color: var(--danger);
	}

	p.error {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: var(--r-input);
		font-size: calc(13px * var(--fs));
	}

	.info {
		background: var(--sunken);
		color: var(--text-3);
	}

	.default-link,
	.saved {
		display: block;
		width: 100%;
		margin: 0 0 12px;
		padding: 6px;
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
		text-align: center;
		color: var(--sage-deep);
	}

	.default-link:disabled {
		color: var(--text-disabled);
	}

	.saved {
		font-weight: 500;
		color: var(--text-4);
	}
</style>
