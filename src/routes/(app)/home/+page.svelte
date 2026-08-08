<!--
	Home [8b] — greeting, the one chore that's on you, then whatever else the
	household currently has to say. Every card below the header is conditional: a
	fresh household sees the greeting, the invitation to plan dinner, and two
	zeroes (→ SPEC §2).

	Reading order is urgency: what you can do something about right now first,
	the summaries after it, and what the house has already done last.
-->
<script lang="ts">
	import EnablePush from '$lib/components/EnablePush.svelte';
	import InstallPrompt from '$lib/components/InstallPrompt.svelte';
	import ActivityCard from '$lib/components/home/ActivityCard.svelte';
	import DinnerCard from '$lib/components/home/DinnerCard.svelte';
	import NextChoreCard from '$lib/components/home/NextChoreCard.svelte';
	import StandingsStrip from '$lib/components/home/StandingsStrip.svelte';
	import StatTile from '$lib/components/home/StatTile.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import SnoozeSheet from '$lib/components/tasks/SnoozeSheet.svelte';
	import TaskDoneModal from '$lib/components/tasks/TaskDoneModal.svelte';
	import AvatarStack from '$lib/components/ui/AvatarStack.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import { messages } from '$lib/i18n';
	import type { NextChore } from '$lib/server/services/home';
	import type { CompletionResult, Standing } from '$lib/server/services/tasks';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Bell from '@lucide/svelte/icons/bell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	// You lead the stack — the design puts whoever is looking first [8b] [4e].
	const stack = $derived([
		data.currentMember,
		...data.members.filter((member) => member.id !== data.currentMember.id)
	]);

	const names = $derived(stack.map((member) => member.displayName).join(', '));

	const tasksLabel = $derived(m.home.stats.tasksDue(data.tasksDueCount));

	/** Ticked but not yet confirmed — the card goes quiet before the server agrees. */
	let pending = $state(false);
	/**
	 * The chore the snooze sheet is about, not a flag: a successful snooze moves
	 * the task out of the card's window, and the sheet has to survive its own
	 * closing animation after the data underneath it has already changed.
	 */
	let snoozing = $state<NextChore | null>(null);
	let done = $state<{ completion: CompletionResult; standing: Standing } | null>(null);

	/**
	 * The same handler shape the to-do list gives every check circle [4a], so
	 * ticking a chore off here raises the same celebration it does there.
	 */
	const complete: SubmitFunction = () => {
		pending = true;

		return async ({ result, update }) => {
			await update({ reset: false });
			pending = false;

			if (result.type !== 'success') return;
			const completed = result.data?.completed as typeof done;
			if (completed) done = completed;
		};
	};

	/**
	 * The banner counts what's already late; the card names the worst of it. With
	 * exactly one overdue chore they are the same task twice, so the banner stands
	 * down and lets the card — which can actually do something about it — speak.
	 */
	const showOverdueBanner = $derived(
		data.overdue !== null && !(data.nextChore !== null && data.overdue.count === 1)
	);
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.home.title)}</title>
</svelte:head>

<header>
	<div class="who">
		<p class="household">{data.household.name}</p>
		<h1>{m.home.greeting(data.greeting)},<br />{data.currentMember.displayName}</h1>
	</div>
	<!-- The household's faces are the way into the household's settings; the back
		 chevron [6a] opens with has to come from somewhere, and plan 10 can move
		 it if it finds a better door (→ DECISIONS #57). The link names the
		 housemates itself — Home is still the only screen that does. -->
	<a class="settings" href="/settings" aria-label={m.home.settingsLink(names)}>
		<AvatarStack members={stack} />
	</a>
</header>

<div class="stack">
	<!-- The one thing on this screen you can finish from this screen. -->
	{#if data.nextChore}
		{@const chore = data.nextChore}
		<NextChoreCard
			{chore}
			today={data.today}
			{pending}
			{complete}
			onsnooze={() => (snoozing = chore)}
		/>
	{/if}

	{#if data.overdue && showOverdueBanner}
		{@const overdue = data.overdue}
		<Banner
			title={m.home.overdue.count(overdue.count)}
			detail={m.home.overdue.detail(overdue.oldestName, overdue.mine)}
			action={m.home.overdue.view}
			href="/tasks"
		>
			{#snippet icon()}<Bell size={20} strokeWidth={2} />{/snippet}
		</Banner>
	{/if}

	<!-- Renders nothing unless push is genuinely available and unanswered on this
		 device; asks once, then never again. -->
	<EnablePush variant="prompt" />

	<!-- Same shape: shows only when the browser reports the app is installable and
		 not already installed, and can be dismissed for good. -->
	<InstallPrompt />

	<DinnerCard dinner={data.dinner} />

	<div class="stats">
		<StatTile
			href="/shopping"
			value={data.shoppingCount}
			label={m.home.stats.shopping}
			color="var(--sage)"
		>
			{#snippet icon()}<BasketIcon size={22} strokeWidth={1.8} />{/snippet}
		</StatTile>
		<StatTile href="/tasks" value={data.tasksDueCount} label={tasksLabel} color="var(--terracotta)">
			{#snippet icon()}<ChecklistIcon size={22} strokeWidth={1.8} />{/snippet}
		</StatTile>
	</div>

	{#if data.standings}
		<StandingsStrip standings={data.standings} members={data.members} />
	{/if}

	<!-- Last: nice to see, never the reason you opened the app. -->
	{#if data.activity.length > 0}
		<ActivityCard entries={data.activity} />
	{/if}
</div>

{#if snoozing}
	<SnoozeSheet
		task={snoozing}
		today={data.today}
		awayUntil={data.currentMember.awayUntil}
		onclose={() => (snoozing = null)}
	/>
{/if}

{#if done}
	<TaskDoneModal
		completion={done.completion}
		standing={done.standing}
		onclose={() => (done = null)}
	/>
{/if}

<style>
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 8px 0 20px;
	}

	/* Display names are free text up to 40 characters and the avatars can't
	   shrink, so without this a long one pushes the whole page sideways. */
	.who {
		min-width: 0;
	}

	/* The avatars are the whole target; the link adds nothing of its own. */
	.settings {
		display: inline-flex;
		flex: none;
	}

	.household,
	h1 {
		/* "Elisabeth-Charlotte" and "Sonnengasse 12/4/17" have nowhere to break. */
		overflow-wrap: anywhere;
	}

	.household {
		margin: 0 0 6px;
		font-size: calc(11px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	h1 {
		font-size: calc(27px * var(--fs));
		line-height: 1.05;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
</style>
