<!--
	Log in [5a] — v1 is Google-only, so the design's email/password fields and
	Apple button are replaced by a single button in the same place (SPEC §1.1,
	DECISIONS #1). Everything else is the design: logo tile, wordmark, tagline
	rule, footer line pinned to the bottom.
-->
<script lang="ts">
	import googleG from '$lib/assets/google-g.svg';
	import logoMark from '$lib/assets/logo-mark.svg';
	import { signIn } from '$lib/auth-client';
	import Screen from '$lib/components/shell/Screen.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	let pending = $state(false);
	let clientError = $state<string | null>(null);

	const errorMessage = $derived(clientError ?? (data.signInFailed ? m.auth.failed : null));

	async function continueWithGoogle() {
		pending = true;
		clientError = null;

		// On success the client redirects to Google — leave the button disabled.
		const { error } = await signIn.social({
			provider: 'google',
			callbackURL: '/',
			errorCallbackURL: '/login'
		});

		if (error) {
			pending = false;
			clientError = m.auth.failed;
		}
	}
</script>

<svelte:head>
	<title>{m.common.pageTitle(m.auth.signIn)}</title>
</svelte:head>

<Screen>
	<div class="brand">
		<span class="tile"><img src={logoMark} alt="" width="40" height="40" /></span>
		<h1 class="wordmark">
			{m.auth.wordmarkLead}<span class="accent">{m.auth.wordmarkAccent}</span><span class="dot"
				>.</span
			>
		</h1>
		<p class="tagline">
			<span class="label">{m.auth.tagline}</span>
			<span class="rule"></span>
		</p>
	</div>

	<div class="actions">
		<button class="google" onclick={continueWithGoogle} disabled={pending} aria-busy={pending}>
			<img src={googleG} alt="" width="20" height="20" />
			{pending ? m.auth.openingGoogle : m.auth.continueWithGoogle}
		</button>

		{#if errorMessage}
			<p class="error" role="alert">{errorMessage}</p>
		{/if}
	</div>

	<p class="footnote">{m.auth.footnote}</p>
</Screen>

<style>
	.brand {
		margin: 26px 0 30px;
	}

	.tile {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		margin-bottom: 16px;
		border-radius: var(--r-card);
		background: var(--sage);
		box-shadow: var(--shadow-button);
	}

	.tile img {
		display: block;
	}

	.wordmark {
		font-size: calc(28px * var(--fs));
		letter-spacing: -0.01em;
	}

	.wordmark .accent {
		color: var(--sage);
	}

	.wordmark .dot {
		color: var(--terracotta);
	}

	.tagline {
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 12px 0 0;
	}

	.tagline .label {
		font-size: calc(10px * var(--fs));
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--text-4);
	}

	.tagline .rule {
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	/* Pushes the footnote to the bottom of the screen, as in the design. */
	.actions {
		margin-bottom: auto;
	}

	.google {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 16px;
		border: 1.5px solid var(--border);
		border-radius: var(--r-button);
		background: var(--card);
		box-shadow: var(--shadow-card);
		font-size: calc(16px * var(--fs));
		font-weight: 700;
		color: var(--ink);
		transition: transform 120ms ease-out;
	}

	.google:disabled {
		color: var(--text-4);
		cursor: default;
	}

	.google:active:not(:disabled) {
		transform: scale(0.99);
	}

	.error {
		margin: 14px 0 0;
		padding: 12px 14px;
		border: 1px solid var(--danger-border);
		border-radius: var(--r-input);
		background: var(--danger-tint);
		font-size: calc(13.5px * var(--fs));
		color: var(--danger-deep);
	}

	.footnote {
		margin: 20px 0 0;
		text-align: center;
		font-size: calc(13.5px * var(--fs));
		line-height: 1.5;
		color: var(--text-4);
	}

	@media (prefers-reduced-motion: reduce) {
		.google {
			transition: none;
		}
		.google:active:not(:disabled) {
			transform: none;
		}
	}
</style>
