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
	import LanguageSheet from '$lib/components/settings/LanguageSheet.svelte';
	import LeaveModal from '$lib/components/settings/LeaveModal.svelte';
	import PrefRow from '$lib/components/settings/PrefRow.svelte';
	import ProfileSheet from '$lib/components/settings/ProfileSheet.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import { LOCALE_NAMES, isLocale, messages } from '$lib/i18n';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Send from '@lucide/svelte/icons/send';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const m = messages();

	let editingProfile = $state(false);
	let choosingLanguage = $state(false);
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
		if (!form.configured) return m.settings.test.notConfigured;
		if (form.sent === 0) return m.settings.test.noDevice;
		return form.sent === 1 ? m.settings.test.sentOne : m.settings.test.sentMany(form.sent);
	});

	/** The row's value: the chosen language by its own name, else "System". */
	const languageValue = $derived(
		isLocale(data.chosenLocale) ? LOCALE_NAMES[data.chosenLocale] : m.settings.language.system
	);

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
	<title>{m.common.pageTitle(m.settings.title)}</title>
</svelte:head>

<SubHeader title={m.settings.title} back="/home" backLabel={m.common.backToHome} />

<Card radius="md">
	<div class="profile">
		<Avatar name={me.displayName} color={me.color} size={52} />
		<div class="who">
			<p class="name">{me.displayName}</p>
			<p class="email">{data.email}</p>
		</div>
		<button type="button" class="edit" onclick={() => (editingProfile = true)}>
			{m.common.edit}
		</button>
	</div>
</Card>

<h2 class="section">{m.settings.account}</h2>

<RowGroup>
	<button type="button" class="row" onclick={() => (editingProfile = true)}>
		<span class="label">{m.settings.displayName}</span>
		<span class="value">{me.displayName}</span>
		<ChevronRight size={15} strokeWidth={2} class="chevron" />
	</button>
	<button type="button" class="row" onclick={() => (editingProfile = true)}>
		<span class="label">{m.ui.yourColour}</span>
		<span class="swatch" style:background={me.color} aria-hidden="true"></span>
		<ChevronRight size={15} strokeWidth={2} class="chevron" />
	</button>
	<!-- Language sits under Account rather than Household: it is about the person
		 reading, not about the house (→ SPEC §6). -->
	<button type="button" class="row" onclick={() => (choosingLanguage = true)}>
		<span class="label">{m.settings.language.row}</span>
		<span class="value">{languageValue}</span>
		<ChevronRight size={15} strokeWidth={2} class="chevron" />
	</button>
</RowGroup>

<h2 class="section">{m.settings.notifications}</h2>

<RowGroup>
	<EnablePush />

	<PrefRow
		pref="notifyTaskReminders"
		label={m.settings.prefs.taskReminders}
		detail={m.settings.prefs.taskRemindersDetail}
		checked={data.prefs.notifyTaskReminders}
	/>
	<PrefRow
		pref="notifyOverdueNudges"
		label={m.settings.prefs.overdueNudges}
		detail={m.settings.prefs.overdueNudgesDetail}
		checked={data.prefs.notifyOverdueNudges}
	/>
	<PrefRow
		pref="notifyShoppingUpdates"
		label={m.settings.prefs.shoppingUpdates}
		detail={m.settings.prefs.shoppingUpdatesDetail}
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
			{sending ? m.settings.test.sending : m.settings.test.send}
		</button>
	</form>
</RowGroup>

{#if testResult}<p class="result">{testResult}</p>{/if}

<h2 class="section">{m.settings.awayMode}</h2>

<RowGroup>
	<AwayControl today={data.today} awayUntil={me.awayUntil} surface="row" />
</RowGroup>

<h2 class="section">{m.settings.household}</h2>

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
		<span class="label">{m.settings.members}</span>
		<span class="value">{data.members.length}</span>
		<ChevronRight size={15} strokeWidth={2} class="chevron" />
	</a>
</RowGroup>

<!-- No section label, like [6a]: the two ways out sit on their own. -->
<div class="exits">
	<RowGroup>
		<button type="button" class="row action quiet" onclick={endSession} disabled={signingOut}>
			<LogOut size={17} strokeWidth={1.9} />
			{signingOut ? m.settings.signingOut : m.settings.signOut}
		</button>
		<button type="button" class="row action danger" onclick={() => (leaving = true)}>
			<LogOut size={17} strokeWidth={1.9} />
			{m.settings.leave.label}
		</button>
	</RowGroup>

	{#if signOutFailed}
		<p class="result error">{m.settings.signOutFailed}</p>
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

{#if choosingLanguage}
	<LanguageSheet
		chosen={data.chosenLocale}
		deviceLocale={data.deviceLocale}
		onclose={() => (choosingLanguage = false)}
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
