<!--
	Home [8b] — greeting, then whatever the household currently has to say.
	Every card below the header is conditional: a fresh household sees the
	greeting, the invitation to plan dinner, and two zeroes. Cards appear as
	plans 04/07/09 make their data exist (→ SPEC §2).
-->
<script lang="ts">
	import EnablePush from '$lib/components/EnablePush.svelte';
	import ActivityCard from '$lib/components/home/ActivityCard.svelte';
	import DinnerCard from '$lib/components/home/DinnerCard.svelte';
	import StandingsStrip from '$lib/components/home/StandingsStrip.svelte';
	import StatTile from '$lib/components/home/StatTile.svelte';
	import BasketIcon from '$lib/components/icons/BasketIcon.svelte';
	import ChecklistIcon from '$lib/components/icons/ChecklistIcon.svelte';
	import AvatarStack from '$lib/components/ui/AvatarStack.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// You lead the stack — the design puts whoever is looking first [8b] [4e].
	const stack = $derived([
		data.currentMember,
		...data.members.filter((member) => member.id !== data.currentMember.id)
	]);

	const names = $derived(stack.map((member) => member.displayName).join(', '));

	const tasksLabel = $derived(data.tasksDueCount === 1 ? 'task due today' : 'tasks due today');
</script>

<svelte:head>
	<title>Home · Choreganized</title>
</svelte:head>

<header>
	<div class="who">
		<p class="household">{data.household.name}</p>
		<h1>Good {data.greeting},<br />{data.currentMember.displayName}</h1>
	</div>
	<!-- The household's faces are the way into the household's settings; the back
		 chevron [6a] opens with has to come from somewhere, and plan 10 can move
		 it if it finds a better door (→ DECISIONS #57). The link names the
		 housemates itself — Home is still the only screen that does. -->
	<a class="settings" href="/settings" aria-label="Settings · Household: {names}">
		<AvatarStack members={stack} />
	</a>
</header>

<div class="stack">
	{#if data.overdue}
		{@const overdue = data.overdue}
		<Banner
			title={overdue.count === 1 ? '1 task overdue' : `${overdue.count} tasks overdue`}
			detail="{overdue.oldestName}{overdue.mine ? ' · your turn' : ''}"
			action="View"
			href="/tasks"
		>
			{#snippet icon()}<Bell size={20} strokeWidth={2} />{/snippet}
		</Banner>
	{/if}

	<!-- Renders nothing unless push is genuinely available and unanswered on this
		 device; asks once, then never again. -->
	<EnablePush variant="prompt" />

	{#if data.activity.length > 0}
		<ActivityCard entries={data.activity} />
	{/if}

	<DinnerCard dinner={data.dinner} />

	<div class="stats">
		<StatTile
			href="/shopping"
			value={data.shoppingCount}
			label="on shopping list"
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
</div>

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
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	h1 {
		font-size: 27px;
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
