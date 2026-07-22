<!-- Invite your housemates [5d] — code, link, share, who's in so far. -->
<script lang="ts">
	import StepHeader from '$lib/components/onboarding/StepHeader.svelte';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Link, Plus, Share } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout>;

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
		if (!navigator.share) return copyLink();
		try {
			await navigator.share({
				title: 'Choreganized',
				text: `Join ${data.householdName} on Choreganized`,
				url: data.inviteUrl
			});
		} catch {
			// Cancelled or unsupported — nothing to report.
		}
	}
</script>

<svelte:head>
	<title>Invite your housemates · Choreganized</title>
</svelte:head>

<Screen>
	<StepHeader step={2} />

	<header>
		<h1>Invite your<br />housemates</h1>
		<p class="sub">They'll share the shopping list, tasks and meal plan with you.</p>
	</header>

	{#if data.inviteCode && data.inviteUrl}
		<div class="code-card">
			<p class="code-label">Invite code</p>
			<p class="code">{data.formattedCode}</p>
		</div>

		<div class="link">
			<Link size={17} strokeWidth={1.9} />
			<span class="url">{data.inviteUrl.replace(/^https?:\/\//, '')}</span>
			<button class="copy" onclick={copyLink}>{copied ? 'Copied' : 'Copy'}</button>
		</div>

		<button class="share" onclick={shareInvite}>
			<Share size={18} strokeWidth={1.9} />
			Share invite
		</button>
	{:else}
		<p class="revoked">
			This household has no active invite code. You can create a new one in Settings → Members.
		</p>
	{/if}

	<p class="members-label">Members</p>
	<ul class="members">
		{#each data.members as member (member.id)}
			<li class="member">
				<Avatar name={member.displayName} color={member.color} size={32} />
				<span class="name">
					{member.displayName}
					{#if member.id === data.currentMemberId}<span class="you">(you)</span>{/if}
				</span>
				{#if member.role === 'owner'}<span class="badge">Owner</span>{/if}
			</li>
		{/each}
		{#if data.members.length < 2}
			<li class="member waiting">
				<Avatar empty size={32}><Plus size={14} strokeWidth={2} /></Avatar>
				<span class="name">Waiting for someone to join…</span>
			</li>
		{/if}
	</ul>

	<div class="cta">
		<Button href="/home">Go to Choreganized</Button>
		<a class="later" href="/home">I'll invite them later</a>
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

	.link {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
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
		margin-bottom: 22px;
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
		text-align: center;
	}

	.later {
		display: inline-block;
		margin-top: 14px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-4);
	}
</style>
