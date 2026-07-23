<!--
	"Enable notifications on this device" — the one control that turns web push
	on, in the two places it's offered (→ plan 05):

	- `settings` (default): the Notifications row in Settings [6a]. The real
		home; plan 10 adds the per-category toggles beside it.
	- `prompt`: the gentle one-time card on Home, which shows itself only when
		there is actually something to ask for and can be waved away for good.

	Both drive the same state machine, because there is only one answer per
	device and both surfaces must agree about it.
-->
<script lang="ts">
	import { env } from '$env/dynamic/public';
	import Banner from '$lib/components/ui/Banner.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { disablePush, enablePush, readPushState, type PushState } from '$lib/push-client';
	import Bell from '@lucide/svelte/icons/bell';

	type Props = {
		variant?: 'settings' | 'prompt';
	};

	let { variant = 'settings' }: Props = $props();

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
			error = failure instanceof Error ? failure.message : 'Something went wrong.';
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
				return 'This browser can’t show notifications. On iPhone, add Choreganized to your home screen first.';
			case 'unconfigured':
				return 'Push isn’t configured on the server yet.';
			case 'denied':
				return 'Notifications are blocked for Choreganized. Turn them back on in your browser’s site settings.';
			case 'subscribed':
				return 'Task reminders and shopping updates arrive here, even with the app closed.';
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
			title="Turn on notifications"
			detail={error ?? 'A nudge the morning a task is due. Nothing else.'}
			action={busy ? 'Enabling…' : 'Enable'}
			disabled={busy}
			onclick={() => apply(true)}
			ondismiss={dismiss}
			dismissLabel="Not now"
		>
			{#snippet icon()}<Bell size={18} strokeWidth={1.9} />{/snippet}
		</Banner>
	{/if}
{:else}
	<div class="device">
		<div class="row">
			<span class="label">Enable on this device</span>
			{#if actionable}
				<Toggle
					bind:checked
					disabled={busy}
					label="Enable notifications on this device"
					onchange={apply}
				/>
			{:else}
				<span class="status">{pushState === 'loading' ? '…' : 'Unavailable'}</span>
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
		font-size: 15px;
	}

	.status {
		font-size: 14px;
		color: var(--text-4);
	}

	.note {
		margin: 0;
		padding: 0 16px 14px;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--text-4);
	}

	.note.error {
		color: var(--danger);
	}
</style>
