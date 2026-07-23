<!--
	Members [6b] — who lives here, the invite that's live, and a way to add
	someone. The owner gets a ••• per housemate [6c]; everybody else gets the
	same list without it, because any member can invite but only the owner
	changes roles (→ DECISIONS #10).
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import ManageMemberSheet from '$lib/components/settings/ManageMemberSheet.svelte';
	import MemberRow from '$lib/components/settings/MemberRow.svelte';
	import SubHeader from '$lib/components/shell/SubHeader.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import RowGroup from '$lib/components/ui/RowGroup.svelte';
	import type { MemberProfile } from '$lib/server/services/household';
	import Plus from '@lucide/svelte/icons/plus';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let managing = $state<MemberProfile | null>(null);
	let working = $state(false);

	const owner = $derived(data.currentMember.role === 'owner');
	const error = $derived(form && 'error' in form ? form.error : undefined);
</script>

<svelte:head>
	<title>Members · Choreganized</title>
</svelte:head>

<SubHeader
	title="Members"
	subtitle={data.household.name}
	back="/settings"
	backLabel="Back to settings"
/>

<RowGroup list>
	{#each data.roster as member (member.id)}
		<MemberRow
			{member}
			you={member.id === data.currentMember.id}
			manageable={owner && member.id !== data.currentMember.id}
			today={data.today}
			onmanage={() => (managing = member)}
		/>
	{/each}
</RowGroup>

<!-- The pending-invite row [6b]. Anyone can read the code and pass it on; only
	 the owner can retire it or mint a new one (→ DECISIONS #10). -->
<div class="invite">
	<RowGroup>
		<div class="pending">
			<Avatar empty size={40}><Plus size={16} strokeWidth={2} /></Avatar>
			<div class="what">
				<p class="title">{data.formattedCode ? 'Pending invite' : 'No invite is live'}</p>
				<p class="detail">
					{data.formattedCode ? `Code ${data.formattedCode}` : 'Nobody can join with a code'}
				</p>
			</div>

			{#if owner}
				<form
					method="POST"
					action={data.inviteCode ? '?/revokeInvite' : '?/newInvite'}
					use:enhance={() => {
						working = true;
						return async ({ update }) => {
							await update({ reset: false });
							working = false;
						};
					}}
				>
					<button type="submit" class="link" class:danger={data.inviteCode} disabled={working}>
						{data.inviteCode ? 'Revoke' : 'New code'}
					</button>
				</form>
			{/if}
		</div>
	</RowGroup>
</div>

{#if error}<p class="error">{error}</p>{/if}

<!-- The invite screen is [5d], reached from onboarding and from here; `from`
	 tells it to close with "Done" rather than "Move in" (→ DECISIONS #28). -->
<Button href="/onboarding/invite?from=members">
	<Plus size={18} strokeWidth={2.2} />Invite housemate
</Button>

<p class="help">
	{#if owner}
		As the owner you can change roles or remove members. Everyone else can view this list and leave
		on their own.
	{:else}
		The owner changes roles and removes members. You can invite housemates, and leave on your own
		from Settings.
	{/if}
</p>

{#if managing}
	{@const member = managing}
	<ManageMemberSheet
		{member}
		points={data.points[member.id] ?? 0}
		today={data.today}
		onclose={() => (managing = null)}
	/>
{/if}

<style>
	.invite {
		margin: 16px 0 20px;
	}

	.pending {
		display: flex;
		align-items: center;
		gap: 13px;
		padding: 14px 16px;
	}

	.what {
		flex: 1;
		min-width: 0;
	}

	.title {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--text-4);
	}

	.detail {
		margin: 1px 0 0;
		font-size: 12.5px;
		color: var(--text-disabled);
		/* The code is the point of this row — keep it readable at 390px. */
		letter-spacing: 0.02em;
	}

	.link {
		flex: none;
		padding: 6px 2px;
		font-size: 12.5px;
		font-weight: 700;
		color: var(--sage);
	}

	.link.danger {
		color: var(--danger);
	}

	.link:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.error {
		margin: 0 4px 16px;
		font-size: 13px;
		color: var(--danger-deep);
	}

	.help {
		margin: 16px 0 0;
		padding: 0 6px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-5);
	}
</style>
