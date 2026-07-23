<!--
	The holiday pause (→ SPEC §5.5), in the two places it's offered:

	- `sheet`: the block under the snooze presets [4c], where you arrived
		because a task needs pushing and discovered you can pause the lot.
	- `row`: the Away mode section of Settings [6a], where you went looking for
		it on purpose.

	One control, not two — SPEC §6 says "same control as 5.5", and the plan's
	acceptance says the two toggles are the same state. The form posts to
	`?/away` on whichever page it sits, and both pages' actions call the same
	`setAway`, so there is one answer to "am I away?" no matter which door you
	came through.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import DateField from '$lib/components/ui/DateField.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { addDays, formatDateLabel, formatShortDate, type CalendarDate } from '$lib/utils/dates';
	import { DEFAULT_AWAY_DAYS } from '$lib/utils/tasks';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import { tick, untrack } from 'svelte';

	type Props = {
		today: CalendarDate;
		/** The signed-in member's holiday state — the toggle's starting position. */
		awayUntil: CalendarDate | null;
		/** `sheet` sits in its own sunken well; `row` is a row of a white RowGroup. */
		surface?: 'sheet' | 'row';
	};

	let { today, awayUntil, surface = 'sheet' }: Props = $props();

	let away = $state(untrack(() => awayUntil !== null && awayUntil >= today));
	let returnDate = $state(untrack(() => awayUntil ?? addDays(today, DEFAULT_AWAY_DAYS)));
	let pausing = $state(false);
	let form: HTMLFormElement | undefined = $state();

	/**
	 * The server is the authority on whether you are away, and it doesn't always
	 * agree with the switch: `setAway` clamps a return date that has already
	 * passed to "not away" at all. So the position is re-read from the loaded
	 * value after every save — and whenever that value moves on its own, which
	 * is what a refetch on focus (`lib/refetch.ts`) or the other surface of this
	 * same control does. Never mid-save: that's the one moment the optimistic
	 * position is the truer one.
	 */
	function syncFromServer() {
		away = awayUntil !== null && awayUntil >= today;
		if (awayUntil) returnDate = awayUntil;
	}

	$effect(() => {
		void awayUntil;
		if (untrack(() => pausing)) return;
		untrack(syncFromServer);
	});

	/**
	 * Turning the pause **off** needs no date and no second tap, so it submits
	 * itself. After `tick`, the hidden field below has caught up with `away` and
	 * posts the empty value that clears the holiday.
	 */
	async function onAwayChange(checked: boolean) {
		if (checked) return;
		await tick();
		form?.requestSubmit();
	}
</script>

<form
	method="POST"
	action="?/away"
	class={surface}
	bind:this={form}
	use:enhance={() => {
		pausing = true;
		return async ({ update }) => {
			await update({ reset: false });
			pausing = false;
			// A clamped date (or a refusal) means the switch and the column
			// disagree; the column wins.
			await tick();
			syncFromServer();
		};
	}}
>
	<div class="holiday">
		<span class="tile" aria-hidden="true"><Volume2 size={19} strokeWidth={1.8} /></span>
		<div class="copy">
			<span class="title">Going away?</span>
			<span class="detail">
				Pause <b>all your tasks</b> while you're on holiday — nothing counts as overdue and no reminders
				are sent.
			</span>
		</div>
		<Toggle bind:checked={away} label="Going away" onchange={onAwayChange} />
	</div>

	<!-- The value the form posts, whether or not the picker is on screen:
		 empty clears the holiday (→ services/tasks.ts `setAway`). -->
	<input type="hidden" name="until" value={away ? returnDate : ''} />

	{#if away}
		<div class="until">
			<DateField
				label="Back on"
				bind:value={returnDate}
				caption={returnDate ? formatDateLabel(returnDate, today) : undefined}
				min={today}
			/>
			<Button type="submit" variant="secondary" disabled={pausing || !returnDate}>
				{awayUntil ? 'Update' : 'Pause'} my tasks until {returnDate
					? formatShortDate(returnDate)
					: '…'}
			</Button>
		</div>
	{/if}
</form>

<style>
	.holiday {
		display: flex;
		align-items: flex-start;
		gap: 13px;
		padding: 15px 16px;
	}

	/* In a sheet the control is its own sunken block; in a settings group the
	   white block around it already is one, so it stays flat. */
	.sheet .holiday {
		border-radius: var(--r-block);
		background: var(--field);
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 11px;
		background: var(--card);
		box-shadow: var(--shadow-card);
		color: var(--sage);
	}

	/* Sunken, so it reads as a tile rather than a card floating on a card. */
	.row .tile {
		background: var(--sage-tint);
		box-shadow: none;
	}

	.copy {
		flex: 1;
		min-width: 0;
	}

	.title {
		display: block;
		font-size: 15px;
		font-weight: 700;
	}

	.detail {
		display: block;
		margin-top: 3px;
		font-size: 12.5px;
		line-height: 1.4;
		color: var(--text-4);
	}

	.detail b {
		font-weight: 600;
		color: var(--text-2);
	}

	.until {
		margin-top: 14px;
	}

	.row .until {
		margin-top: 0;
		padding: 0 16px 16px;
	}

	form :global(.button) {
		margin-top: 20px;
	}
</style>
