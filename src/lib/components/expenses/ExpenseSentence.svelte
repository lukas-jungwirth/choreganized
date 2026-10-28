<!--
	Who paid, how much and what for, as one sentence [10b]: "You ⌄ paid €42.10
	for what?" — the way you would say it. The payer is a picker inside the
	sentence (a real <select>: the platform's own list on a phone, a keyboard
	for free), so picking Elisabeth reads "Elisabeth ⌄ paid".

	The words and where the two fields fall between them are the language's
	(`m.expenses.form.sentence` — German puts the verb last). The amount takes
	the focus on open, with a decimal keypad on a phone; either separator reads
	(→ `utils/money` `parseAmount`). Each field keeps its plain label for
	assistive tech ("Paid by", "Amount", "What for?"), since the sentence around
	it is only words.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { messages } from '$lib/i18n';
	import { EXPENSE_DESCRIPTION_MAX } from '$lib/utils/expenses';

	type Props = {
		amount: string;
		description: string;
		/** The payer's person id. */
		paidById: string;
		/** Who can have paid, in the order the household lists them. */
		people: { id: string; name: string }[];
		me: string;
		currency: string;
		autofocus?: boolean;
		/** The description field's own handlers — the sheet drives its suggestions. */
		describe?: Pick<HTMLInputAttributes, 'onfocus' | 'oninput' | 'onblur'>;
	};

	let {
		amount = $bindable(),
		description = $bindable(),
		paidById = $bindable(),
		people,
		me,
		currency,
		autofocus = false,
		describe = {}
	}: Props = $props();

	const m = messages();
	const id = $props.id();

	const parts = $derived(m.expenses.form.sentence(paidById === me));
</script>

<div class="box">
	<p class="sentence">
		{#each parts as part, index (index)}
			{#if typeof part === 'string'}
				<span class="words">{part}</span>
			{:else if part.field === 'payer'}
				<label class="field payer" for="{id}-payer">
					<select
						id="{id}-payer"
						name="paidById"
						bind:value={paidById}
						aria-label={m.expenses.form.paidBy}
					>
						{#each people as person (person.id)}
							<option value={person.id}>
								{person.id === me ? m.expenses.form.payerYou : person.name}
							</option>
						{/each}
					</select>
					<ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
				</label>
			{:else if part.field === 'amount'}
				<label class="field amount" for="{id}-amount">
					<span class="symbol" aria-hidden="true">{m.expenses.symbol(currency)}</span>
					<!-- The sheet opens to type the amount: the focus is the point (→ SPEC §11.3). -->
					<!-- svelte-ignore a11y_autofocus -->
					<input
						id="{id}-amount"
						name="amount"
						bind:value={amount}
						inputmode="decimal"
						autocomplete="off"
						placeholder="0"
						size={Math.max(amount.length, 3)}
						aria-label={m.expenses.form.amount}
						{autofocus}
						required
					/>
				</label>
			{:else}
				<label class="field what" for="{id}-what">
					<input
						id="{id}-what"
						name="description"
						bind:value={description}
						placeholder={m.expenses.form.whatPlaceholder}
						size={Math.max(description.length, m.expenses.form.whatPlaceholder.length)}
						maxlength={EXPENSE_DESCRIPTION_MAX}
						autocomplete="off"
						aria-label={m.expenses.form.whatFor}
						required
						{...describe}
					/>
				</label>
			{/if}
		{/each}
	</p>
</div>

<style>
	.box {
		padding: 18px 18px 20px;
		border-radius: var(--r-card);
		background: var(--field);
	}

	.sentence {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 10px 10px;
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(26px * var(--fs));
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
	}

	.words {
		white-space: nowrap;
	}

	.field {
		display: inline-flex;
		align-items: baseline;
		max-width: 100%;
		padding: 0 2px 3px;
		border-bottom: 2px solid var(--border-dashed);
		transition: border-color 0.15s ease;
	}

	.field:focus-within {
		border-bottom-color: var(--sage);
	}

	.symbol {
		color: var(--ink);
	}

	.payer {
		position: relative;
		align-items: center;
		gap: 4px;
		color: var(--text-5);
	}

	/* The chevron sits in the select's own padding, so the whole field is the target. */
	.payer :global(svg) {
		position: absolute;
		right: 4px;
		pointer-events: none;
	}

	select {
		padding: 0 22px 0 0;
		border: none;
		background: none;
		font: inherit;
		color: var(--ink);
		field-sizing: content;
		appearance: none;
		outline: none;
		cursor: pointer;
	}

	/* `size` is the width where `field-sizing` isn't supported yet (older Safari);
	   where it is, the field follows its content exactly. */
	input {
		min-width: 3ch;
		max-width: 100%;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: var(--ink);
		field-sizing: content;
		outline: none;
		caret-color: var(--sage);
	}

	.amount input {
		font-variant-numeric: tabular-nums;
	}

	.amount input:placeholder-shown {
		min-width: 4ch;
	}

	.what {
		min-width: 0;
	}

	.what input {
		min-width: 4ch;
	}

	input::placeholder {
		color: var(--text-disabled);
	}
</style>
