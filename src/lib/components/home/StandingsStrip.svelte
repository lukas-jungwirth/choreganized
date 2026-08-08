<!--
	Where you stand this month [8b] — one line, no scoreboard; the podium lives
	in Tasks → History. Hidden until somebody has scored, which the page decides.
-->
<script lang="ts">
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import AvatarStack from '$lib/components/ui/AvatarStack.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { messages } from '$lib/i18n';
	import type { HouseholdMember } from '$lib/server/services/household';
	import type { Standings } from '$lib/server/services/home';

	let { standings, members }: { standings: Standings; members: HouseholdMember[] } = $props();

	const m = messages();

	const title = $derived(
		standings.tiedForLead ? m.home.standings.tied : m.home.standings.rank(standings.rank)
	);

	const detail = $derived.by(() => {
		const { points, rival, tiedForLead, rank } = standings;
		if (tiedForLead) return m.home.standings.each(points);
		if (!rival) return m.home.standings.solo(points);
		return rank === 1
			? m.home.standings.ahead(points, rival.gap, rival.displayName)
			: m.home.standings.behind(points, rival.gap, rival.displayName);
	});
</script>

<Card href="/tasks/history">
	<div class="strip">
		<span class="crown"><CrownIcon size={20} /></span>
		<span class="text">
			<span class="title">{title}</span>
			<span class="detail">{detail}</span>
		</span>
		<AvatarStack {members} size={26} ringColor="var(--card)" />
	</div>
</Card>

<style>
	.strip {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
	}

	.crown {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 12px;
		background: var(--gold-tint);
		color: var(--gold);
	}

	.text {
		flex: 1;
		min-width: 0;
	}

	.title {
		display: block;
		font-size: calc(14.5px * var(--fs));
		font-weight: 700;
		line-height: 1.15;
	}

	.detail {
		display: block;
		margin-top: 1px;
		font-size: calc(12px * var(--fs));
		color: var(--text-4);
	}
</style>
