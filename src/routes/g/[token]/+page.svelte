<!--
	A guest's page [G6] [G7] (→ SPEC §11.15): the answer first, in the app's own
	sentence from the guest's side, then every expense and payment they are part
	of, newest first, each with their share alone. Nothing to do on it: no
	forms, no sign-in, no tab bar, no install prompt, no live stream. A reload
	shows the current state. Under the list, one "Get the app" card the guest
	can close for good (GetAppCard).

	The frames: `design/sketches/expense-guests.html` [G6] [G7].
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import GetAppCard from '$lib/components/expenses/GetAppCard.svelte';
	import CategoryIcon from '$lib/components/expenses/CategoryIcon.svelte';
	import LegalLinks from '$lib/components/legal/LegalLinks.svelte';
	import GuestBrand from '$lib/components/expenses/GuestBrand.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { messages } from '$lib/i18n';
	import type { RichText } from '$lib/i18n/messages/en';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();
	const g = m.expenses.guestPage;

	const guest = $derived(data.guest);
	const money = (minor: number) => m.expenses.money(minor, guest.currency);
	const memberNames = $derived(guest.members.map((member) => member.name));
	const owed = $derived(guest.payments.filter((payment) => payment.owe));
</script>

{#snippet rich(text: RichText)}
	{#each text as part, index (index)}{#if part.strong}<strong>{part.text}</strong
			>{:else}{part.text}{/if}{/each}
{/snippet}

<svelte:head>
	<title>{m.common.pageTitle(g.title(guest.name))}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Screen>
	<GuestBrand />

	<h1>{g.title(guest.name)}</h1>
	<p class="with">
		<span class="faces" aria-hidden="true">
			{#each guest.members as member, index (index)}
				<Avatar name={member.name} color={member.color} size={24} ring />
			{/each}
		</span>
		{g.sharedWith(memberNames)}
	</p>

	{#if guest.payments.length === 0}
		<section class="card settled" data-testid="guest-balance">
			<span class="check" aria-hidden="true"><Check size={20} strokeWidth={2.4} /></span>
			<span>
				<h2 class="settled-title">{g.settled}</h2>
				<span class="settled-detail">{g.settledDetail}</span>
			</span>
		</section>
	{:else}
		<section class="card answer" data-testid="guest-balance">
			{#each guest.payments as payment, index (index)}
				<h2 class="sentence" class:owe={payment.owe}>
					{@render rich(
						payment.owe
							? g.youOwe(payment.name, money(payment.amountMinor))
							: g.owesYou(payment.name, money(payment.amountMinor))
					)}
				</h2>
			{/each}
			<p class="hint">
				{owed.length > 0 ? g.payHint(owed.map((payment) => payment.name)) : g.owedHint}
			</p>
		</section>
	{/if}

	<h2 class="section">{g.shared}</h2>
	<div class="card list">
		{#if guest.items.length === 0}
			<p class="empty">{g.empty}</p>
		{:else}
			<ul>
				{#each guest.items as item, index (index)}
					{@const day = m.date.dayLabel(item.date, data.today)}
					<li>
						<CategoryIcon category={item.kind === 'expense' ? item.category : null} size={38} />
						{#if item.kind === 'expense'}
							<span class="what">
								<span class="title">{item.description}</span>
								<span class="meta">{g.paid(day, item.paidBy, money(item.amountMinor))}</span>
							</span>
							<span class="share">
								{g.yourShare}
								<strong>{money(item.shareMinor)}</strong>
							</span>
						{:else}
							<span class="what">
								<span class="title">{g.payment(item.from, item.to, money(item.amountMinor))}</span>
								<span class="meta">{day}</span>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="totals">
				<span>{g.totalPaid} <strong>{money(guest.paidMinor)}</strong></span>
				<span>{g.totalShare} <strong>{money(guest.shareMinor)}</strong></span>
			</p>
		{/if}
	</div>

	<GetAppCard />

	<footer class="foot">
		<p>{g.foot(memberNames)}</p>
		<LegalLinks links={data.legal} from={data.legalFrom} />
	</footer>
</Screen>

<style>
	h1 {
		margin: 0;
		font-size: var(--fs-32);
		line-height: 1.05;
		overflow-wrap: anywhere;
	}

	.with {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px 0 18px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.faces {
		display: inline-flex;
		flex: none;
	}

	.faces > :global(* + *) {
		margin-left: -8px;
	}

	.card {
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.answer {
		padding: 18px 16px;
	}

	.sentence {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-24);
		font-weight: 600;
		line-height: 1.2;
		color: var(--ink);
		text-wrap: balance;
	}

	.sentence + .sentence {
		margin-top: 6px;
	}

	.sentence :global(strong) {
		font-weight: 600;
		color: var(--owed);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.sentence.owe :global(strong) {
		color: var(--owe);
	}

	.hint {
		margin: 8px 0 0;
		font-size: var(--fs-15);
		line-height: 1.4;
		color: var(--text-4);
	}

	.settled {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 16px;
	}

	.check {
		display: grid;
		flex: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--sage-tint);
		color: var(--sage-deep);
	}

	.settled-title {
		margin: 0;
		font-size: var(--fs-22);
		line-height: 1.15;
	}

	.settled-detail {
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

	.list ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 14px;
	}

	.list li + li {
		border-top: 1px solid var(--divider);
	}

	.what {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.title {
		font-size: var(--fs-17);
		font-weight: 600;
		line-height: 1.25;
		color: var(--ink);
		overflow-wrap: anywhere;
	}

	.meta {
		font-size: var(--fs-15);
		color: var(--text-4);
		font-variant-numeric: tabular-nums;
	}

	.share {
		display: flex;
		flex: none;
		flex-direction: column;
		align-items: flex-end;
		font-size: var(--fs-14);
		line-height: 1.25;
		color: var(--text-4);
	}

	.share strong {
		font-size: var(--fs-16);
		font-weight: 700;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}

	.totals {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 4px 12px;
		margin: 0;
		padding: 12px 14px;
		border-top: 1px solid var(--divider);
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.totals strong {
		color: var(--ink);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.empty {
		margin: 0;
		padding: 16px;
		font-size: var(--fs-15);
		color: var(--text-4);
	}

	.foot {
		margin-top: auto;
		padding-top: 22px;
		text-align: center;
		font-size: var(--fs-14);
		line-height: 1.45;
		color: var(--text-5);
	}

	.foot p {
		margin: 0;
	}
</style>
