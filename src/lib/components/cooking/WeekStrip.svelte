<!--
	Mon–Sun with today in sage [04]. Deliberately not interactive: SPEC §4.1
	calls it "a visual anchor for the current week", and the meal rows directly
	below are already one tap target per day — two ways to open the same sheet,
	one of them invisible, would be a worse screen.
-->
<script lang="ts">
	import { messages } from '$lib/i18n';
	import type { WeekDay } from '$lib/server/services/meals';

	let { days }: { days: WeekDay[] } = $props();

	const m = messages();
</script>

<ol class="strip">
	{#each days as day (day.date)}
		<li class="day" class:today={day.isToday}>
			<span class="weekday">{day.weekday}</span>
			<span class="date">{day.dayOfMonth}</span>
			{#if day.isToday}<span class="sr-only">{m.cooking.week.today}</span>{/if}
		</li>
	{/each}
</ol>

<style>
	.strip {
		display: flex;
		gap: 5px;
		margin: 0 0 20px;
		padding: 0;
		list-style: none;
	}

	.day {
		flex: 1;
		/* Seven equal columns at 390px: without this the widest date decides. */
		min-width: 0;
		padding: 8px 0;
		border-radius: 12px;
		background: var(--sunken);
		text-align: center;
	}

	.weekday {
		display: block;
		font-size: 9px;
		font-weight: 700;
		color: var(--text-5);
	}

	.date {
		display: block;
		margin-top: 2px;
		font-size: 14px;
		font-weight: 700;
	}

	.today {
		background: var(--sage);
		color: var(--on-sage);
	}

	.today .weekday {
		color: inherit;
		opacity: 0.85;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
