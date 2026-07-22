<!-- "Lukas invited you to Sonnengasse 12" [5e] — shown on the public landing and
	 above the join form once a code resolves. -->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';

	type Props = {
		householdName: string;
		inviter: { displayName: string; color: string } | null;
	};

	let { householdName, inviter }: Props = $props();
</script>

<div class="card">
	{#if inviter}
		<div class="avatar">
			<Avatar
				name={inviter.displayName}
				color={inviter.color}
				size={44}
				ring
				ringColor="var(--card)"
			/>
		</div>
		<p class="line"><b>{inviter.displayName}</b> invited you to</p>
	{:else}
		<p class="line">You've been invited to</p>
	{/if}
	<p class="household">{householdName}</p>
</div>

<style>
	.card {
		padding: 20px;
		border-radius: var(--r-card);
		background: var(--card);
		box-shadow: var(--shadow-card);
		text-align: center;
	}

	.avatar {
		display: flex;
		justify-content: center;
		margin-bottom: 12px;
	}

	.line {
		margin: 0;
		font-size: 14px;
		color: var(--text-4);
	}

	.line b {
		font-weight: 700;
		color: var(--ink);
	}

	.household {
		margin: 4px 0 0;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 600;
	}
</style>
