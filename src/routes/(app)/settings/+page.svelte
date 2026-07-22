<!--
	Settings [6a], Notifications section only — the rest arrives with plan 10.
	`RowGroup` is the block every section on this screen sits in; plan 10 adds
	its Account, Household and Away sections the same way.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import EnablePush from '$lib/components/EnablePush.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import Send from '@lucide/svelte/icons/send';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();

	let sending = $state(false);

	const result = $derived.by(() => {
		if (!form) return null;
		if (!form.configured) return 'Push isn’t configured on the server yet.';
		if (form.sent === 0) return 'No device is subscribed yet — switch it on above.';
		return form.sent === 1
			? 'Sent to this device — it should arrive in a moment.'
			: `Sent to ${form.sent} devices — they should arrive in a moment.`;
	});
</script>

<svelte:head>
	<title>Settings · Choreganized</title>
</svelte:head>

<SubHeader title="Settings" back="/home" />

<h2 class="section">Notifications</h2>

<RowGroup>
	<EnablePush />

	<form
		method="POST"
		action="?/testNotification"
		use:enhance={() => {
			sending = true;
			return async ({ update }) => {
				await update();
				sending = false;
			};
		}}
	>
		<button class="row" type="submit" disabled={sending}>
			<Send size={17} strokeWidth={1.9} />
			{sending ? 'Sending…' : 'Send test notification'}
		</button>
	</form>
</RowGroup>

{#if result}<p class="result">{result}</p>{/if}

<p class="soon">Profile, colour, household and away mode move in here next.</p>

<style>
	.section {
		margin: 0 4px 8px;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		width: 100%;
		min-height: 52px;
		padding: 15px 16px;
		font-size: 15px;
		font-weight: 600;
		color: var(--sage);
	}

	.row:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.result {
		margin: 10px 4px 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-4);
	}

	.soon {
		margin: 26px 4px 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-5);
	}
</style>
