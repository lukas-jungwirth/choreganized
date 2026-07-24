<!-- Invite your housemates [5d] — code, link, share, who's in so far. -->
<script lang="ts">
	import StepHeader from '$lib/components/onboarding/StepHeader.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { messages } from '$lib/i18n';
	import Link from '@lucide/svelte/icons/link';
	import Plus from '@lucide/svelte/icons/plus';
	import Share from '@lucide/svelte/icons/share';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout>;

	/**
	 * Web Share opens the OS share sheet (WhatsApp, Signal, AirDrop…) — worth its
	 * own button on a phone. Desktop browsers mostly lack it, and falling back to
	 * "copy" there would just duplicate the Copy on the link above, so the button
	 * only appears where it does something different. Resolved after mount, since
	 * the server can't know.
	 */
	let canShare = $state(false);
	$effect(() => {
		canShare = typeof navigator.share === 'function';
	});

	async function copyLink() {
		if (!data.inviteUrl) return;
		try {
			await navigator.clipboard.writeText(data.inviteUrl);
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard blocked (insecure context, permission) — the link is on
			// screen to copy by hand.
			copied = false;
		}
	}

	async function shareInvite() {
		if (!data.inviteUrl) return;
		try {
			await navigator.share({
				title: m.common.appName,
				text: m.onboarding.invite.shareText(data.householdName),
				url: data.inviteUrl
			});
		} catch {
			// Cancelled or unsupported — nothing to report.
		}
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.onboarding.invite.title)}</title>
</svelte:head>

<Screen>
	{#if data.fromMembers}
		<StepHeader back="/settings/members" backLabel={m.onboarding.invite.backToMembers} />
	{:else}
		<StepHeader step={2} />
	{/if}

	<header>
		<h1>{m.onboarding.invite.titleLead}<br />{m.onboarding.invite.titleRest}</h1>
		<p class="sub">{m.onboarding.invite.sub}</p>
	</header>

	{#if data.inviteCode && data.inviteUrl}
		<div class="code-card">
			<p class="code-label">{m.onboarding.invite.code}</p>
			<p class="code">{data.formattedCode}</p>
		</div>

		<!-- Grouped so the gap below stays the same with or without Share. -->
		<div class="link-actions">
			<div class="link">
				<Link size={17} strokeWidth={1.9} />
				<span class="url">{data.inviteUrl.replace(/^https?:\/\//, '')}</span>
				<button class="copy" onclick={copyLink}>
					{copied ? m.onboarding.invite.copied : m.onboarding.invite.copy}
				</button>
			</div>

			{#if canShare}
				<button class="share" onclick={shareInvite}>
					<Share size={18} strokeWidth={1.9} />
					{m.onboarding.invite.share}
				</button>
			{/if}
		</div>
	{:else}
		<p class="revoked">{m.onboarding.invite.revoked}</p>
	{/if}

	<p class="members-label">{m.onboarding.invite.members}</p>
	<ul class="members">
		{#each data.members as member (member.id)}
			<li class="member">
				<Avatar name={member.displayName} color={member.color} size={32} />
				<span class="name">
					{member.displayName}
					{#if member.id === data.currentMemberId}<span class="you">{m.settings.roster.you}</span
						>{/if}
				</span>
				{#if member.role === 'owner'}<span class="badge">{m.settings.roster.owner}</span>{/if}
			</li>
		{/each}
		{#if data.members.length < 2}
			<li class="member waiting">
				<Avatar empty size={32}><Plus size={14} strokeWidth={2} /></Avatar>
				<span class="name">{m.onboarding.invite.waiting}</span>
			</li>
		{/if}
	</ul>

	<!-- One way out: the invite stays reachable from Settings → Members, so a
		 second "later" link would just be the same button twice. Coming from
		 there you already live here, so it says "Done" (→ DECISIONS #28). -->
	<div class="cta">
		{#if data.fromMembers}
			<Button href="/settings/members">{m.onboarding.invite.done}</Button>
		{:else}
			<Button href="/home">{m.onboarding.invite.moveIn}</Button>
		{/if}
	</div>
</Screen>

<style>
	header {
		margin: 14px 0 22px;
	}

	h1 {
		font-size: 28px;
		line-height: 1.1;
	}

	.sub {
		margin: 8px 0 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--text-4);
	}

	.code-card {
		margin-bottom: 16px;
		padding: 20px;
		border-radius: var(--r-card);
		background: var(--sage);
		box-shadow: var(--shadow-button);
		text-align: center;
	}

	.code-label {
		margin: 0 0 10px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--on-sage);
		opacity: 0.75;
	}

	.code {
		margin: 0;
		font-family: var(--font-display);
		font-size: 38px;
		font-weight: 600;
		letter-spacing: 0.18em;
		/* The letter-spacing pushes the last glyph off-centre otherwise. */
		text-indent: 0.18em;
		color: var(--on-sage);
	}

	.link-actions {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 22px;
	}

	.link {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 13px 14px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-input);
		background: var(--card);
		color: var(--text-4);
	}

	.url {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13.5px;
		color: var(--text-2);
	}

	.copy {
		font-size: 13px;
		font-weight: 700;
		color: var(--sage);
	}

	.share {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		width: 100%;
		padding: 14px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-input);
		background: var(--card);
		font-size: 15px;
		font-weight: 700;
		color: var(--ink);
	}

	.revoked {
		margin: 0 0 22px;
		padding: 14px 16px;
		border-radius: var(--r-input);
		background: var(--sunken);
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--text-3);
	}

	.members-label {
		margin: 0 0 10px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-5);
	}

	.members {
		display: flex;
		flex-direction: column;
		gap: 9px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.member {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: var(--r-input);
		background: var(--card);
	}

	.name {
		flex: 1;
		font-size: 14.5px;
		font-weight: 600;
	}

	.you {
		font-weight: 500;
		color: var(--text-5);
	}

	.waiting .name {
		color: var(--text-disabled);
	}

	.badge {
		padding: 4px 10px;
		border-radius: var(--r-chip);
		background: var(--sage-tint);
		font-size: 11px;
		font-weight: 700;
		color: var(--sage);
	}

	.cta {
		margin-top: auto;
		padding-top: 18px;
	}
</style>
