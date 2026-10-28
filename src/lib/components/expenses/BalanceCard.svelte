<!--
	The one thing the tab is for [10a]: are we square? Answered as a sentence,
	the way you would say it — "Elisabeth owes you €24.50", "You owe Marco
	€12.00" — with the amount in the colour of the answer: sage when you are
	owed, terracotta when you owe. A plain card with a quiet check when nobody
	owes you anything, and nothing you owe.

	Built from the payments that would settle the whole house (→ SPEC §11.6):
	- one of them yours: the sentence names them, with one primary action —
	  Mark as paid (owed) or Settle up (owe) — and a gentle Remind when the
	  money is coming to you;
	- several [10a · 2] [10a · 3]: one sentence for the total, then a row per
	  person with Paid / Settle, and Remind everyone under them;
	- four or more [10a · 4]: the sentence counts instead of naming, and only the
	  two largest rows show until expanded.
	Payments between the others follow the sentence as a quiet line each
	("Elisabeth also owes Marco €8.40"), still a tap away from being recorded.

	Every Paid / Settle opens the settle-up sheet [9d] filled in for that
	payment, so a partial payment stays one edit away.
-->
<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import AvatarStack from '$lib/components/ui/AvatarStack.svelte';
	import { messages } from '$lib/i18n';
	import type { RichText } from '$lib/i18n/messages/en';
	import type { ExpensePerson } from '$lib/server/services/expenses';
	import type { Payment } from '$lib/utils/money';

	type Props = {
		/** The reader's balance; positive = owed. */
		balance: number;
		payments: Payment[];
		people: ExpensePerson[];
		me: string;
		currency: string;
		onsettle: (payment: Payment) => void;
	};

	let { balance, payments, people, me, currency, onsettle }: Props = $props();

	const m = messages();

	/** Rows beyond this many fold away until "Show N more" [10a · 4]. */
	const FOLDED = 2;
	const FOLD_FROM = 4;

	const byId = $derived(new Map(people.map((person) => [person.id, person])));
	const name = (id: string) => (id === me ? null : (byId.get(id)?.name ?? '?'));
	const money = (minor: number) => m.expenses.money(minor, currency);
	const mine = $derived(
		payments
			.filter((payment) => payment.from === me || payment.to === me)
			.sort((a, b) => b.amountMinor - a.amountMinor)
	);
	const others = $derived(payments.filter((payment) => payment.from !== me && payment.to !== me));
	const tone = $derived(
		mine.length === 0 ? 'settled' : balance > 0 ? 'owed' : balance < 0 ? 'owe' : 'settled'
	);
	/** The other end of each of your payments. */
	const counterparts = $derived(
		mine.map((payment) => byId.get(payment.from === me ? payment.to : payment.from))
	);
	const total = $derived(money(Math.abs(balance)));
	const sentence = $derived(
		(tone === 'owed' ? m.expenses.balance.owedBy : m.expenses.balance.youOwe)(
			counterparts.map((person) => person?.name ?? '?'),
			total
		)
	);

	let expanded = $state(false);
	const rows = $derived(mine.length >= FOLD_FROM && !expanded ? mine.slice(0, FOLDED) : mine);

	/** Someone who has left can't hear a nudge; Remind shows only for those who can. */
	const remindable = $derived(
		tone === 'owed' && counterparts.some((person) => person?.memberId != null)
	);
	/** Who the last Remind reached — `everyone` for Remind everyone. */
	let reminded = $state<{ target: string | null; reached: string[] } | null>(null);
	const remindedDone = (target: string | null) =>
		reminded !== null && reminded.target === target && reminded.reached.length > 0;
	const remindMissed = $derived(reminded !== null && reminded.reached.length === 0);
	// Who a nudge was about is only true of the debts it was sent over: once the
	// payments change (a settle-up, a new expense), the card starts fresh.
	$effect(() => {
		void payments;
		reminded = null;
	});

	const lineLabel = (payment: Payment) =>
		m.expenses.balance.lineLabel(name(payment.from), name(payment.to), money(payment.amountMinor));
</script>

{#snippet rich(text: RichText)}
	{#each text as part, index (index)}{#if part.strong}<strong>{part.text}</strong
			>{:else}{part.text}{/if}{/each}
{/snippet}

{#snippet between(also: boolean)}
	{#each others as payment (`${payment.from}-${payment.to}`)}
		<button
			type="button"
			class="between"
			aria-label={m.expenses.balance.settleLabel(m.expenses.balance.settleUp, lineLabel(payment))}
			onclick={() => onsettle(payment)}
		>
			{@render rich(
				m.expenses.balance.between(
					name(payment.from) ?? '?',
					name(payment.to) ?? '?',
					money(payment.amountMinor),
					also
				)
			)}
		</button>
	{/each}
{/snippet}

{#snippet remind(target: string | null, label: string, className: string)}
	<form
		method="POST"
		action="?/remind"
		class="remind-form"
		use:enhance={() =>
			async ({ result }) => {
				// A lapsed session redirects to sign-in, an error shows the error page.
				if (result.type !== 'success') return applyAction(result);
				// Nobody owes any more: the card was out of date (a payment recorded on
				// another phone). Redraw it from the ledger rather than blame anyone's
				// notifications.
				if (result.data?.owing === 0) return invalidateAll();
				const reached = result.data?.reminded;
				reminded = { target, reached: Array.isArray(reached) ? reached : [] };
			}}
	>
		{#if target}<input type="hidden" name="personId" value={target} />{/if}
		<button
			type="submit"
			class={className}
			disabled={remindedDone(target)}
			aria-label={target && !remindedDone(target)
				? m.expenses.balance.remindLabel(name(target) ?? '')
				: undefined}
		>
			{#if remindedDone(target)}
				<Check size={14} strokeWidth={2.6} aria-hidden="true" />
				{m.expenses.balance.reminded}
			{:else}
				{label}
			{/if}
		</button>
	</form>
{/snippet}

{#if tone === 'settled'}
	<section class="card settled" data-testid="balance-card">
		<span class="check" aria-hidden="true"><Check size={18} strokeWidth={2.2} /></span>
		<span class="settled-text">
			<h2 class="settled-title">{m.expenses.balance.settled}</h2>
			{#if others.length > 0}
				{@render between(false)}
			{:else}
				<p class="settled-detail">{m.expenses.balance.settledDetail}</p>
			{/if}
		</span>
	</section>
{:else}
	<section class="card {tone}" data-testid="balance-card">
		{#if mine.length > 1}
			<span class="stack">
				<AvatarStack
					members={counterparts.map((person, index) => ({
						id: person?.id ?? String(index),
						displayName: person?.name ?? '?',
						color: person?.color ?? 'var(--member-sage)'
					}))}
					size={24}
					ringColor="var(--card)"
				/>
			</span>
		{/if}
		<h2 class="sentence">{@render rich(sentence)}</h2>
		{@render between(true)}

		{#if mine.length === 1}
			{@const payment = mine[0]}
			<div class="actions">
				<button
					type="button"
					class="primary"
					aria-label={m.expenses.balance.settleLabel(
						tone === 'owed' ? m.expenses.balance.markPaid : m.expenses.balance.settleUp,
						lineLabel(payment)
					)}
					onclick={() => onsettle(payment)}
				>
					{tone === 'owed' ? m.expenses.balance.markPaid : m.expenses.balance.settleUp}
				</button>
				{#if remindable}
					{@render remind(payment.from, m.expenses.balance.remind, 'soft')}
				{/if}
			</div>
		{:else}
			<ul class="rows">
				{#each rows as payment (`${payment.from}-${payment.to}`)}
					{@const person = byId.get(payment.from === me ? payment.to : payment.from)}
					<li class="row">
						<Avatar name={person?.name} color={person?.color} size={28} />
						<span class="row-name">{person?.name ?? '?'}</span>
						<span class="row-amount">{money(payment.amountMinor)}</span>
						<button
							type="button"
							class="chip"
							aria-label={m.expenses.balance.settleLabel(
								tone === 'owed' ? m.expenses.balance.paid : m.expenses.balance.settle,
								lineLabel(payment)
							)}
							onclick={() => onsettle(payment)}
						>
							{tone === 'owed' ? m.expenses.balance.paid : m.expenses.balance.settle}
						</button>
					</li>
				{/each}
			</ul>
			{#if mine.length >= FOLD_FROM}
				<button
					type="button"
					class="more"
					class:open={expanded}
					aria-expanded={expanded}
					onclick={() => (expanded = !expanded)}
				>
					{expanded
						? m.expenses.balance.showLess
						: m.expenses.balance.showMore(mine.length - FOLDED)}
					<ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" />
				</button>
			{/if}
			{#if remindable}
				{@render remind(null, m.expenses.balance.remindEveryone, 'link')}
			{/if}
		{/if}

		{#if remindMissed}
			<p class="missed" role="status">
				{m.expenses.balance.remindOff(reminded?.target ? name(reminded.target) : null)}
			</p>
		{/if}
	</section>
{/if}

<style>
	.card {
		margin-bottom: 26px;
		padding: 22px 20px 20px;
		border-radius: var(--r-card-lg);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.owed {
		--tone: var(--owed);
		--fill: var(--sage);
		--soft: var(--sage-tint);
		--soft-ink: var(--sage-deep);
	}

	.owe {
		--tone: var(--owe);
		--fill: var(--terracotta);
		--soft: var(--terracotta-tint);
		--soft-ink: var(--terracotta-deep);
	}

	.stack {
		display: flex;
		margin-bottom: 12px;
	}

	.sentence {
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(27px * var(--fs));
		font-weight: 600;
		line-height: 1.2;
		color: var(--ink);
		text-wrap: pretty;
	}

	.sentence strong {
		font-weight: 600;
		color: var(--tone);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.between {
		display: block;
		margin-top: 6px;
		padding: 0;
		font-size: calc(14px * var(--fs));
		text-align: left;
		color: var(--text-4);
	}

	.between :global(strong) {
		font-weight: 600;
		color: var(--text-2);
		font-variant-numeric: tabular-nums;
	}

	.sentence + .between {
		margin-top: 8px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 18px;
	}

	.actions button,
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border-radius: var(--r-chip);
		font-weight: 700;
		white-space: nowrap;
	}

	.actions button {
		padding: 8px 15px;
		font-size: calc(14px * var(--fs));
	}

	.primary {
		background: var(--fill);
		color: var(--on-sage);
	}

	.soft,
	.chip {
		background: var(--soft);
		color: var(--soft-ink);
	}

	.soft:disabled {
		cursor: default;
	}

	.rows {
		margin: 16px 0 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 11px 0;
		border-top: 1px solid var(--divider);
	}

	.row-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-size: calc(15px * var(--fs));
		font-weight: 500;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-amount {
		flex: none;
		font-size: calc(15.5px * var(--fs));
		font-weight: 700;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.chip {
		flex: none;
		margin-left: 4px;
		padding: 6px 13px;
		font-size: calc(13.5px * var(--fs));
		font-weight: 600;
	}

	.more,
	.link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		width: 100%;
		padding: 12px 0 0;
		font-size: calc(14px * var(--fs));
		font-weight: 600;
		color: var(--sage-deep);
	}

	.more {
		border-top: 1px solid var(--divider);
	}

	.more :global(svg) {
		transition: transform 0.15s ease;
	}

	.more.open :global(svg) {
		transform: rotate(180deg);
	}

	.rows + .remind-form .link {
		border-top: 1px solid var(--divider);
	}

	.more + .remind-form .link {
		padding-top: 10px;
	}

	.link:disabled {
		cursor: default;
		color: var(--text-4);
	}

	.missed {
		margin: 10px 0 0;
		font-size: calc(12.5px * var(--fs));
		color: var(--text-4);
	}

	.settled {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 20px 18px;
	}

	.check {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		background: var(--sunken);
		color: var(--text-3);
	}

	.settled-text {
		min-width: 0;
	}

	.settled-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(26px * var(--fs));
		font-weight: 600;
		line-height: 1.1;
	}

	.settled-text .between {
		margin-top: 3px;
		font-size: calc(13px * var(--fs));
	}

	.settled-detail {
		margin: 3px 0 0;
		font-size: calc(13px * var(--fs));
		color: var(--text-4);
	}

	@media (prefers-reduced-motion: reduce) {
		.more :global(svg) {
			transition: none;
		}
	}
</style>
