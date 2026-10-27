<!--
	Log in [5a]. The design's email field signs in with a code sent by email
	rather than a password (plan 31, SPEC §1.1): email → "Email me a code" →
	the code, then the "or" rule and Google. The Apple button stays out
	(DECISIONS #1). A deploy with no mail settings shows Google alone, as v1 did.
	Everything else is the design: logo tile, wordmark, tagline rule, footer
	line pinned to the bottom.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import googleG from '$lib/assets/google-g.svg';
	import logoMark from '$lib/assets/logo-mark.svg';
	import { emailOtp, signIn } from '$lib/auth-client';
	import Screen from '$lib/components/shell/Screen.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { messages } from '$lib/i18n';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const m = messages();

	const CODE_LENGTH = 6;

	let step = $state<'email' | 'code'>('email');
	let email = $state('');
	let code = $state('');
	let pending = $state<'google' | 'send' | 'verify' | null>(null);
	let clientError = $state<string | null>(null);

	const errorMessage = $derived(clientError ?? (data.signInFailed ? m.auth.failed : null));

	/** Better Auth's error codes → the catalog; anything else is "didn't complete". */
	function describe(error: { code?: string; status: number }, fallback: string): string {
		if (error.status === 429) return m.auth.tooManyRequests;
		switch (error.code) {
			case 'INVALID_OTP':
				return m.auth.wrongCode;
			case 'OTP_EXPIRED':
				return m.auth.codeExpired;
			case 'TOO_MANY_ATTEMPTS':
				return m.auth.tooManyAttempts;
			case 'INVALID_EMAIL':
				return m.auth.invalidEmail;
			case 'MAIL_SEND_FAILED':
				return m.auth.sendFailed;
			default:
				return fallback;
		}
	}

	async function continueWithGoogle() {
		pending = 'google';
		clientError = null;

		// On success the client redirects to Google — leave the button disabled.
		const { error } = await signIn.social({
			provider: 'google',
			callbackURL: '/',
			errorCallbackURL: '/login'
		});

		if (error) {
			pending = null;
			clientError = m.auth.failed;
		}
	}

	async function sendCode(event?: SubmitEvent) {
		event?.preventDefault();
		email = email.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			clientError = m.auth.invalidEmail;
			return;
		}
		pending = 'send';
		clientError = null;

		const { error } = await emailOtp.sendVerificationOtp({ email, type: 'sign-in' });

		pending = null;
		if (error) {
			clientError = describe(error, m.auth.sendFailed);
			return;
		}
		code = '';
		step = 'code';
	}

	async function verifyCode(event?: SubmitEvent) {
		event?.preventDefault();
		if (pending) return;
		pending = 'verify';
		clientError = null;

		const { error } = await signIn.emailOtp({ email, otp: code });

		if (error) {
			pending = null;
			clientError = describe(error, m.auth.failed);
			return;
		}
		// `/` sends a member home and anyone else to onboarding (or the invite
		// they opened before signing in). Leave the button busy until it lands.
		await goto('/', { invalidateAll: true });
	}

	function useDifferentEmail() {
		step = 'email';
		code = '';
		clientError = null;
	}

	/** iOS offers the code above the keyboard; filling it in is the tap that signs in. */
	function onCodeInput() {
		code = code.replace(/\D/g, '').slice(0, CODE_LENGTH);
		if (code.length === CODE_LENGTH) void verifyCode();
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
		{#if data.emailSignIn}
			{#if step === 'email'}
				<form class="email-form" onsubmit={sendCode} novalidate>
					<TextField
						label={m.auth.email}
						type="email"
						name="email"
						autocomplete="email"
						inputmode="email"
						autocapitalize="off"
						spellcheck="false"
						placeholder={m.auth.emailPlaceholder}
						bind:value={email}
						disabled={pending !== null}
						required
					/>
					<Button type="submit" disabled={pending !== null} aria-busy={pending === 'send'}>
						{pending === 'send' ? m.auth.sendingCode : m.auth.sendCode}
					</Button>
				</form>
			{:else}
				<form class="email-form" onsubmit={verifyCode} novalidate>
					<p class="sent" role="status">{m.auth.codeSent(email, data.codeMinutes)}</p>
					<TextField
						label={m.auth.code}
						name="code"
						autocomplete="one-time-code"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength={CODE_LENGTH}
						bind:value={code}
						oninput={onCodeInput}
						disabled={pending !== null}
						required
					/>
					<Button
						type="submit"
						disabled={pending !== null || code.length !== CODE_LENGTH}
						aria-busy={pending === 'verify'}
					>
						{pending === 'verify' ? m.auth.verifyingCode : m.auth.verifyCode}
					</Button>
					<div class="links">
						<button
							type="button"
							class="link"
							onclick={useDifferentEmail}
							disabled={pending !== null}
						>
							{m.auth.changeEmail}
						</button>
						<button
							type="button"
							class="link"
							onclick={() => sendCode()}
							disabled={pending !== null}
						>
							{m.auth.resendCode}
						</button>
					</div>
				</form>
			{/if}

			{#if errorMessage}
				<p class="error" role="alert">{errorMessage}</p>
			{/if}

			<div class="or" aria-hidden="true">
				<span class="rule"></span><span>{m.auth.or}</span><span class="rule"></span>
			</div>
		{/if}

		<button
			class="google"
			onclick={continueWithGoogle}
			disabled={pending !== null}
			aria-busy={pending === 'google'}
		>
			<img src={googleG} alt="" width="20" height="20" />
			{pending === 'google' ? m.auth.openingGoogle : m.auth.continueWithGoogle}
		</button>

		{#if errorMessage && !data.emailSignIn}
			<p class="error" role="alert">{errorMessage}</p>
		{/if}
	</div>

	<p class="footnote">{data.emailSignIn ? m.auth.footnoteEmail : m.auth.footnote}</p>
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

	.email-form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.sent {
		margin: 0;
		font-size: calc(14px * var(--fs));
		line-height: 1.5;
		color: var(--text-3);
	}

	/* The code reads as one word: wide-set digits, like the mail shows it. */
	.email-form :global(input[name='code']) {
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.3em;
	}

	.links {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}

	.link {
		padding: 4px 0;
		border: none;
		background: none;
		font-size: calc(13px * var(--fs));
		font-weight: 600;
		color: var(--sage);
	}

	.link:disabled {
		color: var(--text-4);
	}

	/* "or" between the two ways in [5a]. */
	.or {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 20px 0;
		font-size: calc(12px * var(--fs));
		color: var(--text-5);
	}

	.or .rule {
		flex: 1;
		height: 1px;
		background: var(--border);
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
