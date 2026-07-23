<!--
	"Add Choreganized to your home screen" — the one-time install nudge on Home
	(→ plan 11). Modelled on EnablePush's prompt: it renders *nothing* until the
	browser says the app is actually installable, and it can be waved away for
	good.

	Only Chromium fires `beforeinstallprompt`, and only when the PWA criteria are
	met (manifest, icons, service worker, https) and the app isn't already
	installed — so this is Android/desktop-Chrome's affordance. iOS has no
	programmatic install; Safari users use the Share sheet, which needs no card.
-->
<script lang="ts">
	import Banner from '$lib/components/ui/Banner.svelte';
	import HousePlus from '@lucide/svelte/icons/house-plus';

	/** Asked once per device and remembered, like the push prompt beside it. */
	const DISMISSED_KEY = 'choreganized.install-prompt-dismissed';

	/**
	 * `beforeinstallprompt` isn't in the standard DOM lib — it's a Chromium
	 * extension. The two members we use are all it adds.
	 */
	type BeforeInstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	/** The stashed event: the browser's permission to *open* the install dialog. */
	let deferred = $state<BeforeInstallPromptEvent | null>(null);
	/** True until storage is read, so the card can't flash before we know. */
	let dismissed = $state(true);
	let installing = $state(false);

	$effect(() => {
		// Already an installed app? There is nothing to install.
		if (isStandalone()) return;

		dismissed = remembered();

		const onPrompt = (event: Event) => {
			// Suppress Chrome's own mini-infobar; we present the offer ourselves,
			// in the household's own surface, at a moment the reader is on Home.
			event.preventDefault();
			deferred = event as BeforeInstallPromptEvent;
		};
		const onInstalled = () => {
			deferred = null;
			remember();
		};

		window.addEventListener('beforeinstallprompt', onPrompt);
		window.addEventListener('appinstalled', onInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', onPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
	});

	const visible = $derived(!!deferred && !dismissed);

	async function install() {
		if (!deferred || installing) return;
		installing = true;
		try {
			await deferred.prompt();
			const choice = await deferred.userChoice;
			// The event is single-use whatever they chose. Accepting (or the
			// `appinstalled` that follows) records the answer; cancelling the OS
			// dialog just clears this offer — the browser may make a fresh one later.
			deferred = null;
			if (choice.outcome === 'accepted') remember();
		} catch {
			// A prompt already consumed, or one the browser refused to show. Nothing
			// to recover — drop the offer.
			deferred = null;
		} finally {
			installing = false;
		}
	}

	function dismiss() {
		dismissed = true;
		remember();
	}

	function isStandalone(): boolean {
		if (typeof window === 'undefined') return false;
		// iOS Safari uses the non-standard `navigator.standalone`; everyone else
		// exposes it through the display-mode media query.
		const iosStandalone = (navigator as { standalone?: boolean }).standalone === true;
		return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
	}

	/**
	 * Storage can be off entirely (private browsing, a locked-down profile);
	 * losing the memory only means the offer can return next visit.
	 */
	function remember() {
		try {
			localStorage.setItem(DISMISSED_KEY, '1');
		} catch {
			/* empty */
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

{#if visible}
	<Banner
		variant="info"
		title="Add to your home screen"
		detail="Install Choreganized for one-tap, full-screen access."
		action={installing ? 'Opening…' : 'Add'}
		disabled={installing}
		onclick={install}
		ondismiss={dismiss}
		dismissLabel="Not now"
	>
		{#snippet icon()}<HousePlus size={18} strokeWidth={1.9} />{/snippet}
	</Banner>
{/if}
