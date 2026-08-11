<!--
	"Enable notifications on this device" — the one control that turns web push
	on, in the two places it's offered (→ plan 05):

	- `settings` (default): the only row in Settings' "This device" group [6a].
		The real home. The per-category switches sit in their own group above it,
		because they answer a different question — what you want to hear about,
		once for the account, rather than where it lands (→ DECISIONS #130).
	- `prompt`: the gentle one-time card on Home, which shows itself only when
		there is actually something to ask for and can be waved away for good.

	Both drive the same state machine, because there is only one answer per
	device and both surfaces must agree about it.
-->
<script lang="ts">
	import { env } from '$env/dynamic/public';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { messages } from '$lib/i18n';
	import { disablePush, enablePush, readPushState, type PushState } from '$lib/push-client';
	import Bell from '@lucide/svelte/icons/bell';

	type Props = {
		variant?: 'settings' | 'prompt';
	};

	let { variant = 'settings' }: Props = $props();

	const m = messages();

	/**
	 * Read here rather than passed in, so the component can be dropped into any
	 * screen (plan 10's Settings) without that screen's `load` knowing about
	 * push. Dynamic, not static: the key is set in Coolify's env at deploy time,
	 * long after `vite build` ran (→ ARCHITECTURE.md "Deployment").
	 */
	const vapidKey = env.PUBLIC_VAPID_PUBLIC_KEY ?? '';

	/** Asked once per device and remembered, so Home stops offering it. */
	const DISMISSED_KEY = 'choreganized.push-prompt-dismissed';

	let pushState = $state<PushState>('loading');
	let busy = $state(false);
	let error = $state<string | null>(null);
	/** The switch's own position: optimistic while in flight, corrected after. */
	let checked = $state(false);
	let dismissed = $state(true);

	// Everything below needs a browser: permission, an existing subscription,
	// localStorage. None of it can be answered while rendering on the server —
	// hence `dismissed` starting true, so the prompt can't flash before we know.
	$effect(() => {
		void refresh();
		dismissed = remembered();
	});

	async function refresh() {
		try {
			pushState = await readPushState(vapidKey);
		} catch {
			// A browser that won't even answer the question can't be subscribed.
			pushState = 'unsupported';
		}
		checked = pushState === 'subscribed';
	}

	async function apply(next: boolean) {
		if (busy) return;
		busy = true;
		error = null;

		try {
			pushState = next ? await enablePush(vapidKey) : await disablePush();
			// Switching off lands back in `prompt`, which is the state Home's card
			// asks on — so record it as an answer. Being told "no" in Settings and
			// then asking again on Home is exactly the nagging this is meant to
			// avoid.
			if (!next) remember();
		} catch (failure) {
			error = failure instanceof Error ? failure.message : m.enablePush.failed;
		} finally {
			busy = false;
			// Whatever the browser and the server actually agreed on wins over the
			// position the thumb left the switch in.
			checked = pushState === 'subscribed';
		}
	}

	function dismiss() {
		dismissed = true;
		remember();
	}

	/**
	 * Storage can be switched off entirely (Safari private browsing, a locked
	 * down profile). Losing the memory only means asking again next visit.
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

	/** Why the switch isn't the answer — shown only when there's something to say. */
	const note = $derived.by(() => {
		if (error) return error;

		switch (pushState) {
			case 'unsupported':
				return m.enablePush.unsupported;
			case 'unconfigured':
				return m.enablePush.unconfigured;
			case 'denied':
				return m.enablePush.denied;
			case 'subscribed':
				return m.enablePush.subscribed;
			// Nothing is wrong here — the switch is simply off. What still needs
			// saying is that it's off *here*, on this browser, and that turning it
			// on doesn't reach the other one (→ DECISIONS #130).
			case 'prompt':
				return m.enablePush.perDevice;
			default:
				return null;
		}
	});

	const actionable = $derived(pushState === 'prompt' || pushState === 'subscribed');
</script>

{#if variant === 'prompt'}
	<!-- Nothing to ask when it's already on, blocked, or impossible here. -->
	{#if pushState === 'prompt' && !dismissed}
		<Banner
			variant="info"
			title={m.enablePush.promptTitle}
			detail={error ?? m.enablePush.promptDetail}
			action={busy ? m.enablePush.enabling : m.enablePush.enable}
			disabled={busy}
			onclick={() => apply(true)}
			ondismiss={dismiss}
			dismissLabel={m.enablePush.notNow}
		>
			{#snippet icon()}<Bell size={18} strokeWidth={1.9} />{/snippet}
		</Banner>
	{/if}
{:else}
	<div class="device">
		<div class="row">
			<span class="label">{m.enablePush.row}</span>
			{#if actionable}
				<Toggle bind:checked disabled={busy} label={m.enablePush.toggle} onchange={apply} />
			{:else}
				<span class="status">{pushState === 'loading' ? '…' : m.enablePush.unavailable}</span>
			{/if}
		</div>
		{#if note}<p class="note" class:error>{note}</p>{/if}
	</div>
{/if}

<style>
	/* Padding matches the grouped rows in [6a]; the caller supplies the white
	   block and the dividers between this and its siblings. */
	.row {
		display: flex;
		align-items: center;
		gap: 13px;
		min-height: 52px;
		padding: 12px 16px;
	}

	.label {
		flex: 1;
		font-size: calc(15px * var(--fs));
	}

	.status {
		font-size: calc(14px * var(--fs));
		color: var(--text-4);
	}

	.note {
		margin: 0;
		padding: 0 16px 14px;
		font-size: calc(12.5px * var(--fs));
		line-height: 1.45;
		color: var(--text-4);
	}

	.note.error {
		color: var(--danger);
	}
</style>
