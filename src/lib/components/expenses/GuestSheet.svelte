<!--
	One guest [G5] (→ SPEC §11.15): where they stand, their name, "Include in
	new expenses", and removing them once they are settled. Opened from the
	Guests group in Expense settings [G4] and by tapping a guest on the balance
	card [G3]. The link box of plan 38's step 2 goes between the switch and
	Remove.

	Each part is a form of its own, posting to `?/updateGuest` or
	`?/removeGuest` on whichever page mounted the sheet. The switch saves as it
	flips; the name saves with its own button, which shows once it changed.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import UserRoundX from '@lucide/svelte/icons/user-round-x';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import CenterModal from '$lib/components/ui/CenterModal.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { messages } from '$lib/i18n';
	import type { ExpensePerson } from '$lib/server/services/expenses';
	import { DISPLAY_NAME_MAX } from '$lib/utils/household';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';

	type Props = {
		guest: ExpensePerson;
		/** Their balance; positive = owed. */
		balance: number;
		currency: string;
		/** "Include in new expenses" only means something under an equal default. */
		equalDefault: boolean;
		/** The running series removing them would stop. */
		series: string[];
		onclose: () => void;
	};

	let { guest, balance, currency, equalDefault, series, onclose }: Props = $props();

	const m = messages();

	let open = $state(true);
	let name = $state(untrack(() => guest.name));
	let includeInNew = $state(untrack(() => guest.includeInNew));
	let confirmOpen = $state(false);
	let submitting = $state(false);
	let error = $state<string | undefined>();
	let includeForm: HTMLFormElement | undefined = $state();

	$effect(() => {
		if (!open) onclose();
	});

	const amount = $derived(m.expenses.money(Math.abs(balance), currency));
	const renamed = $derived(name.trim() !== '' && name.trim() !== guest.name);
	const settled = $derived(balance === 0);

	const saving: SubmitFunction = () => {
		submitting = true;
		error = undefined;
		return async ({ result, update }) => {
			await update({ reset: false });
			submitting = false;
			if (result.type === 'failure') {
				error = typeof result.data?.error === 'string' ? result.data.error : undefined;
				// The switch shows what is stored, not what failed to be.
				includeInNew = guest.includeInNew;
			}
		};
	};

	const removing: SubmitFunction = () => {
		submitting = true;
		error = undefined;
		return async ({ result, update }) => {
			await update({ reset: false });
			submitting = false;
			if (result.type === 'failure') {
				error = typeof result.data?.error === 'string' ? result.data.error : undefined;
				return;
			}
			if (result.type === 'success') {
				confirmOpen = false;
				open = false;
			}
		};
	};
</script>

<BottomSheet bind:open title={guest.name} subtitle={m.expenses.guests.subtitle(balance, amount)}>
	<form method="POST" action="?/updateGuest" class="name" use:enhance={saving}>
		<input type="hidden" name="guestId" value={guest.id} />
		<TextField
			label={m.expenses.guests.name}
			name="name"
			bind:value={name}
			maxlength={DISPLAY_NAME_MAX}
			autocomplete="off"
			autocapitalize="words"
			required
		/>
		{#if renamed}
			<Button type="submit" variant="secondary" disabled={submitting}>
				{m.expenses.guests.saveName}
			</Button>
		{/if}
	</form>

	<form
		method="POST"
		action="?/updateGuest"
		class="row"
		class:disabled={!equalDefault}
		bind:this={includeForm}
		use:enhance={saving}
	>
		<input type="hidden" name="guestId" value={guest.id} />
		<input type="hidden" name="includeInNew" value={includeInNew ? 'on' : 'off'} />
		<span class="row-text">
			<span class="row-label">{m.expenses.guests.includeInNew}</span>
			<span class="row-detail">
				{equalDefault ? m.expenses.guests.includeInNewDetail : m.expenses.guests.includeOnlyEqual}
			</span>
		</span>
		<Toggle
			label={m.expenses.guests.includeInNew}
			bind:checked={includeInNew}
			disabled={!equalDefault || submitting}
			onchange={() => queueMicrotask(() => includeForm?.requestSubmit())}
		/>
	</form>

	{#if error && !confirmOpen}<p class="error" role="alert">{error}</p>{/if}

	<button
		type="button"
		class="remove"
		disabled={!settled}
		onclick={() => {
			error = undefined;
			confirmOpen = true;
		}}
	>
		{m.expenses.guests.remove}
	</button>
	{#if !settled}
		<p class="caption">{m.expenses.guests.removeWhenSettled(guest.name)}</p>
	{/if}

	<CenterModal bind:open={confirmOpen} label={m.expenses.guests.remove} dismissible={false}>
		<div class="well" aria-hidden="true"><UserRoundX size={26} strokeWidth={1.9} /></div>
		<h3>{m.expenses.guests.removeConfirm(guest.name)}</h3>
		<p class="copy">{m.expenses.guests.removeCopy}</p>
		{#if series.length > 0}<p class="series">{m.expenses.leaveSeries(series)}</p>{/if}
		{#if error}<p class="error">{error}</p>{/if}
		<form method="POST" action="?/removeGuest" use:enhance={removing}>
			<input type="hidden" name="guestId" value={guest.id} />
			<Button type="submit" variant="danger" disabled={submitting}>
				{m.expenses.guests.remove}
			</Button>
		</form>
		<button type="button" class="plain-cancel" onclick={() => (confirmOpen = false)}>
			{m.common.cancel}
		</button>
	</CenterModal>
</BottomSheet>

<style>
	.name {
		display: flex;
		flex-direction: column;
		gap: 10px;
		--input-surface: var(--field);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
		padding: 14px 16px;
		border: 1px solid var(--border);
		border-radius: var(--r-block);
	}

	.row-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row-label {
		font-size: var(--fs-16);
		font-weight: 600;
		color: var(--ink);
	}

	.row-detail {
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.disabled .row-label {
		color: var(--text-4);
	}

	.remove {
		display: block;
		width: 100%;
		margin-top: 18px;
		padding: 10px 6px;
		font-size: var(--fs-16);
		font-weight: 600;
		text-align: center;
		color: var(--danger);
	}

	.remove:disabled {
		color: var(--text-disabled);
		cursor: default;
	}

	.caption {
		margin: 0 4px;
		font-size: var(--fs-14);
		line-height: 1.45;
		text-align: center;
		color: var(--text-4);
	}

	.error {
		margin: 12px 0 0;
		font-size: var(--fs-15);
		color: var(--danger);
	}

	.well {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 60px;
		height: 60px;
		margin: 0 auto 18px;
		border-radius: 50%;
		background: var(--danger-tint);
		color: var(--danger);
	}

	h3 {
		margin-bottom: 10px;
		font-size: var(--fs-24);
		overflow-wrap: anywhere;
	}

	.copy {
		margin: 0 0 20px;
		font-size: var(--fs-16);
		line-height: 1.5;
		color: var(--text-4);
	}

	.series {
		margin: -6px 0 16px;
		font-size: var(--fs-15);
		line-height: 1.45;
		text-align: center;
		color: var(--text-3);
	}

	.plain-cancel {
		width: 100%;
		padding: 13px;
		font-size: var(--fs-17);
		font-weight: 700;
		color: var(--text-2);
	}
</style>
