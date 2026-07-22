<!--
	Settings [6a] (→ SPEC §6). Five stacked sections in one scroll: who you are,
	what reaches your phone, whether you're away, the house itself, and the two
	ways out.

	Every section is a `RowGroup`; the rows are written here rather than as a
	component because their shapes differ (a chevron, a value, a switch, a
	centred action) and each is a handful of elements. The one row that repeats —
	a notification preference — is `PrefRow`.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { signOut } from '$lib/auth-client';
	import AwayControl from '$lib/components/AwayControl.svelte';
	import EnablePush from '$lib/components/EnablePush.svelte';
	import HomeIcon from '$lib/components/icons/HomeIcon.svelte';
	import HouseholdNameSheet from '$lib/components/settings/HouseholdNameSheet.svelte';
	import LeaveModal from '$lib/components/settings/LeaveModal.svelte';
	import PrefRow from '$lib/components/settings/PrefRow.svelte';
	import ProfileSheet from '$lib/components/settings/ProfileSheet.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Send from '@lucide/svelte/icons/send';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let editingProfile = $state(false);
	let renamingHousehold = $state(false);
	let leaving = $state(false);
	let sending = $state(false);
	let signingOut = $state(false);
	let signOutFailed = $state(false);

	const me = $derived(data.currentMember);
	const owner = $derived(me.role === 'owner');
	/** Everyone else's colours — the picker greys those out (SPEC §1.5). */
	const takenColors = $derived(
		data.members.filter((member) => member.id !== me.id).map((member) => member.color)
	);

	/**
	 * What the leave confirm has to say [6d]: the last member takes the household
	 * with them, and an owner with housemates has to hand it over first
	 * (→ SPEC §7).
	 */
	const leaveMode: 'leave' | 'last' | 'blocked' = $derived(
		data.members.length === 1 ? 'last' : owner ? 'blocked' : 'leave'
	);

	const testResult = $derived.by(() => {
		if (!form || !('sent' in form)) return null;
		if (!form.configured) return 'Push isn’t configured on the server yet.';
		if (form.sent === 0) return 'No device is subscribed yet — switch it on above.';
		return form.sent === 1
			? 'Sent to this device — it should arrive in a moment.'
			: `Sent to ${form.sent} devices — they should arrive in a moment.`;
	});

	/**
	 * Sign-out is the one action here that isn't a form: Better Auth owns the
	 * session cookie. If the round-trip fails the session is still live, and
	 * `/login` would bounce a signed-in user straight back — so say what happened
	 * and give the button back rather than navigating into a loop.
	 */
	async function endSession() {
		signingOut = true;
		signOutFailed = false;

		try {
			const { error } = await signOut();
			if (error) throw new Error(error.message);
		} catch {
			signOutFailed = true;
			signingOut = false;
			return;
		}

		// `invalidateAll` so nothing of this household is left in the client cache.
		await goto('/login', { invalidateAll: true });
	}
</script>

<svelte:head>
	<title>Settings · Choreganized</title>
</svelte:head>

<SubHeader title="Settings" back="/home" backLabel="Back to home" />

<Card radius="md">
	<div class="profile">
		<Avatar name={me.displayName} color={me.color} size={52} />
		<div class="who">
			<p class="name">{me.displayName}</p>
			<p class="email">{data.email}</p>
		</div>
		<button type="button" class="edit" onclick={() => (editingProfile = true)}>Edit</button>
	</div>
</Card>

<h2 class="section">Account</h2>

<RowGroup>
	<button type="button" class="row" onclick={() => (editingProfile = true)}>
		<span class="label">Display name</span>
		<span class="value">{me.displayName}</span>
		<ChevronRight size={15} strokeWidth={2} class="chevron" />
	</button>
	<button type="button" class="row" onclick={() => (editingProfile = true)}>
		<span class="label">Your colour</span>
		<span class="swatch" style:background={me.color} aria-hidden="true"></span>
		<ChevronRight size={15} strokeWidth={2} class="chevron" />
	</button>
</RowGroup>

<h2 class="section">Notifications</h2>

<RowGroup>
	<EnablePush />

	<PrefRow
		pref="notifyTaskReminders"
		label="Task reminders"
		detail="The morning a task of yours is due"
		checked={data.prefs.notifyTaskReminders}
	/>
	<PrefRow
		pref="notifyOverdueNudges"
		label="Overdue nudges"
		detail="One nudge the morning after it slipped"
		checked={data.prefs.notifyOverdueNudges}
	/>
	<PrefRow
		pref="notifyShoppingUpdates"
		label="Shopping list updates"
		detail="When a housemate adds to the list"
		checked={data.prefs.notifyShoppingUpdates}
	/>

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
		<button class="row action" type="submit" disabled={sending}>
			<Send size={17} strokeWidth={1.9} />
			{sending ? 'Sending…' : 'Send test notification'}
		</button>
	</form>
</RowGroup>

{#if testResult}<p class="result">{testResult}</p>{/if}

<h2 class="section">Away mode</h2>

<RowGroup>
	<AwayControl today={data.today} awayUntil={me.awayUntil} surface="row" />
</RowGroup>

<h2 class="section">Household</h2>

<RowGroup>
	{#if owner}
		<button type="button" class="row" onclick={() => (renamingHousehold = true)}>
			<span class="tile" aria-hidden="true"><HomeIcon size={18} strokeWidth={1.9} /></span>
			<span class="label">{data.household.name}</span>
			<ChevronRight size={15} strokeWidth={2} class="chevron" />
		</button>
	{:else}
		<!-- Only the owner renames the house (→ DECISIONS #10), so for everyone
			 else this is a fact, not a control — and it doesn't pretend to be one. -->
		<div class="row">
			<span class="tile" aria-hidden="true"><HomeIcon size={18} strokeWidth={1.9} /></span>
			<span class="label">{data.household.name}</span>
		</div>
	{/if}

	<a class="row" href="/settings/members">
		<span class="tile" aria-hidden="true"><UsersRound size={18} strokeWidth={1.9} /></span>
		<span class="label">Members</span>
		<span class="value">{data.members.length}</span>
		<ChevronRight size={15} strokeWidth={2} class="chevron" />
	</a>
</RowGroup>

<!-- No section label, like [6a]: the two ways out sit on their own. -->
<div class="exits">
	<RowGroup>
		<button type="button" class="row action quiet" onclick={endSession} disabled={signingOut}>
			<LogOut size={17} strokeWidth={1.9} />
			{signingOut ? 'Signing out…' : 'Sign out'}
		</button>
		<button type="button" class="row action danger" onclick={() => (leaving = true)}>
			<LogOut size={17} strokeWidth={1.9} />
			Leave household
		</button>
	</RowGroup>

	{#if signOutFailed}
		<p class="result error">Couldn’t sign out — check your connection and try again.</p>
	{/if}
</div>

{#if editingProfile}
	<ProfileSheet
		displayName={me.displayName}
		color={me.color}
		{takenColors}
		onclose={() => (editingProfile = false)}
	/>
{/if}

{#if renamingHousehold}
	<HouseholdNameSheet
		householdName={data.household.name}
		onclose={() => (renamingHousehold = false)}
	/>
{/if}

{#if leaving}
	<LeaveModal
		householdName={data.household.name}
		mode={leaveMode}
		onclose={() => (leaving = false)}
	/>
{/if}

<style>
	.profile {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 18px;
	}

	.who {
		flex: 1;
		min-width: 0;
	}

	.name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.email {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--text-4);
		overflow-wrap: anywhere;
	}

	.edit {
		flex: none;
		align-self: center;
		padding: 6px 4px;
		font-size: 13px;
		font-weight: 700;
		color: var(--sage);
	}

	.section {
		margin: 22px 4px 8px;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	/* The settings row [6a]: 52px tall, label left, value and chevron right. */
	.row {
		display: flex;
		align-items: center;
		gap: 13px;
		width: 100%;
		min-height: 52px;
		padding: 12px 16px;
		font-size: 15px;
		text-align: left;
		color: var(--ink);
	}

	.label {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.value {
		flex: none;
		font-size: 14px;
		color: var(--text-4);
	}

	.row :global(.chevron) {
		flex: none;
		margin-left: -6px;
		color: var(--border-dashed);
	}

	.swatch {
		flex: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}

	.tile {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		color: var(--sage);
	}

	/* A row that does something rather than leading somewhere: centred, coloured. */
	.action {
		justify-content: center;
		gap: 9px;
		font-weight: 600;
		color: var(--sage);
	}

	.action:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.quiet {
		color: var(--text-4);
	}

	.danger {
		color: var(--danger);
	}

	.result {
		margin: 10px 4px 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--text-4);
	}

	.result.error {
		color: var(--danger-deep);
	}

	/* The only block with no label above it, so it brings its own gap. */
	.exits {
		margin-top: 22px;
	}
</style>
