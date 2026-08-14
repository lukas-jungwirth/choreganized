<!--
	"The shops are closed on Monday — last shopping day is Saturday"
	(→ SPEC §3.6), on Home and on the Shopping tab.

	Two surfaces, one component, and it is mounted on both at once: the same
	notice, the same two answers, and answering on either screen puts it away on
	both (the state is a row, not a component flag). Home is where you find out;
	Shopping is where you do something about it.

	The answers post to the page's own `?/holidayNotice` action — thin wrappers
	on both routes over one service call, the way Home and Tasks already share
	their four task actions. The forms sit outside the banner and are submitted
	by its choices, because `Banner` renders its own controls; the optimistic
	`answered` is what makes the tap feel immediate, and the load that follows is
	what makes it true.
-->
<script lang="ts">
	import Banner from '$lib/components/ui/Banner.svelte';
	import { messages } from '$lib/i18n';
	import type { HolidayNotice } from '$lib/server/services/holidays';
	import type { CalendarDate } from '$lib/utils/dates';
	import { enhance } from '$app/forms';
	import Store from '@lucide/svelte/icons/store';

	type Props = {
		notice: HolidayNotice;
		/** The household's today — what "last shopping day is today" is measured against. */
		today: CalendarDate;
	};

	let { notice, today }: Props = $props();

	const m = messages();

	/**
	 * Answered on this screen, before the server has said so. Keyed by closure so
	 * a still-open tab that saw the *next* holiday arrive doesn't stay silent
	 * about it — `refetchOnFocus` can hand this component a different notice
	 * without ever unmounting it.
	 */
	let answered = $state<CalendarDate | null>(null);

	let tomorrowForm = $state<HTMLFormElement | null>(null);
	let dismissForm = $state<HTMLFormElement | null>(null);

	const title = $derived(m.holiday.closed(notice.closureDate, notice.closedDays));
	const detail = $derived(
		m.holiday.detail(m.holiday.names(notice.holidays), notice.lastOpenDay, today)
	);

	function answer(form: HTMLFormElement | null) {
		answered = notice.closureDate;
		form?.requestSubmit();
	}
</script>

{#if answered !== notice.closureDate}
	<Banner
		variant="info"
		{title}
		{detail}
		choices={[
			{ label: m.holiday.remindTomorrow, onclick: () => answer(tomorrowForm) },
			{ label: m.holiday.dismiss, onclick: () => answer(dismissForm) }
		]}
	>
		{#snippet icon()}<Store size={18} strokeWidth={1.9} />{/snippet}
	</Banner>
{/if}

<!-- Which closure is being answered travels with the answer: a tab left open
	 over the weekend would otherwise dismiss whatever notice is current now. -->
<form method="POST" action="?/holidayNotice" use:enhance bind:this={tomorrowForm} hidden>
	<input type="hidden" name="closureDate" value={notice.closureDate} />
	<input type="hidden" name="answer" value="tomorrow" />
</form>
<form method="POST" action="?/holidayNotice" use:enhance bind:this={dismissForm} hidden>
	<input type="hidden" name="closureDate" value={notice.closureDate} />
	<input type="hidden" name="answer" value="dismiss" />
</form>
