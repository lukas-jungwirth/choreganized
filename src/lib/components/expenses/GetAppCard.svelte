<!--
	"Get the app" on a guest's page (→ SPEC §11.15): one quiet card under the
	list, for a guest who wants the same for their own household. Two answers
	on a row under the text (the pill-and-× shape squeezed the text into a
	column a word wide): "Get the app" opens the sign-in screen of this
	deploy, "No thanks" hides the card for good on this browser.

	The memory is per viewer and per browser, so it lives in localStorage, not
	on the server: a guest has no account to hang it on. Storage can be off
	(private browsing); then the card simply comes back next visit. It only
	appears after hydration, so a guest who closed it never sees it flash.
-->
<script lang="ts">
	import HousePlus from '@lucide/svelte/icons/house-plus';
	import Banner from '$lib/components/ui/Banner.svelte';
	import { messages } from '$lib/i18n';

	const m = messages();
	const DISMISSED_KEY = 'choreganized.guest-app-card-dismissed';

	let shown = $state(false);

	$effect(() => {
		shown = !remembered();
	});

	function dismiss() {
		shown = false;
		try {
			localStorage.setItem(DISMISSED_KEY, '1');
		} catch {
			/* storage off: the card returns next visit */
		}
	}

	function remembered(): boolean {
		try {
			return localStorage.getItem(DISMISSED_KEY) === '1';
		} catch {
			return false;
		}
	}
</script>

{#if shown}
	<div class="get-app" data-testid="get-app">
		<Banner
			variant="info"
			title={m.expenses.guestPage.getApp.title}
			detail={m.expenses.guestPage.getApp.detail}
			choices={[
				{
					label: m.expenses.guestPage.getApp.action,
					onclick: () => window.location.assign('/login')
				},
				{ label: m.expenses.guestPage.getApp.dismiss, onclick: dismiss }
			]}
		>
			{#snippet icon()}<HousePlus size={18} strokeWidth={1.9} />{/snippet}
		</Banner>
	</div>
{/if}

<style>
	.get-app {
		margin-top: 18px;
	}
</style>
