<!--
	Where you stand this month [8b] — one line, no scoreboard; the podium lives
	in Tasks → History. Hidden until somebody has scored, which the page decides.
-->
<script lang="ts">
	import CrownIcon from '$lib/components/icons/CrownIcon.svelte';
	import AvatarStack from '$lib/components/ui/AvatarStack.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import type { HouseholdMember } from '$lib/server/services/household';
	import type { Standings } from '$lib/server/services/home';

	let { standings, members }: { standings: Standings; members: HouseholdMember[] } = $props();

	/** Households cap out at a handful of members, so a lookup beats an algorithm. */
	const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

	const title = $derived(
		standings.tiedForLead
			? "You're tied this month"
			: `You're ${ORDINALS[standings.rank - 1] ?? `${standings.rank}th`} this month`
	);

	const detail = $derived.by(() => {
		const points = `${standings.points} pts`;
		if (standings.tiedForLead) return `${points} each`;
		if (!standings.rival) return `${points} this month`;
		const direction = standings.rank === 1 ? 'ahead of' : 'behind';
		return `${points} · ${standings.rival.gap} ${direction} ${standings.rival.displayName}`;
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
		font-size: 14.5px;
		font-weight: 700;
		line-height: 1.15;
	}

	.detail {
		display: block;
		margin-top: 1px;
		font-size: 12px;
		color: var(--text-4);
	}
</style>
