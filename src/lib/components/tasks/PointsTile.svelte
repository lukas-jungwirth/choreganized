<!--
	One member's score this month [05] — avatar, name, "240 pts".

	Not a `Card`: the design draws these tiles a notch tighter than the list
	cards (`--r-input` rather than `--r-card`), which is what keeps a 48px-high
	tile from reading as a pill.
-->
<script lang="ts">
	import Avatar from '$lib/components/ui/Avatar.svelte';

	type Props = {
		displayName: string;
		color: string;
		points: number;
	};

	let { displayName, color, points }: Props = $props();
</script>

<div class="tile">
	<Avatar name={displayName} {color} size={26} />
	<div class="who">
		<span class="name">{displayName}</span>
		<span class="points">{points} pts</span>
	</div>
</div>

<style>
	.tile {
		display: flex;
		align-items: center;
		gap: 9px;
		/* Two fill the row; a third household member starts a scroll rather than
		   squeezing "Elisabeth" into an ellipsis. */
		flex: 1 0 calc(50% - 5px);
		min-width: 0;
		padding: 11px 14px;
		border-radius: var(--r-input);
		background: var(--card);
		box-shadow: var(--shadow-card);
	}

	.who {
		min-width: 0;
	}

	.name {
		display: block;
		overflow: hidden;
		font-size: 12px;
		line-height: 1;
		color: var(--text-4);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.points {
		display: block;
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 600;
		line-height: 1.2;
	}
</style>
